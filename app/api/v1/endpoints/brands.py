"""Brands and filament profile endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.deps import get_current_user, require_editor
from app.db.session import get_db
from app.models.models import Brand, FilamentProfile, User
from app.schemas.schemas import (
    BrandCreate,
    BrandResponse,
    BrandUpdate,
    FilamentProfileCreate,
    FilamentProfileResponse,
    FilamentProfileUpdate,
    PaginatedResponse,
)

brands_router = APIRouter(prefix="/brands", tags=["brands"])
filaments_router = APIRouter(prefix="/filaments", tags=["filaments"])


# ── Brands ────────────────────────────────────────────────────────────────────

@brands_router.get("", response_model=list[BrandResponse])
async def list_brands(
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Brand).order_by(Brand.name)
    if search:
        q = q.where(Brand.name.ilike(f"%{search}%"))
    result = await db.execute(q)
    return result.scalars().all()


@brands_router.post("", response_model=BrandResponse, status_code=status.HTTP_201_CREATED)
async def create_brand(
    body: BrandCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    existing = await db.execute(select(Brand).where(Brand.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Brand with this name already exists")
    brand = Brand(**body.model_dump())
    db.add(brand)
    await db.flush()
    return brand


@brands_router.get("/{brand_id}", response_model=BrandResponse)
async def get_brand(
    brand_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return brand


@brands_router.patch("/{brand_id}", response_model=BrandResponse)
async def update_brand(
    brand_id: int,
    body: BrandUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    result = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(brand, field, value)
    return brand


@brands_router.delete("/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_brand(
    brand_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    result = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = result.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    await db.delete(brand)


# ── Filament profiles ─────────────────────────────────────────────────────────

@filaments_router.get("", response_model=PaginatedResponse[FilamentProfileResponse])
async def list_filaments(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    brand_id: int | None = None,
    material: str | None = None,
    diameter: float | None = None,
    community: bool | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = (
        select(FilamentProfile)
        .options(selectinload(FilamentProfile.brand))
        .order_by(FilamentProfile.name)
    )
    if brand_id:
        q = q.where(FilamentProfile.brand_id == brand_id)
    if material:
        q = q.where(FilamentProfile.material == material)
    if diameter:
        q = q.where(FilamentProfile.diameter == diameter)
    if community is not None:
        q = q.where(FilamentProfile.is_community == community)
    if search:
        q = q.where(
            FilamentProfile.name.ilike(f"%{search}%")
            | FilamentProfile.material.ilike(f"%{search}%")
            | FilamentProfile.color_name.ilike(f"%{search}%")
        )

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    result = await db.execute(q.offset((page - 1) * page_size).limit(page_size))

    return PaginatedResponse(
        items=result.scalars().all(),
        total=total,
        page=page,
        page_size=page_size,
        pages=-(-total // page_size),
    )


@filaments_router.post("", response_model=FilamentProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_filament(
    body: FilamentProfileCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    if body.brand_id:
        brand = await db.get(Brand, body.brand_id)
        if not brand:
            raise HTTPException(status_code=404, detail="Brand not found")
    profile = FilamentProfile(**body.model_dump())
    db.add(profile)
    await db.flush()
    await db.refresh(profile, attribute_names=["brand"])
    return profile


@filaments_router.get("/{filament_id}", response_model=FilamentProfileResponse)
async def get_filament(
    filament_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FilamentProfile)
        .where(FilamentProfile.id == filament_id)
        .options(selectinload(FilamentProfile.brand))
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Filament profile not found")
    return profile


@filaments_router.patch("/{filament_id}", response_model=FilamentProfileResponse)
async def update_filament(
    filament_id: int,
    body: FilamentProfileUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    result = await db.execute(
        select(FilamentProfile)
        .where(FilamentProfile.id == filament_id)
        .options(selectinload(FilamentProfile.brand))
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Filament profile not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    return profile


@filaments_router.delete("/{filament_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_filament(
    filament_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_editor),
):
    result = await db.execute(select(FilamentProfile).where(FilamentProfile.id == filament_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Filament profile not found")
    await db.delete(profile)
