#!/usr/bin/env python3
"""Fetch all filament profiles from 3DFilamentProfiles.com and save to app/data/.

Strategy:
  1. Fetch each /materials/{slug} page — these contain per-filament and
     per-material-type default properties (temperatures, spool weight, density).
  2. Fetch each /filaments/{brand} page to capture filaments whose material
     type falls outside the known material slug list.
  3. Merge both sets, deduplicating by Supabase record ID.

Usage:
    pip install curl_cffi
    python scripts/fetch_3dfp.py
"""

import asyncio
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

try:
    from curl_cffi.requests import AsyncSession
except ImportError:
    print("curl_cffi is required: pip install curl_cffi", file=sys.stderr)
    sys.exit(1)

BASE_URL    = "https://3dfilamentprofiles.com"
IMPERSONATE = "chrome120"
OUT_FILE    = Path(__file__).parent.parent / "app" / "data" / "filament_profiles_db.json"

MATERIAL_SLUGS = [
    "abs", "abs-plus", "apla", "asa", "asa-plus", "bvoh", "copa", "cpe",
    "hips", "ht-pla", "mabs", "pa", "pa12", "pa6", "pa612", "paht", "pbt",
    "pc", "pc-abs", "pc-pbt", "pcl", "pctg", "pe", "peba", "peek", "pei",
    "pekk", "pet", "petg", "petg-plus", "pha", "pipg", "pla", "pla-plus",
    "pmma", "pp", "ppa", "pps", "psu", "pva", "pvb", "pvdf", "san", "sbs",
    "smp", "tpe", "tpr", "tpu",
]

HEADERS = {
    "rsc":             "1",
    "User-Agent":      (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept":          "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer":         f"{BASE_URL}/",
}

_LINE_RE      = re.compile(r'^([a-z0-9]+):(.+)$')
_BRAND_KEY_RE = re.compile(r'"brand_key":"([^"]+)"')


def _find_data_array(body: str) -> list | None:
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
        first = data[0] if data else None
        if isinstance(data, list) and first and isinstance(first, dict) and "brand_name" in first:
            return data
    except (json.JSONDecodeError, ValueError):
        pass
    return None


def _extract(text: str) -> list:
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
    val = (f.get("properties") or {}).get(key)
    if val is None:
        val = (f.get("default_properties") or {}).get(key)
    return val


def _normalize(f: dict) -> dict:  # noqa: PLR0914 (many fields needed)
    material      = (f.get("material") or "").strip()
    material_type = (f.get("material_type") or "").strip()
    full_material = (
        f"{material} {material_type}"
        if material_type and material_type.lower() not in (material.lower(), "")
        else material
    )
    mt  = material_type.lower()
    uid = hashlib.md5(f"3dfp:{f['id']}".encode()).hexdigest()[:14]
    sc  = f.get("short_code")
    bk  = f.get("brand_key")
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


async def main() -> None:
    start     = time.time()
    raw_by_id: dict[int, dict] = {}

    async with AsyncSession(impersonate=IMPERSONATE) as session:

        # Step 1: material pages (have full property data)
        print(f"Step 1: fetching {len(MATERIAL_SLUGS)} material pages…", flush=True)
        mat_sem = asyncio.Semaphore(8)
        mat_errors = 0

        async def fetch_material(slug: str) -> None:
            nonlocal mat_errors
            async with mat_sem:
                try:
                    resp = await asyncio.wait_for(
                        session.get(
                            f"{BASE_URL}/materials/{slug}",
                            headers={**HEADERS, "Next-Url": f"/materials/{slug}"},
                        ),
                        timeout=120,
                    )
                    items = _extract(resp.text) if resp.status_code == 200 else []
                    for item in items:
                        if item.get("id") and not item.get("deleted"):
                            raw_by_id[item["id"]] = item
                    t = f"{time.time()-start:.0f}s"
                    print(f"  {slug}: {len(items)} filaments ({t})", flush=True)
                except (OSError, asyncio.TimeoutError) as exc:
                    mat_errors += 1
                    print(f"  {slug}: ERROR {exc}", flush=True)

        await asyncio.gather(*[fetch_material(s) for s in MATERIAL_SLUGS])
        print(f"  → {len(raw_by_id)} records after material pages "
              f"({mat_errors} errors)\n", flush=True)

        # Step 2: brand pages (catch any unlisted material types)
        print("Step 2: fetching brand pages for coverage…", flush=True)
        r = await session.get(
            f"{BASE_URL}/brands",
            headers={**HEADERS, "Next-Url": "/brands"},
            timeout=30,
        )
        brand_keys: list[str] = []
        seen_bk: set[str] = set()
        for m in _BRAND_KEY_RE.finditer(r.text):
            k = m.group(1)
            if k not in seen_bk:
                seen_bk.add(k)
                brand_keys.append(k)
        print(f"  Found {len(brand_keys)} brands", flush=True)

        brand_sem    = asyncio.Semaphore(40)
        brand_errors = 0
        brand_done   = 0
        brand_added  = 0

        async def fetch_brand(slug: str) -> None:
            nonlocal brand_errors, brand_done, brand_added
            async with brand_sem:
                try:
                    resp = await asyncio.wait_for(
                        session.get(
                            f"{BASE_URL}/filaments/{slug}",
                            headers={**HEADERS, "Next-Url": f"/filaments/{slug}"},
                        ),
                        timeout=10,
                    )
                    for item in (_extract(resp.text) if resp.status_code == 200 else []):
                        fid = item.get("id")
                        if fid and not item.get("deleted") and fid not in raw_by_id:
                            raw_by_id[fid] = item
                            brand_added += 1
                except (OSError, asyncio.TimeoutError):
                    brand_errors += 1
                finally:
                    brand_done += 1
                    if brand_done % 200 == 0:
                        t = f"{time.time()-start:.0f}s"
                        print(f"  {brand_done}/{len(brand_keys)} brands ({t})", flush=True)

        await asyncio.gather(*[fetch_brand(s) for s in brand_keys])
        print(f"  → {brand_added} extra records from brand pages "
              f"({brand_errors} errors)\n", flush=True)

    # Normalize + deduplicate
    seen_uids: set[str]   = set()
    filaments: list[dict] = []
    for item in raw_by_id.values():
        try:
            norm = _normalize(item)
            if norm["id"] not in seen_uids:
                seen_uids.add(norm["id"])
                filaments.append(norm)
        except (KeyError, TypeError, ZeroDivisionError):
            pass

    elapsed = time.time() - start

    def has(key: str) -> int:
        return sum(1 for f in filaments if f.get(key) is not None)

    n = len(filaments)
    print(f"Total: {n} filaments in {elapsed:.0f}s")
    print(f"  print temps:  {has('print_temp_min')}/{n} ({has('print_temp_min')*100//n}%)")
    print(f"  bed temps:    {has('bed_temp_min')}/{n}")
    with_spool = sum(
        1 for f in filaments if (f.get("weights") or [{}])[0].get("spool_weight")
    )
    print(f"  spool weight: {with_spool}/{n}")
    print(f"  density:      {has('density')}/{n}")

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(
        json.dumps(
            {
                "filaments":   filaments,
                "brand_count": len({f["manufacturer"] for f in filaments}),
                "fetched_at":  time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"✓ Saved {OUT_FILE} ({OUT_FILE.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    asyncio.run(main())
