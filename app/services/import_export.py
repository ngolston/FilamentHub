"""
Spoolman-compatible import and CSV export service.

Spoolman JSON format reference:
  https://github.com/Donkie/Spoolman/blob/master/docs/openapi.json

The importer maps Spoolman's flat spool+filament structure onto FilamentHub's
normalised Brand → FilamentProfile → Spool hierarchy.
"""

import csv
import io
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Brand, FilamentProfile, Spool


async def import_spoolman_json(data: dict | list, owner_id: str, db: AsyncSession) -> dict:
    """
    Accept a Spoolman backup JSON (list of spools or {"spools": [...]} dict)
    and insert them into FilamentHub, de-duplicating brands and filament profiles.
    Returns a summary dict.
    """
    spools_data: list[dict] = []
    if isinstance(data, list):
        spools_data = data
    elif isinstance(data, dict):
        spools_data = data.get("spools", [])

    created_brands: dict[str, int] = {}
    created_profiles: dict[str, int] = {}
    imported = 0
    skipped = 0

    for raw in spools_data:
        try:
            # ── Brand ─────────────────────────────────────────────────────────
            filament_data: dict = raw.get("filament", {})
            brand_data: dict = filament_data.get("vendor", {})
            brand_name: str = brand_data.get("name", "Unknown")

            if brand_name not in created_brands:
                existing = await db.execute(select(Brand).where(Brand.name == brand_name))
                brand = existing.scalar_one_or_none()
                if not brand:
                    brand = Brand(
                        name=brand_name,
                        website=brand_data.get("website"),
                    )
                    db.add(brand)
                    await db.flush()
                created_brands[brand_name] = brand.id
            brand_id = created_brands[brand_name]

            # ── Filament profile ──────────────────────────────────────────────
            profile_key = f"{brand_id}:{filament_data.get('name','?')}:{filament_data.get('material','?')}"
            if profile_key not in created_profiles:
                profile = FilamentProfile(
                    brand_id=brand_id,
                    name=filament_data.get("name", "Imported Filament"),
                    material=filament_data.get("material", "PLA"),
                    color_name=filament_data.get("color_name"),
                    color_hex=filament_data.get("color_hex"),
                    diameter=float(filament_data.get("diameter", 1.75)),
                    density=filament_data.get("density"),
                    print_temp_min=filament_data.get("settings_extruder_temp"),
                    print_temp_max=filament_data.get("settings_extruder_temp"),
                    bed_temp_min=filament_data.get("settings_bed_temp"),
                    bed_temp_max=filament_data.get("settings_bed_temp"),
                )
                db.add(profile)
                await db.flush()
                created_profiles[profile_key] = profile.id
            profile_id = created_profiles[profile_key]

            # ── Spool ─────────────────────────────────────────────────────────
            used_weight = float(raw.get("used_weight", 0))
            initial = float(filament_data.get("weight", 1000))

            registered_str: str | None = raw.get("registered")
            registered = (
                datetime.fromisoformat(registered_str) if registered_str else datetime.now(UTC)
            )

            spool = Spool(
                owner_id=owner_id,
                filament_id=profile_id,
                brand_id=brand_id,
                initial_weight=initial,
                used_weight=used_weight,
                lot_nr=raw.get("lot_nr"),
                notes=raw.get("comment"),
                registered=registered,
            )
            db.add(spool)
            imported += 1

        except Exception:
            skipped += 1
            continue

    await db.flush()
    return {
        "imported": imported,
        "skipped": skipped,
        "brands_created": len(created_brands),
        "profiles_created": len(created_profiles),
    }


def _opt_float(v: str | None) -> float | None:
    """Parse an optional float from a CSV cell; return None if blank or invalid."""
    try:
        return float(v) if v and v.strip() else None
    except ValueError:
        return None


def _opt_date(v: str | None) -> date | None:
    try:
        return date.fromisoformat(v.strip()) if v and v.strip() else None
    except ValueError:
        return None


async def _get_or_create_brand(name: str, cache: dict[str, int], db: AsyncSession) -> int:
    if name not in cache:
        result = await db.execute(select(Brand).where(Brand.name == name))
        brand = result.scalar_one_or_none() or Brand(name=name)
        if brand.id is None:
            db.add(brand)
            await db.flush()
        cache[name] = brand.id
    return cache[name]


