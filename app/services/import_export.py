"""
Spoolman-compatible import and CSV export service.

Spoolman JSON format reference:
  https://github.com/Donkie/Spoolman/blob/master/docs/openapi.json

The importer maps Spoolman's flat spool+filament structure onto FilamentHub's
normalised Brand → FilamentProfile → Spool hierarchy.
"""

import csv
import io
import json
from datetime import UTC, datetime
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
