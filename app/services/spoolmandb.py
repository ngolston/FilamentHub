"""SpoolmanDB community filament database sync service.

Fetches manufacturer JSON files from GitHub, expands color/diameter variants
into individual records, and caches the result in memory + on disk.
"""

import asyncio
import hashlib
import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com/repos/Donkie/SpoolmanDB"
CACHE_FILE = Path("/tmp/filamenthub_spoolmandb_cache.json")

_cache: dict[str, Any] = {
    "filaments":         [],
    "synced_at":         None,
    "contributor_count": 0,
}
_sync_lock = asyncio.Lock()


# ── Parsing helpers ───────────────────────────────────────────────────────────

def _parse_temp(entry: dict, key: str, range_key: str) -> tuple[int | None, int | None]:
    rng = entry.get(range_key)
    if rng and isinstance(rng, dict):
        return rng.get("min"), rng.get("max")
    val = entry.get(key)
    if val is not None:
        return int(val), int(val)
    return None, None


def _color_hex(color: dict) -> str | None:
    raw = color.get("hex") or (color.get("hexes") or [None])[0]
    if not raw:
        return None
    return f"#{raw}" if not raw.startswith("#") else raw


def _expand_manufacturer(data: dict) -> list[dict]:
    manufacturer = data.get("manufacturer", "Unknown")
    results: list[dict] = []

    for entry_idx, entry in enumerate(data.get("filaments", [])):
        colors    = entry.get("colors", [{}])
        diameters = entry.get("diameters", [1.75])
        weights   = entry.get("weights", [{"weight": 1000, "spool_weight": None}])
        material  = entry.get("material", "")

        pt_min, pt_max = _parse_temp(entry, "extruder_temp", "extruder_temp_range")
        bt_min, bt_max = _parse_temp(entry, "bed_temp",      "bed_temp_range")

        finish  = (entry.get("finish") or "").lower()
        pattern = (entry.get("pattern") or "").lower()
        fill    = (entry.get("fill") or "").lower()
        mat_low = material.lower()

        is_metallic = finish == "metallic"
        is_carbon   = "cf" in mat_low or "carbon" in mat_low or "carbon" in fill
        is_wood     = "wood" in mat_low or "wood" in fill

        for color_idx, color in enumerate(colors):
            color_name  = color.get("name")
            raw_name    = entry.get("name", color_name or "Unknown")
            name        = raw_name.replace("{color_name}", color_name or "").strip()
            hex_val     = _color_hex(color)
            translucent = entry.get("translucent", False) or color.get("translucent", False)
            multi_color = "hexes" in color and len(color.get("hexes", [])) > 1

            for diameter in diameters:
                uid = hashlib.md5(
                    f"{manufacturer}:{entry_idx}:{color_idx}:{diameter}".encode()
                ).hexdigest()[:14]

                results.append({
                    "id":            uid,
                    "manufacturer":  manufacturer,
                    "name":          name,
                    "material":      material,
                    "color_name":    color_name,
                    "color_hex":     hex_val,
                    "diameter":      diameter,
                    "weights":       weights,
                    "density":       entry.get("density"),
                    "print_temp_min": pt_min,
                    "print_temp_max": pt_max,
                    "bed_temp_min":   bt_min,
                    "bed_temp_max":   bt_max,
                    "glow":           entry.get("glow", False),
                    "translucent":    translucent,
                    "finish":         entry.get("finish"),
                    "pattern":        entry.get("pattern"),
                    "fill":           entry.get("fill"),
                    "is_metallic":    is_metallic,
                    "is_carbon":      is_carbon,
                    "is_wood":        is_wood,
                    "multi_color":    multi_color,
                })

    return results


# ── Disk cache ────────────────────────────────────────────────────────────────

def _load_from_disk() -> bool:
    try:
        if CACHE_FILE.exists():
            data = json.loads(CACHE_FILE.read_text())
            if data.get("filaments"):
                _cache.update(data)
                logger.info(
                    "Loaded SpoolmanDB cache from disk: %d entries synced at %s",
                    len(_cache["filaments"]), _cache.get("synced_at"),
                )
                return True
    except Exception as exc:
        logger.warning("Failed to load SpoolmanDB disk cache: %s", exc)
    return False


def _save_to_disk() -> None:
    try:
        CACHE_FILE.write_text(json.dumps(_cache))
    except Exception as exc:
        logger.warning("Failed to save SpoolmanDB disk cache: %s", exc)


# ── Core sync logic ───────────────────────────────────────────────────────────

async def _do_sync() -> None:
    logger.info("Starting SpoolmanDB sync from GitHub…")
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(60.0),
        headers={"User-Agent": "FilamentHub/1.0 (github.com/filamenthub)"},
    ) as client:
        # Enumerate manufacturer files
        resp = await client.get(f"{GITHUB_API}/contents/filaments")
        resp.raise_for_status()
        files = [f for f in resp.json() if f["name"].endswith(".json")]

        # Contributor count (best-effort via Link header pagination hint)
        contributor_count = _cache.get("contributor_count", 0) or 0
        try:
            cr = await client.get(
                f"{GITHUB_API}/contributors",
                params={"per_page": 100, "anon": "true"},
            )
            if cr.status_code == 200:
                contributor_count = len(cr.json())
                # If paginated, parse the total from the Link header
                if "next" in cr.headers.get("link", ""):
                    import re
                    match = re.search(r'page=(\d+)>; rel="last"', cr.headers.get("link", ""))
                    if match:
                        last_page = int(match.group(1))
                        contributor_count = last_page * 100
        except Exception:
            pass

        # Fetch all manufacturer JSON files concurrently
        tasks = [client.get(f["download_url"]) for f in files]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        all_filaments: list[dict] = []
        for r in responses:
            if isinstance(r, Exception):
                logger.debug("Skipping file due to error: %s", r)
                continue
            if not hasattr(r, "status_code") or r.status_code != 200:
                continue
            try:
                all_filaments.extend(_expand_manufacturer(r.json()))
            except Exception as exc:
                logger.warning("Failed to parse manufacturer file: %s", exc)

    _cache["filaments"]         = all_filaments
    _cache["synced_at"]         = datetime.now(UTC).isoformat()
    _cache["contributor_count"] = contributor_count
    _save_to_disk()
    logger.info("SpoolmanDB sync complete: %d expanded entries", len(all_filaments))


# ── Public API ────────────────────────────────────────────────────────────────

async def get_or_sync() -> dict:
    """Return cached data, syncing from GitHub on first call."""
    if _cache["filaments"]:
        return _cache
    async with _sync_lock:
        if _cache["filaments"]:          # double-checked
            return _cache
        if not _load_from_disk():
            await _do_sync()
    return _cache


async def sync() -> dict:
    """Force a fresh sync from GitHub regardless of cache state."""
    async with _sync_lock:
        await _do_sync()
    return _cache
