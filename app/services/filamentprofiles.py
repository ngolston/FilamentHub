"""3DFilamentProfiles.com community database sync service.

Strategy:
  1. Fetch /brands (RSC) → extract all ~1000 brand slugs.
  2. Fetch /filaments/{slug} concurrently for each brand → parse filament records.

The site is behind Vercel Bot Protection (TLS-fingerprint based).
curl_cffi with impersonate="chrome120" presents Chrome's exact TLS handshake
and passes the check transparently.
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

BASE_URL    = "https://3dfilamentprofiles.com"
CACHE_FILE  = Path("/tmp/filamenthub_3dfp_cache.json")
CONCURRENCY = 30
IMPERSONATE = "chrome120"

_cache: dict[str, Any] = {"filaments": [], "synced_at": None}
_sync_lock = asyncio.Lock()

# ── RSC helpers ───────────────────────────────────────────────────────────────

_LINE_RE      = re.compile(r'^([a-z0-9]+):(.+)$')
_BRAND_KEY_RE = re.compile(r'"brand_key":"([^"]+)"')


def _find_data_array(body: str) -> list[dict] | None:
    """Locate and parse the first `"data":[{...}]` array in an RSC line body."""
    idx = body.find('"data":[{')
    if idx == -1:
        return None
    arr_start = idx + 7  # points at '['
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


def _extract_filaments_from_rsc(text: str) -> list[dict]:
    """Pull the filament data array from a brand-page RSC response."""
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


def _get_brand_keys_from_rsc(text: str) -> list[str]:
    """Pull all unique brand_key values from the /brands RSC response."""
    keys: list[str] = []
    seen: set[str] = set()
    for m in _BRAND_KEY_RE.finditer(text):
        k = m.group(1)
        if k not in seen:
            seen.add(k)
            keys.append(k)
    return keys


# ── Normalisation ─────────────────────────────────────────────────────────────

def _prop(f: dict, key: str) -> Any:
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
    price = f.get("price_data") or {}

    return {
        "id":             uid,
        "source":         "3dfilamentprofiles",
        "manufacturer":   f.get("brand_name") or "Unknown",
        "name":           f.get("color") or "",
        "material":       full_material,
        "color_name":     f.get("color"),
        "color_hex":      f.get("rgb"),
        "diameter":       1.75,
        "weights":        [{"weight": 1000, "spool_weight": _prop(f, "spool_weight")}],
        "density":        None,
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
        "product_url":    f.get("website") or price.get("href"),
        "profile_url":    f"{BASE_URL}/filaments/{sc}" if sc else None,
    }


# ── Disk cache ────────────────────────────────────────────────────────────────

def _load_from_disk() -> bool:
    try:
        if CACHE_FILE.exists():
            data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            if data.get("filaments"):
                _cache.update(data)
                logger.info(
                    "Loaded 3DFilamentProfiles cache: %d entries (synced %s)",
                    len(_cache["filaments"]), _cache.get("synced_at"),
                )
                return True
    except OSError as exc:
        logger.warning("Failed to load 3DFilamentProfiles disk cache: %s", exc)
    except (json.JSONDecodeError, KeyError) as exc:
        logger.warning("Corrupt 3DFilamentProfiles disk cache: %s", exc)
    return False


def _save_to_disk() -> None:
    try:
        CACHE_FILE.write_text(json.dumps(_cache), encoding="utf-8")
    except OSError as exc:
        logger.warning("Failed to save 3DFilamentProfiles disk cache: %s", exc)


# ── Core sync ─────────────────────────────────────────────────────────────────

_COMMON_HEADERS = {
    "rsc":             "1",
    "User-Agent":      (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept":          "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer":         f"{BASE_URL}/",
}


async def _do_sync() -> None:
    logger.info("Starting 3DFilamentProfiles sync…")
    try:
        from curl_cffi.requests import AsyncSession  # type: ignore[import-untyped]
    except ImportError:
        logger.warning(
            "curl_cffi not installed — skipping 3DFilamentProfiles sync. "
            "Add curl_cffi>=0.7.0 to project dependencies."
        )
        return

    try:
        async with AsyncSession(impersonate=IMPERSONATE) as session:
            # Step 1: get all brand slugs from /brands
            r = await session.get(
                f"{BASE_URL}/brands",
                headers={**_COMMON_HEADERS, "Next-Url": "/brands"},
                timeout=60,
            )
            r.raise_for_status()
            brand_keys = _get_brand_keys_from_rsc(r.text)
            logger.info("3DFilamentProfiles: found %d brand slugs", len(brand_keys))
            if not brand_keys:
                logger.warning("3DFilamentProfiles: no brands found — skipping")
                return

            # Step 2: fetch each brand page concurrently (throttled)
            sem          = asyncio.Semaphore(CONCURRENCY)
            all_filaments: list[dict] = []
            errors       = 0

            async def fetch_brand(slug: str) -> list[dict]:
                nonlocal errors
                async with sem:
                    try:
                        resp = await session.get(
                            f"{BASE_URL}/filaments/{slug}",
                            headers={**_COMMON_HEADERS, "Next-Url": f"/filaments/{slug}"},
                            timeout=30,
                        )
                        if resp.status_code != 200:
                            return []
                        raw = _extract_filaments_from_rsc(resp.text)
                        return [
                            _normalize(item)
                            for item in raw
                            if item.get("id") and not item.get("deleted")
                        ]
                    except OSError as exc:
                        errors += 1
                        logger.debug("3DFP brand %s failed: %s", slug, exc)
                        return []

            results = await asyncio.gather(*[fetch_brand(s) for s in brand_keys])
            for batch in results:
                all_filaments.extend(batch)

        if errors:
            logger.info(
                "3DFilamentProfiles: %d/%d brand pages failed",
                errors, len(brand_keys),
            )

        # De-duplicate (same filament can appear under multiple brand pages)
        seen: set[str] = set()
        unique: list[dict] = []
        for item in all_filaments:
            if item["id"] not in seen:
                seen.add(item["id"])
                unique.append(item)

        _cache["filaments"] = unique
        _cache["synced_at"] = datetime.now(UTC).isoformat()
        _save_to_disk()
        logger.info(
            "3DFilamentProfiles sync complete: %d unique filaments from %d brands",
            len(unique), len(brand_keys),
        )

    except OSError as exc:
        logger.warning("3DFilamentProfiles sync failed (network): %s", exc)
    except Exception as exc:  # noqa: BLE001
        logger.warning("3DFilamentProfiles sync failed: %s", exc)


# ── Public API ────────────────────────────────────────────────────────────────

async def get_or_sync() -> dict:
    """Return cached data, syncing on first call."""
    if _cache["filaments"]:
        return _cache
    async with _sync_lock:
        if _cache["filaments"]:
            return _cache
        if not _load_from_disk():
            await _do_sync()
    return _cache


async def sync() -> dict:
    """Force a fresh sync."""
    async with _sync_lock:
        await _do_sync()
    return _cache
