"""Storage location endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_editor
from app.db.session import get_db
from app.models.models import Spool, StorageLocation, User
from app.schemas.schemas import LocationCreate, LocationResponse

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("", response_model=list[LocationResponse])
async def list_locations(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    locs_result = await db.execute(select(StorageLocation).order_by(StorageLocation.name))
    locations = locs_result.scalars().all()

    counts_result = await db.execute(
        select(Spool.location_id, func.count(Spool.id).label("cnt"))
        .where(Spool.location_id.isnot(None))
        .group_by(Spool.location_id)
    )
    counts = {row.location_id: row.cnt for row in counts_result}

    return [
        LocationResponse(
            id=loc.id,
            name=loc.name,
            description=loc.description,
            is_dry_box=loc.is_dry_box,
            spool_count=counts.get(loc.id, 0),
        )
        for loc in locations
    ]


@router.post("", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
async def create_location(
    body: LocationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    location = StorageLocation(owner_id=current_user.id, **body.model_dump())
    db.add(location)
    await db.flush()
    return location


@router.get("/{location_id}", response_model=LocationResponse)
async def get_location(
    location_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(StorageLocation).where(StorageLocation.id == location_id))
    loc = result.scalar_one_or_none()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    return loc


@router.patch("/{location_id}", response_model=LocationResponse)
async def update_location(
    location_id: int,
    body: LocationCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    result = await db.execute(select(StorageLocation).where(StorageLocation.id == location_id))
    loc = result.scalar_one_or_none()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(loc, field, value)
    return loc


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_location(
    location_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    result = await db.execute(select(StorageLocation).where(StorageLocation.id == location_id))
    loc = result.scalar_one_or_none()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    await db.delete(loc)
