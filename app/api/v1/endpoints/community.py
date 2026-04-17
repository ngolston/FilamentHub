"""Community filament database endpoints (powered by SpoolmanDB)."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.deps import get_current_user, require_editor
from app.db.session import get_db
from app.models.models import Brand, FilamentProfile, Spool, SpoolStatus, User
from app.schemas.schemas import CommunityImportRequest, SpoolResponse
from app.services import spoolmandb

router = APIRouter(prefix="/community", tags=["community"])


@router.get("/stats")
async def community_stats(_: User = Depends(get_current_user)):
    data = await spoolmandb.get_or_sync()
    manufacturers = {f["manufacturer"] for f in data["filaments"]}
    return {
        "total_profiles":    len(data["filaments"]),
        "total_brands":      len(manufacturers),
        "contributor_count": data.get("contributor_count", 0),
        "synced_at":         data.get("synced_at"),
    }


@router.get("/filaments")
async def list_community_filaments(
    search:       str | None = None,
    material:     str | None = None,
    diameter:     float | None = None,
    manufacturer: str | None = None,
    page:         int = Query(1, ge=1),
    page_size:    int = Query(500, ge=1, le=5000),
    _: User = Depends(get_current_user),
):
    data = await spoolmandb.get_or_sync()
    filaments = data["filaments"]

    if search:
        q = search.lower()
        filaments = [
            f for f in filaments
            if q in f["manufacturer"].lower()
            or q in f["name"].lower()
            or q in f["material"].lower()
            or q in (f["color_name"] or "").lower()
        ]
    if material:
        filaments = [f for f in filaments if f["material"] == material]
    if diameter:
        filaments = [f for f in filaments if f["diameter"] == diameter]
    if manufacturer:
        filaments = [f for f in filaments if f["manufacturer"] == manufacturer]

    total  = len(filaments)
    offset = (page - 1) * page_size
    items  = filaments[offset : offset + page_size]

    return {
        "items":     items,
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     max(1, -(-total // page_size)),
        "synced_at": data.get("synced_at"),
    }


@router.post("/sync")
async def sync_community(_: User = Depends(get_current_user)):
    """Force a fresh pull from GitHub SpoolmanDB."""
    data = await spoolmandb.sync()
    manufacturers = {f["manufacturer"] for f in data["filaments"]}
    return {
        "total_profiles": len(data["filaments"]),
        "total_brands":   len(manufacturers),
        "synced_at":      data["synced_at"],
    }


@router.post("/import", response_model=SpoolResponse, status_code=status.HTTP_201_CREATED)
async def import_community_filament(
    body:         CommunityImportRequest,
    current_user: User = Depends(require_editor),
    db:           AsyncSession = Depends(get_db),
):
    """Import a community filament: find-or-create brand + filament profile, then create spool."""
    # Find or create brand
    result = await db.execute(select(Brand).where(Brand.name == body.manufacturer))
    brand  = result.scalar_one_or_none()
    if not brand:
        brand = Brand(name=body.manufacturer)
        db.add(brand)
        await db.flush()

    # Create filament profile (always new — each import is a personal copy)
    profile = FilamentProfile(
        brand_id=brand.id,
        name=body.name,
        material=body.material,
        color_name=body.color_name,
        color_hex=body.color_hex,
        diameter=body.diameter,
        density=body.density,
        print_temp_min=body.print_temp_min,
        print_temp_max=body.print_temp_max,
        bed_temp_min=body.bed_temp_min,
        bed_temp_max=body.bed_temp_max,
        is_community=True,
        is_verified=True,
    )
    db.add(profile)
    await db.flush()

    # Create spool
    spool = Spool(
        owner_id=current_user.id,
        filament_id=profile.id,
        brand_id=brand.id,
        location_id=body.location_id,
        initial_weight=body.initial_weight,
        spool_weight=body.spool_weight,
        used_weight=0.0,
        purchase_price=body.purchase_price,
        status=SpoolStatus.active,
    )
    db.add(spool)
    await db.flush()

    # Eager-load relations for the response
    await db.refresh(spool, attribute_names=["filament", "brand", "location"])
    if spool.filament:
        await db.refresh(spool.filament, attribute_names=["brand"])

    return spool
