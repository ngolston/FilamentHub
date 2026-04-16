"""Print job logging and usage analytics endpoints."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.deps import get_current_user, require_editor
from app.db.session import get_db
from app.models.models import PrintJob, Spool, User
from app.schemas.schemas import (
    PaginatedResponse,
    PrintJobCreate,
    PrintJobResponse,
    SpoolForecast,
    UsageSummary,
)

jobs_router = APIRouter(prefix="/print-jobs", tags=["print-jobs"])
analytics_router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── Print jobs ────────────────────────────────────────────────────────────────

@jobs_router.post("", response_model=PrintJobResponse, status_code=status.HTTP_201_CREATED)
async def log_print_job(
    body: PrintJobCreate,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    """
    Log a completed print job. Automatically deducts filament_used_g
    from the linked spool's used_weight and sets first_used / last_used timestamps.
    """
    job = PrintJob(user_id=current_user.id, **body.model_dump())
    db.add(job)
    await db.flush()

    # Update spool weight if a spool is linked
    if body.spool_id:
        result = await db.execute(
            select(Spool).where(Spool.id == body.spool_id, Spool.owner_id == current_user.id)
        )
        spool = result.scalar_one_or_none()
        if spool:
            spool.used_weight = min(spool.initial_weight, spool.used_weight + body.filament_used_g)
            now = datetime.now(UTC)
            spool.last_used = now
            if not spool.first_used:
                spool.first_used = now

            # Auto-mark empty
            if spool.fill_percentage < 1.0:
                spool.status = "empty"

    await db.refresh(job, attribute_names=["printer", "spool"])
    return job


@jobs_router.get("", response_model=PaginatedResponse[PrintJobResponse])
async def list_print_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    spool_id: int | None = None,
    printer_id: int | None = None,
    outcome: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(PrintJob)
        .where(PrintJob.user_id == current_user.id)
        .options(selectinload(PrintJob.printer), selectinload(PrintJob.spool))
        .order_by(PrintJob.finished_at.desc())
    )
    if spool_id:
        q = q.where(PrintJob.spool_id == spool_id)
    if printer_id:
        q = q.where(PrintJob.printer_id == printer_id)
    if outcome:
        q = q.where(PrintJob.outcome == outcome)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    result = await db.execute(q.offset((page - 1) * page_size).limit(page_size))

    return PaginatedResponse(
        items=result.scalars().all(),
        total=total,
        page=page,
        page_size=page_size,
        pages=-(-total // page_size),
    )


# ── Analytics ─────────────────────────────────────────────────────────────────

@analytics_router.get("/summary", response_model=UsageSummary)
async def usage_summary(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(UTC) - timedelta(days=days)

    result = await db.execute(
        select(
            func.coalesce(func.sum(PrintJob.filament_used_g), 0).label("total_g"),
            func.count(PrintJob.id).label("job_count"),
        )
        .where(PrintJob.user_id == current_user.id, PrintJob.finished_at >= since)
    )
    row = result.one()

    # Spend from spool purchase prices (rough estimate)
    spend_result = await db.execute(
        select(func.coalesce(func.sum(Spool.purchase_price), 0))
        .where(Spool.owner_id == current_user.id, Spool.registered >= since)
    )
    total_spend = float(spend_result.scalar_one() or 0)

    depleted = (
        await db.execute(
            select(func.count(Spool.id))
            .where(Spool.owner_id == current_user.id, Spool.status == "empty")
        )
    ).scalar_one()

    total_g = float(row.total_g)
    return UsageSummary(
        total_used_g=total_g,
        avg_daily_g=round(total_g / days, 1),
        total_spend=total_spend,
        spools_depleted=depleted,
        period_days=days,
    )


@analytics_router.get("/forecast", response_model=list[SpoolForecast])
async def runout_forecast(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    For every active spool, calculate days remaining based on the user's
    30-day average daily consumption from print jobs linked to that spool.
    """
    thirty_days_ago = datetime.now(UTC) - timedelta(days=30)

    # Avg daily per spool over last 30 days
    usage_rows = await db.execute(
        select(
            PrintJob.spool_id,
            (func.sum(PrintJob.filament_used_g) / 30.0).label("avg_daily"),
        )
        .where(PrintJob.user_id == current_user.id, PrintJob.finished_at >= thirty_days_ago)
        .group_by(PrintJob.spool_id)
    )
    avg_by_spool: dict[int, float] = {row.spool_id: float(row.avg_daily) for row in usage_rows}

    spools = (
        await db.execute(
            select(Spool)
            .where(Spool.owner_id == current_user.id, Spool.status == "active")
            .options(selectinload(Spool.filament), selectinload(Spool.brand))
        )
    ).scalars().all()

    forecasts: list[SpoolForecast] = []
    now = datetime.now(UTC)
    for spool in spools:
        avg = avg_by_spool.get(spool.id, 0.0)
        remaining = spool.remaining_weight
        if avg > 0:
            days_left = remaining / avg
            runout = now + timedelta(days=days_left)
        else:
            days_left = None
            runout = None

        if days_left is None or days_left > 30:
            severity = "ok"
        elif days_left > 7:
            severity = "warning"
        else:
            severity = "critical"

        label = spool.name or (
            f"{spool.filament.name}" if spool.filament else f"Spool #{spool.id}"
        )
        forecasts.append(SpoolForecast(
            spool_id=spool.id,
            spool_name=label,
            remaining_g=remaining,
            fill_pct=spool.fill_percentage,
            avg_daily_g=round(avg, 1),
            days_remaining=round(days_left, 1) if days_left else None,
            estimated_runout=runout,
            severity=severity,
        ))

    forecasts.sort(key=lambda f: (f.days_remaining or 9999))
    return forecasts
