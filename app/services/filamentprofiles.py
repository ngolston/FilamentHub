"""3DFilamentProfiles.com community database sync service.

Fetches filaments from https://3dfilamentprofiles.com using the Next.js RSC
(React Server Components) wire format, parses and normalises the records,
then caches the result in memory + on disk.

RSC parsing approach ported from:
  https://github.com/jklewa/filament-profiles-data/blob/main/parser.py
"""

import asyncio
import hashlib
import json
import logging
import re
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL   = "https://3dfilamentprofiles.com"
CACHE_FILE = Path("/tmp/filamenthub_3dfp_cache.json")

_cache: dict[str, Any] = {
    "filaments": [],
    "synced_at": None,
}
_sync_lock = asyncio.Lock()

# ── RSC parsing ───────────────────────────────────────────────────────────────
# The site uses Next.js RSC streaming format:
#   Each line is  <refId>:<json>  where json may reference other lines via "$refId".
# We resolve all cross-references then find the filaments array.

_REF_USE_RE = re.compile(r'"\\?\$([a-z0-9]+)"')
_LINE_RE    = re.compile(r'^([a-z0-9]+):(.+)$')


def _parse_rsc(lines: list[str]) -> list[dict]:
    contents: dict[str, str] = {"undefined": "null"}
    deps: dict[str, list[str]]   = {}
    target_ref: str | None  = None
    fallback_refs: list[str] = []

    for line in lines:
        m = _LINE_RE.match(line.strip())
        if not m:
            continue
        ref, body = m.group(1), m.group(2)
        contents[ref] = body
        deps[ref] = _REF_USE_RE.findall(body)

        if '"filaments":' in body:
            rm = re.search(r'"filaments":\s*"\\?\$([a-z0-9]+)"', body)
            if rm:
                target_ref = rm.group(1)
        if '{"data":[{' in body:
            fallback_refs.append(ref)

    # Resolve references iteratively (single pass is usually enough)
    for ref in list(contents):
        body = contents[ref]
        for dep in deps.get(ref, []):
            if dep in contents:
                body = body.replace('"$' + dep + '"', contents[dep])
                body = body.replace('"\\$' + dep + '"', contents[dep])
        contents[ref] = body

    # Try the direct target first
    if target_ref and target_ref in contents:
        try:
            data = json.loads(contents[target_ref])
            if isinstance(data, list) and data and isinstance(data[0], dict):
                return data
        except Exception:
            pass

    # Fallback: walk data nodes looking for filament-shaped records
    for ref in fallback_refs:
        try:
            nodes = _find_filaments(json.loads(contents[ref]))
            if nodes:
                return nodes
        except Exception:
            continue

    return []


def _find_filaments(node: Any, depth: int = 0) -> list[dict]:
    if depth > 8:
        return []
    if isinstance(node, dict):
        data = node.get("data")
        if isinstance(data, list) and data and isinstance(data[0], dict) and "brand_name" in data[0]:
            return data
        for v in node.values():
            r = _find_filaments(v, depth + 1)
            if r:
                return r
    elif isinstance(node, list):
        for item in node:
            r = _find_filaments(item, depth + 1)
            if r:
                return r
    return []


# ── Data normalisation ────────────────────────────────────────────────────────

def _prop(f: dict, key: str) -> Any:
    """Get a property value, falling back to default_properties."""
    val = (f.get("properties") or {}).get(key)
    if val is None:
        val = (f.get("default_properties") or {}).get(key)
    return val


def _normalize(f: dict) -> dict:
    material      = (f.get("material") or "").strip()
    material_type = (f.get("material_type") or "").strip()
    full_material = (
        f"{material} {material_type}"
        if material_type and material_type.lower() != material.lower()
        else material
    )

    mt = material_type.lower()
    uid = hashlib.md5(f"3dfp:{f['id']}".encode()).hexdigest()[:14]

    spool_w = _prop(f, "spool_weight")
    price   = f.get("price_data") or {}
    sc      = f.get("short_code")

    return {
        "id":             uid,
        "source":         "3dfilamentprofiles",
        "manufacturer":   f.get("brand_name") or "Unknown",
        "name":           f.get("color") or "",
        "material":       full_material,
        "color_name":     f.get("color"),
        "color_hex":      f.get("rgb"),
        "diameter":       1.75,
        "weights":        [{"weight": 1000, "spool_weight": spool_w}],
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
        "multi_color":    any(x in mt for x in ("multicolor", "multi-color", "multi color", "gradient")),
        "product_url":    f.get("website") or price.get("href"),
        "profile_url":    f"{BASE_URL}/filaments/{sc}" if sc else None,
    }


# ── Disk cache ────────────────────────────────────────────────────────────────

def _load_from_disk() -> bool:
    try:
        if CACHE_FILE.exists():
            data = json.loads(CACHE_FILE.read_text())
            if data.get("filaments"):
                _cache.update(data)
                logger.info(
                    "Loaded 3DFilamentProfiles cache: %d entries synced at %s",
                    len(_cache["filaments"]), _cache.get("synced_at"),
                )
                return True
    except Exception as exc:
        logger.warning("Failed to load 3DFilamentProfiles disk cache: %s", exc)
    return False


def _save_to_disk() -> None:
    try:
        CACHE_FILE.write_text(json.dumps(_cache))
    except Exception as exc:
        logger.warning("Failed to save 3DFilamentProfiles disk cache: %s", exc)


# ── Core sync logic ───────────────────────────────────────────────────────────

async def _do_sync() -> None:
    logger.info("Starting 3DFilamentProfiles sync…")
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(60.0),
            headers={
                "User-Agent": "Mozilla/5.0 FilamentHub/1.0",
                "rsc":        "1",
            },
            follow_redirects=True,
        ) as client:
            resp = await client.get(f"{BASE_URL}/filaments")
            resp.raise_for_status()
            lines = resp.text.splitlines()

        raw = _parse_rsc(lines)
        if not raw:
            logger.warning("3DFilamentProfiles: RSC parse returned no filaments; keeping existing cache")
            return

        filaments = []
        for f in raw:
            if not f.get("deleted") and f.get("id"):
                try:
                    filaments.append(_normalize(f))
                except Exception as exc:
                    logger.debug("Skipping filament %s: %s", f.get("id"), exc)

        _cache["filaments"] = filaments
        _cache["synced_at"] = datetime.now(UTC).isoformat()
        _save_to_disk()
        logger.info("3DFilamentProfiles sync complete: %d entries", len(filaments))
    except Exception as exc:
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
