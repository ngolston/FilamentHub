from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.deps import get_current_user, require_editor
from app.db.session import get_db
from app.models.models import Spool, StorageLocation, User, WeightLog
from app.schemas.schemas import (
    BulkSpoolAction,
    PaginatedResponse,
    SpoolCreate,
    SpoolResponse,
    SpoolUpdate,
    WeightLogCreate,
    WeightLogResponse,
)
from app.services.storage import upload_spool_photo

router = APIRouter(prefix="/spools", tags=["spools"])

SPOOL_LOAD_OPTIONS = [
    selectinload(Spool.filament),
    selectinload(Spool.brand),
    selectinload(Spool.location),
]


def _spool_query(owner_id: str):
    return (
        select(Spool)
        .where(Spool.owner_id == owner_id)
        .options(*SPOOL_LOAD_OPTIONS)
    )


@router.get("", response_model=PaginatedResponse[SpoolResponse])
async def list_spools(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str | None = Query(None),  # noqa: A002 — shadows built-in intentionally
    material: str | None = None,
    brand_id: int | None = None,
    location_id: int | None = None,
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = _spool_query(current_user.id)

    if status:
        statuses = [s.strip() for s in status.split(',') if s.strip()]
        if len(statuses) == 1:
            q = q.where(Spool.status == statuses[0])
        elif statuses:
            q = q.where(Spool.status.in_(statuses))
    if brand_id:
        q = q.where(Spool.brand_id == brand_id)
    if location_id:
        q = q.where(Spool.location_id == location_id)

    # Count
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    # Paginate
    q = q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    spools = result.scalars().all()

    return PaginatedResponse(
        items=spools,
        total=total,
        page=page,
        page_size=page_size,
        pages=-(-total // page_size),  # ceiling division
    )


@router.post("", response_model=SpoolResponse, status_code=status.HTTP_201_CREATED)
async def create_spool(
    body: SpoolCreate,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    spool = Spool(owner_id=current_user.id, **body.model_dump())
    db.add(spool)
    await db.flush()
    await db.refresh(spool, attribute_names=["filament", "brand", "location"])
    return spool


@router.get("/{spool_id}", response_model=SpoolResponse)
async def get_spool(
    spool_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        _spool_query(current_user.id).where(Spool.id == spool_id)
    )
    spool = result.scalar_one_or_none()
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")
    return spool


@router.patch("/{spool_id}", response_model=SpoolResponse)
async def update_spool(
    spool_id: int,
    body: SpoolUpdate,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        _spool_query(current_user.id).where(Spool.id == spool_id)
    )
    spool = result.scalar_one_or_none()
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(spool, field, value)

    return spool


@router.delete("/{spool_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_spool(
    spool_id: int,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Spool).where(Spool.id == spool_id, Spool.owner_id == current_user.id)
    )
    spool = result.scalar_one_or_none()
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")
    await db.delete(spool)


# ── Photo upload ──────────────────────────────────────────────────────────────

@router.post("/{spool_id}/photo", response_model=SpoolResponse)
async def upload_photo(
    spool_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, and WebP images are accepted")

    result = await db.execute(
        select(Spool).where(Spool.id == spool_id, Spool.owner_id == current_user.id)
    )
    spool = result.scalar_one_or_none()
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")

    url = await upload_spool_photo(spool_id, file)
    spool.photo_url = url
    return spool


# ── Weight log ────────────────────────────────────────────────────────────────

@router.post("/{spool_id}/weight-logs", response_model=WeightLogResponse, status_code=201)
async def log_weight(
    spool_id: int,
    body: WeightLogCreate,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    """
    Record a scale measurement. Automatically updates spool.used_weight
    so remaining_weight stays accurate.
    """
    result = await db.execute(
        select(Spool).where(Spool.id == spool_id, Spool.owner_id == current_user.id)
    )
    spool = result.scalar_one_or_none()
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")

    tare = body.spool_weight_tare or (spool.spool_weight or 0)
    net = max(0.0, body.measured_weight - tare)

    log = WeightLog(
        spool_id=spool_id,
        measured_weight=body.measured_weight,
        net_weight=net,
        notes=body.notes,
    )
    db.add(log)

    # Update spool remaining weight
    spool.used_weight = max(0.0, spool.initial_weight - net)
    spool.last_used = datetime.now(UTC)

    await db.flush()
    return log


@router.get("/{spool_id}/weight-logs", response_model=list[WeightLogResponse])
async def get_weight_logs(
    spool_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WeightLog)
        .join(Spool, WeightLog.spool_id == Spool.id)
        .where(Spool.id == spool_id, Spool.owner_id == current_user.id)
        .order_by(WeightLog.logged_at.desc())
    )
    return result.scalars().all()


# ── Bulk operations ───────────────────────────────────────────────────────────

_STATUS_MAP = {
    "archive": "archived",
    "activate": "active",
    "set_storage": "storage",
}


@router.post("/bulk", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_action(
    body: BulkSpoolAction,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    """Apply a bulk action (status change, move location, delete) to a list of spool IDs."""
    result = await db.execute(
        select(Spool).where(
            Spool.id.in_(body.ids),
            Spool.owner_id == current_user.id,
        )
    )
    spools = result.scalars().all()

    if body.action == "delete":
        for spool in spools:
            await db.delete(spool)
        return

    if body.action == "move_location":
        if body.location_id is not None:
            # Validate location belongs to owner
            loc_result = await db.execute(
                select(StorageLocation).where(StorageLocation.id == body.location_id)
            )
            if not loc_result.scalar_one_or_none():
                raise HTTPException(status_code=404, detail="Location not found")
        for spool in spools:
            spool.location_id = body.location_id
        return

    new_status = _STATUS_MAP.get(body.action)
    if new_status:
        for spool in spools:
            spool.status = new_status
