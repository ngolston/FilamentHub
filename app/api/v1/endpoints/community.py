"""Community filament database endpoints (SpoolmanDB + 3DFilamentProfiles)."""

import asyncio

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_editor
from app.db.session import get_db
from app.models.models import Brand, FilamentProfile, Spool, SpoolStatus, User
from app.schemas.schemas import CommunityImportRequest, SpoolResponse
from app.services import filamentprofiles, spoolmandb

router = APIRouter(prefix="/community", tags=["community"])


async def _combined() -> tuple[list[dict], str | None]:
    """Fetch and merge filaments from both sources concurrently."""
    sdb_data, fp_data = await asyncio.gather(
        spoolmandb.get_or_sync(),
        filamentprofiles.get_or_sync(),
    )
    sdb = [{"source": "spoolmandb", **f} for f in sdb_data["filaments"]]
    fp  = fp_data["filaments"]   # already have source field
    return sdb + fp, sdb_data.get("synced_at")


class _FilamentQuery:
    """Query-parameter bundle for the filament list endpoint."""

    def __init__(
        self,
        search:       str | None   = None,
        material:     str | None   = None,
        diameter:     float | None = None,
        manufacturer: str | None   = None,
        source:       str | None   = None,
        page:         int          = Query(1, ge=1),
        page_size:    int          = Query(500, ge=1, le=5000),
    ) -> None:
        self.search       = search
        self.material     = material
        self.diameter     = diameter
        self.manufacturer = manufacturer
        self.source       = source
        self.page         = page
        self.page_size    = page_size


@router.get("/stats")
async def community_stats(_: User = Depends(get_current_user)):
    """Return aggregate stats for both filament databases."""
    filaments, synced_at = await _combined()
    manufacturers = {f["manufacturer"] for f in filaments}
    sdb_data = await spoolmandb.get_or_sync()
    fp_data  = await filamentprofiles.get_or_sync()
    return {
        "total_profiles":    len(filaments),
        "total_brands":      len(manufacturers),
        "contributor_count": sdb_data.get("contributor_count", 0),
        "synced_at":         synced_at,
        "fp_count":          len(fp_data["filaments"]),
        "fp_sync_status":    fp_data.get("sync_status", "idle"),
    }


@router.get("/filaments")
async def list_community_filaments(
    q: _FilamentQuery = Depends(),
    _: User           = Depends(get_current_user),
):
    """List community filaments from all sources with optional filters."""
    filaments, synced_at = await _combined()

    if q.source:
        filaments = [f for f in filaments if f.get("source") == q.source]
    if q.search:
        s = q.search.lower()
        filaments = [
            f for f in filaments
            if s in f["manufacturer"].lower()
            or s in f["name"].lower()
            or s in f["material"].lower()
            or s in (f.get("color_name") or "").lower()
        ]
    if q.material:
        filaments = [f for f in filaments if f["material"] == q.material]
    if q.diameter:
        filaments = [f for f in filaments if f["diameter"] == q.diameter]
    if q.manufacturer:
        filaments = [f for f in filaments if f["manufacturer"] == q.manufacturer]

    total  = len(filaments)
    offset = (q.page - 1) * q.page_size
    items  = filaments[offset : offset + q.page_size]

    return {
        "items":     items,
        "total":     total,
        "page":      q.page,
        "page_size": q.page_size,
        "pages":     max(1, -(-total // q.page_size)),
        "synced_at": synced_at,
    }


@router.post("/sync")
async def sync_community(_: User = Depends(get_current_user)):
    """Force a fresh pull from both databases."""
    sdb_data, _ = await asyncio.gather(
        spoolmandb.sync(),
        filamentprofiles.sync(),
    )
    filaments, _ = await _combined()
    manufacturers = {f["manufacturer"] for f in filaments}
    return {
        "total_profiles": len(filaments),
        "total_brands":   len(manufacturers),
        "synced_at":      sdb_data["synced_at"],
    }


@router.post("/import", response_model=SpoolResponse, status_code=status.HTTP_201_CREATED)
async def import_community_filament(
    body:         CommunityImportRequest,
    current_user: User = Depends(require_editor),
    db:           AsyncSession = Depends(get_db),
):
    """Import a community filament: find-or-create brand + filament profile, then create spool."""
    result = await db.execute(select(Brand).where(Brand.name == body.manufacturer))
    brand  = result.scalar_one_or_none()
    if not brand:
        brand = Brand(name=body.manufacturer)
        db.add(brand)
        await db.flush()

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

    spool = Spool(
        owner_id=current_user.id,
        filament_id=profile.id,
        brand_id=brand.id,
        location_id=body.location_id,
        initial_weight=body.initial_weight,
        spool_weight=body.spool_weight,
        used_weight=0.0,
        purchase_price=body.purchase_price,
        status=SpoolStatus.storage,
    )
    db.add(spool)
    await db.flush()

    await db.refresh(spool, attribute_names=["filament", "brand", "location"])
    if spool.filament:
        await db.refresh(spool.filament, attribute_names=["brand"])

    return spool
