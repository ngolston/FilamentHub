"""Unauthenticated public endpoints — used by QR code scan pages."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.models import FilamentProfile, Spool, StorageLocation
from app.schemas.schemas import PublicLocationResponse, SpoolResponse

public_router = APIRouter(prefix="/public", tags=["public"])

_SPOOL_OPTS = [
    selectinload(Spool.filament).selectinload(FilamentProfile.brand),
    selectinload(Spool.brand),
    selectinload(Spool.location),
]


@public_router.get("/spools/{spool_id}", response_model=SpoolResponse)
async def get_public_spool(
    spool_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Spool).where(Spool.id == spool_id).options(*_SPOOL_OPTS)
    )
    spool = result.scalar_one_or_none()
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")
    return spool


@public_router.get("/locations/{location_id}", response_model=PublicLocationResponse)
async def get_public_location(
    location_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StorageLocation)
        .where(StorageLocation.id == location_id)
        .options(
            selectinload(StorageLocation.spools).options(*_SPOOL_OPTS),
        )
    )
    location = result.scalar_one_or_none()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return location