async def _get_or_create_profile(
    row: dict[str, str],
    brand_id: int,
    cache: dict[str, int],
    db: AsyncSession,
) -> int:
    name     = (row.get("name") or "Imported Filament").strip()
    material = (row.get("material") or "PLA").strip()
    key      = f"{brand_id}:{name}:{material}"
    if key not in cache:
        result = await db.execute(
            select(FilamentProfile).where(
                FilamentProfile.brand_id == brand_id,
                FilamentProfile.name == name,
                FilamentProfile.material == material,
            )
        )
        fp = result.scalar_one_or_none()
        if not fp:
            fp = FilamentProfile(
                brand_id=brand_id,
                name=name,
                material=material,
                color_name=row.get("color_name") or None,
                color_hex=row.get("color_hex") or None,
                diameter=_opt_float(row.get("diameter")) or 1.75,
                print_temp_min=_opt_float(row.get("print_temp_min")),
                print_temp_max=_opt_float(row.get("print_temp_max")),
                bed_temp_min=_opt_float(row.get("bed_temp_min")),
                bed_temp_max=_opt_float(row.get("bed_temp_max")),
            )
            db.add(fp)
            await db.flush()
        cache[key] = fp.id
    return cache[key]


async def import_spools_csv(content: str, owner_id: str, db: AsyncSession) -> dict:
    """
    Import spools from a FilamentHub CSV export.
    Brands and filament profiles are de-duplicated by name.
    """
    reader = csv.DictReader(io.StringIO(content))
    brand_cache: dict[str, int] = {}
    profile_cache: dict[str, int] = {}
    imported = skipped = 0

    for row in reader:
        try:
            brand_name = (row.get("brand") or "").strip() or "Unknown"
            brand_id   = await _get_or_create_brand(brand_name, brand_cache, db)
            profile_id = await _get_or_create_profile(row, brand_id, profile_cache, db)

            status_val = (row.get("status") or "storage").strip()
            if status_val not in ("active", "storage", "archived"):
                status_val = "storage"

            spool = Spool(
                owner_id=owner_id,
                filament_id=profile_id,
                brand_id=brand_id,
                name=row.get("name") or None,
                initial_weight=_opt_float(row.get("initial_weight_g")) or 1000.0,
                used_weight=_opt_float(row.get("used_weight_g")) or 0.0,
                status=status_val,
                lot_nr=row.get("lot_nr") or None,
                notes=row.get("notes") or None,
                purchase_date=_opt_date(row.get("purchase_date")),
                purchase_price=_opt_float(row.get("purchase_price")),
                supplier=row.get("supplier") or None,
            )
            db.add(spool)
            imported += 1
        except Exception:  # noqa: BLE001 — skip malformed rows
            skipped += 1

    await db.flush()
    return {
        "imported": imported,
        "skipped": skipped,
        "brands_created": len(brand_cache),
        "profiles_created": len(profile_cache),
    }


async def export_spools_csv(owner_id: str, db: AsyncSession) -> str:
    """Export all spools as a CSV string compatible with Spoolman's import format."""
    result = await db.execute(
        select(Spool)
        .where(Spool.owner_id == owner_id)
    )
    spools = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "registered", "name", "material", "brand",
        "color_name", "color_hex", "diameter",
        "initial_weight_g", "used_weight_g", "remaining_weight_g", "fill_pct",
        "print_temp_min", "print_temp_max", "bed_temp_min", "bed_temp_max",
        "purchase_date", "purchase_price", "supplier", "status",
        "lot_nr", "notes",
    ])

    for s in spools:
        fp = s.filament
        writer.writerow([
            s.id,
            s.registered.isoformat(),
            s.name or (fp.name if fp else ""),
            fp.material if fp else "",
            s.brand.name if s.brand else "",
            fp.color_name if fp else "",
            fp.color_hex if fp else "",
            fp.diameter if fp else 1.75,
            s.initial_weight,
            s.used_weight,
            s.remaining_weight,
            s.fill_percentage,
            fp.print_temp_min if fp else "",
            fp.print_temp_max if fp else "",
            fp.bed_temp_min if fp else "",
            fp.bed_temp_max if fp else "",
            s.purchase_date.isoformat() if s.purchase_date else "",
            s.purchase_price or "",
            s.supplier or "",
            s.status,
            s.lot_nr or "",
            s.notes or "",
        ])

    return output.getvalue()


async def export_spoolman_json(owner_id: str, db: AsyncSession) -> list[dict[str, Any]]:
    """Export all spools as Spoolman-compatible JSON."""
    result = await db.execute(select(Spool).where(Spool.owner_id == owner_id))
    spools = result.scalars().all()
    out = []
    for s in spools:
        fp = s.filament
        out.append({
            "id": s.id,
            "registered": s.registered.isoformat(),
            "lot_nr": s.lot_nr,
            "comment": s.notes,
            "used_weight": s.used_weight,
            "filament": {
                "name": fp.name if fp else None,
                "material": fp.material if fp else None,
                "color_name": fp.color_name if fp else None,
                "color_hex": fp.color_hex if fp else None,
                "diameter": fp.diameter if fp else 1.75,
                "weight": s.initial_weight,
                "settings_extruder_temp": fp.print_temp_min if fp else None,
                "settings_bed_temp": fp.bed_temp_min if fp else None,
                "vendor": {"name": s.brand.name if s.brand else None},
            },
        })
    return out
