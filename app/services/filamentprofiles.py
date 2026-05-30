"""3DFilamentProfiles.com — local database service.

Filament records are bundled in app/data/filament_profiles_db.json (generated
by scripts/fetch_3dfp.py).  The service loads that file on first call, so no
network request is needed for normal operation.

Calling sync() fetches fresh data from the site and overwrites the runtime
cache — it does NOT overwrite the bundled file automatically.
"""

import asyncio
import hashlib
import json
import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Bundled snapshot committed to the repo
BUNDLED_DB   = Path(__file__).parent.parent / "data" / "filament_profiles_db.json"
# Runtime disk cache (updated by sync())
CACHE_FILE   = Path("/tmp/filamenthub_3dfp_cache.json")

BASE_URL     = "https://3dfilamentprofiles.com"
CONCURRENCY  = 40
IMPERSONATE  = "chrome120"

_cache: dict[str, Any] = {"filaments": [], "synced_at": None, "sync_status": "idle"}
_sync_lock = asyncio.Lock()

# ── Load helpers ──────────────────────────────────────────────────────────────

def _load_file(path: Path) -> bool:
    """Load a JSON database file into the in-memory cache. Returns True on success."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        filaments = data.get("filaments", [])
        if not filaments:
            return False
        _cache["filaments"]   = filaments
        _cache["synced_at"]   = data.get("fetched_at") or data.get("synced_at")
        _cache["sync_status"] = "ready"
        logger.info(
            "3DFilamentProfiles: loaded %d filaments from %s",
            len(filaments), path.name,
        )
        return True
    except (OSError, json.JSONDecodeError, KeyError) as exc:
        logger.warning("3DFilamentProfiles: failed to load %s: %s", path, exc)
        return False


def _load() -> bool:
    """Try runtime cache first, then fall back to the bundled snapshot."""
    return _load_file(CACHE_FILE) or _load_file(BUNDLED_DB)

# ── Web sync (optional refresh) ───────────────────────────────────────────────

_LINE_RE      = re.compile(r'^([a-z0-9]+):(.+)$')
_BRAND_KEY_RE = re.compile(r'"brand_key":"([^"]+)"')

_HEADERS = {
    "rsc":             "1",
    "User-Agent":      (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept":          "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer":         f"{BASE_URL}/",
}


def _find_data_array(body: str) -> list[dict] | None:
    idx = body.find('"data":[{')
    if idx == -1:
        return None
    arr_start = idx + 7
    depth, in_str, escaped = 0, False, False
    end = -1
    for i, ch in enumerate(body[arr_start:], arr_start):
        if escaped:
            escaped = False
            continue
        if ch == "\\" and in_str:
            escaped = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end == -1:
        return None
    try:
        data = json.loads(body[arr_start : end + 1])
    except (json.JSONDecodeError, ValueError):
        return None
    if isinstance(data, list) and data and isinstance(data[0], dict) and "brand_name" in data[0]:
        return data
    return None


def _extract_filaments(text: str) -> list[dict]:
    for line in text.splitlines():
        if "brand_name" not in line:
            continue
        m = _LINE_RE.match(line.strip())
        if not m:
            continue
        result = _find_data_array(m.group(2))
        if result is not None:
            return result
    return []


def _prop(f: dict, key: str) -> Any:
    """Read from per-filament properties first, fall back to material-type defaults."""
    val = (f.get("properties") or {}).get(key)
    if val is None:
        val = (f.get("default_properties") or {}).get(key)
    return val


def _normalize(f: dict) -> dict:
    material      = (f.get("material") or "").strip()
    material_type = (f.get("material_type") or "").strip()
    full_material = (
        f"{material} {material_type}"
        if material_type and material_type.lower() not in (material.lower(), "")
        else material
    )
    mt    = material_type.lower()
    uid   = hashlib.md5(f"3dfp:{f['id']}".encode()).hexdigest()[:14]
    sc    = f.get("short_code")
    bk    = f.get("brand_key")
    price = f.get("price_data") or {}

    return {
        "id":             uid,
        "source":         "3dfilamentprofiles",
        "manufacturer":   f.get("brand_name") or "Unknown",
        "name":           f.get("color") or "",
        "material":       full_material,
        "color_name":     f.get("color"),
        "color_hex":      f.get("rgb"),
        "diameter":       (_prop(f, "diameter") or 1750) / 1000,
        "weights":        [{"weight": _prop(f, "nominal_weight") or 1000,
                            "spool_weight": _prop(f, "spool_weight")}],
        "density":        _prop(f, "density"),
        "print_temp_min": _prop(f, "temp_min"),
        "print_temp_max": _prop(f, "temp_max"),
        "bed_temp_min":   _prop(f, "bed_temp_min"),
        "bed_temp_max":   _prop(f, "bed_temp_max"),
        "glow":           "glow" in mt,
        "translucent":    any(x in mt for x in ("transparent", "clear", "translucent")),
        "finish":         material_type or None,
        "pattern":        None,
        "fill":           None,
        "is_metallic":    any(x in mt for x in ("metallic", "silk", "sparkle")),
        "is_carbon":      any(x in mt for x in ("carbon", "cf")),
        "is_wood":        "wood" in mt,
        "multi_color":    any(x in mt for x in ("multicolor", "multi-color", "gradient")),
        "product_url":    f.get("website") or f.get("default_website") or price.get("href"),
        "profile_url":    f"{BASE_URL}/filaments/{bk}/{sc}" if (bk and sc) else None,
        "flow_ratio":     _prop(f, "flow_ratio"),
        "fan_speed_min":  _prop(f, "fan_speed_min"),
        "fan_speed_max":  _prop(f, "fan_speed_max"),
        "max_vol_speed":  _prop(f, "max_volumetric_speed"),
    }


# All material type slugs available on the site
_MATERIAL_SLUGS = [
    "abs", "abs-plus", "apla", "asa", "asa-plus", "bvoh", "copa", "cpe",
    "hips", "ht-pla", "mabs", "pa", "pa12", "pa6", "pa612", "paht", "pbt",
    "pc", "pc-abs", "pc-pbt", "pcl", "pctg", "pe", "peba", "peek", "pei",
    "pekk", "pet", "petg", "petg-plus", "pha", "pipg", "pla", "pla-plus",
    "pmma", "pp", "ppa", "pps", "psu", "pva", "pvb", "pvdf", "san", "sbs",
    "smp", "tpe", "tpr", "tpu",
]

_BRAND_KEY_RE = re.compile(r'"brand_key":"([^"]+)"')


async def _do_sync() -> None:
    """Fetch fresh data from the web and update the runtime cache.

    Strategy:
      1. Fetch each /materials/{slug} page — these include per-filament and
         per-material-type default properties (temps, spool weight, density).
      2. Fetch each /filaments/{brand} page to pick up any filaments whose
         material type falls outside the known slug list.
      3. Merge both sets, deduplicating by Supabase record ID.
    """
    logger.info("3DFilamentProfiles: starting web sync…")
    _cache["sync_status"] = "syncing"
    try:
        from curl_cffi.requests import AsyncSession  # type: ignore[import-untyped]
    except ImportError:
        _cache["sync_status"] = "unavailable"
        logger.warning(
            "curl_cffi not installed — cannot refresh 3DFilamentProfiles data. "
            "The bundled snapshot will continue to be used."
        )
        return

    try:
        async with AsyncSession(impersonate=IMPERSONATE) as session:
            # ── Step 1: material pages (have temperatures + spool weights) ──
            mat_sem = asyncio.Semaphore(8)  # pages are large; be conservative
            errors  = 0
            raw_by_id: dict[int, dict] = {}

            async def fetch_material(slug: str) -> None:
                nonlocal errors
                async with mat_sem:
                    try:
                        resp = await asyncio.wait_for(
                            session.get(
                                f"{BASE_URL}/materials/{slug}",
                                headers={**_HEADERS, "Next-Url": f"/materials/{slug}"},
                            ),
                            timeout=120,
                        )
                        for item in (_extract_filaments(resp.text) if resp.status_code == 200 else []):
                            if item.get("id") and not item.get("deleted"):
                                raw_by_id[item["id"]] = item
                    except (OSError, asyncio.TimeoutError):
                        errors += 1

            await asyncio.gather(*[fetch_material(s) for s in _MATERIAL_SLUGS])
            logger.info("3DFilamentProfiles: %d records from material pages (%d errors)",
                        len(raw_by_id), errors)

            # ── Step 2: brand pages (catch material types not in slug list) ──
            r = await session.get(
                f"{BASE_URL}/brands",
                headers={**_HEADERS, "Next-Url": "/brands"},
                timeout=60,
            )
            brand_keys: list[str] = []
            seen_bk: set[str] = set()
            for m in _BRAND_KEY_RE.finditer(r.text):
                k = m.group(1)
                if k not in seen_bk:
                    seen_bk.add(k)
                    brand_keys.append(k)

            brand_sem   = asyncio.Semaphore(CONCURRENCY)
            brand_errors = 0

            async def fetch_brand(slug: str) -> None:
                nonlocal brand_errors
                async with brand_sem:
                    try:
                        resp = await asyncio.wait_for(
                            session.get(
                                f"{BASE_URL}/filaments/{slug}",
                                headers={**_HEADERS, "Next-Url": f"/filaments/{slug}"},
                            ),
                            timeout=10,
                        )
                        for item in (_extract_filaments(resp.text) if resp.status_code == 200 else []):
                            # Only add if not already captured by material pages
                            if item.get("id") and not item.get("deleted") and item["id"] not in raw_by_id:
                                raw_by_id[item["id"]] = item
                    except (OSError, asyncio.TimeoutError):
                        brand_errors += 1

            await asyncio.gather(*[fetch_brand(s) for s in brand_keys])
            logger.info("3DFilamentProfiles: %d total records after brand pages (%d brand errors)",
                        len(raw_by_id), brand_errors)

        seen_ids: set[str]    = set()
        unique:   list[dict]  = []
        for item in raw_by_id.values():
            norm = _normalize(item)
            if norm["id"] not in seen_ids:
                seen_ids.add(norm["id"])
                unique.append(norm)

        _cache["filaments"]   = unique
        _cache["synced_at"]   = datetime.now(UTC).isoformat()
        _cache["sync_status"] = "ready"

        # Persist to runtime cache (does not overwrite bundled file)
        try:
            CACHE_FILE.write_text(
                json.dumps({"filaments": unique, "fetched_at": _cache["synced_at"]}),
                encoding="utf-8",
            )
        except OSError as exc:
            logger.warning("3DFilamentProfiles: could not write runtime cache: %s", exc)

        logger.info(
            "3DFilamentProfiles: web sync complete — %d filaments (%d errors)",
            len(unique), errors,
        )

    except OSError as exc:
        _cache["sync_status"] = "error"
        logger.warning("3DFilamentProfiles: web sync failed (network): %s", exc)
    except Exception as exc:  # noqa: BLE001
        _cache["sync_status"] = "error"
        logger.warning("3DFilamentProfiles: web sync failed: %s", exc)


# ── Public API ────────────────────────────────────────────────────────────────

async def get_or_sync() -> dict:
    """Return filament data, loading from the bundled snapshot on first call."""
    if _cache["filaments"]:
        return _cache
    async with _sync_lock:
        if not _cache["filaments"]:
            _load()
    return _cache


async def sync() -> dict:
    """Fetch fresh data from the web (triggered by 'Check for updates')."""
    async with _sync_lock:
        await _do_sync()
    return _cache
