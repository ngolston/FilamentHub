"""Print job logging and usage analytics endpoints."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.deps import get_current_user, require_operator
from app.db.session import get_db
from app.models.models import (
    AmsSlot, AmsUnit, FilamentProfile, PrintJob, PrintJobPhoto, PrintJobSpool,
    Printer, Spool, User,
)
from app.schemas.schemas import (
    CostAnalytics,
    DailyUsagePoint,
    MaterialAnalytics,
    MaterialBreakdown,
    MaterialCost,
    MonthlySpend,
    PaginatedResponse,
    PrintJobCreate,
    PrintJobResponse,
    PrintJobUpdate,
    PrinterAnalytics,
    PrinterStat,
    SpoolForecast,
    UsageSummary,
)
from app.services.storage import upload_print_job_photo

jobs_router = APIRouter(prefix="/print-jobs", tags=["print-jobs"])
analytics_router = APIRouter(prefix="/analytics", tags=["analytics"])

_JOB_LOAD_OPTIONS = [
    selectinload(PrintJob.printer).options(
        selectinload(Printer.ams_units)
            .selectinload(AmsUnit.slots)
            .selectinload(AmsSlot.spool)
            .selectinload(Spool.filament),
        selectinload(Printer.ams_units)
            .selectinload(AmsUnit.slots)
            .selectinload(AmsSlot.spool)
            .selectinload(Spool.brand),
        selectinload(Printer.direct_spool).selectinload(Spool.filament),
        selectinload(Printer.direct_spool).selectinload(Spool.brand),
    ),
    selectinload(PrintJob.spool).selectinload(Spool.filament),
    selectinload(PrintJob.spool).selectinload(Spool.brand),
    selectinload(PrintJob.spools).selectinload(PrintJobSpool.spool).selectinload(Spool.filament),
    selectinload(PrintJob.spools).selectinload(PrintJobSpool.spool).selectinload(Spool.brand),
    selectinload(PrintJob.photos),
    selectinload(PrintJob.project),
]


# ── Print jobs ────────────────────────────────────────────────────────────────

@jobs_router.post("", response_model=PrintJobResponse, status_code=status.HTTP_201_CREATED)
async def log_print_job(
    body: PrintJobCreate,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Log a completed print job and deduct filament from each linked spool."""
    total_g = sum(s.filament_used_g for s in body.spools) or None
    first_spool_id = body.spools[0].spool_id if body.spools else None

    job = PrintJob(
        user_id=current_user.id,
        printer_id=body.printer_id,
        project_id=body.project_id,
        spool_id=first_spool_id,
        plate_number=body.plate_number,
        file_name=body.file_name,
        filament_used_g=total_g,
        duration_seconds=body.duration_seconds,
        outcome=body.outcome,
        notes=body.notes,
        finished_at=body.finished_at or datetime.now(UTC),
    )
    db.add(job)
    await db.flush()

    now = datetime.now(UTC)
    for entry in body.spools:
        pjs = PrintJobSpool(
            print_job_id=job.id,
            spool_id=entry.spool_id,
            filament_used_g=entry.filament_used_g,
        )
        db.add(pjs)

        result = await db.execute(
            select(Spool).where(Spool.id == entry.spool_id, Spool.owner_id == current_user.id)
        )
        spool = result.scalar_one_or_none()
        if spool:
            spool.used_weight = min(spool.initial_weight, spool.used_weight + entry.filament_used_g)
            spool.last_used = now
            if not spool.first_used:
                spool.first_used = now
            if spool.fill_percentage < 1.0:
                spool.status = "empty"

    await db.flush()
    result = await db.execute(
        select(PrintJob).where(PrintJob.id == job.id).options(*_JOB_LOAD_OPTIONS)
    )
    return result.scalar_one()


@jobs_router.post("/{job_id}/photos", response_model=PrintJobResponse)
async def upload_job_photos(
    job_id: int,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Attach one or more photos to an existing print job."""
    result = await db.execute(
        select(PrintJob).where(PrintJob.id == job_id, PrintJob.user_id == current_user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found")

    for file in files:
        url = await upload_print_job_photo(job_id, file)
        db.add(PrintJobPhoto(print_job_id=job_id, url=url))

    await db.flush()
    result = await db.execute(
        select(PrintJob).where(PrintJob.id == job_id).options(*_JOB_LOAD_OPTIONS)
    )
    return result.scalar_one()


@jobs_router.get("", response_model=PaginatedResponse[PrintJobResponse])
async def list_print_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    spool_id: int | None = None,
    printer_id: int | None = None,
    outcome: str | None = None,
    project_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(PrintJob)
        .where(PrintJob.user_id == current_user.id)
        .options(*_JOB_LOAD_OPTIONS)
        .order_by(PrintJob.finished_at.desc())
    )
    if spool_id:
        q = q.where(PrintJob.spool_id == spool_id)
    if printer_id:
        q = q.where(PrintJob.printer_id == printer_id)
    if outcome:
        q = q.where(PrintJob.outcome == outcome)
    if project_id:
        q = q.where(PrintJob.project_id == project_id)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    result = await db.execute(q.offset((page - 1) * page_size).limit(page_size))

    return PaginatedResponse(
        items=result.scalars().all(),
        total=total,
        page=page,
        page_size=page_size,
        pages=-(-total // page_size),
    )


@jobs_router.put("/{job_id}", response_model=PrintJobResponse)
async def update_print_job(
    job_id: int,
    body: PrintJobUpdate,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Update a print job's fields, re-adjusting spool weights when spools change."""
    result = await db.execute(
        select(PrintJob)
        .where(PrintJob.id == job_id, PrintJob.user_id == current_user.id)
        .options(selectinload(PrintJob.spools))
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found")

    if body.printer_id is not None:
        job.printer_id = body.printer_id
    if body.project_id is not None:
        job.project_id = body.project_id
    if body.plate_number is not None:
        job.plate_number = body.plate_number
    if body.file_name is not None:
        job.file_name = body.file_name
    if body.duration_seconds is not None:
        job.duration_seconds = body.duration_seconds
    if body.outcome is not None:
        job.outcome = body.outcome
    if body.notes is not None:
        job.notes = body.notes
    if body.finished_at is not None:
        job.finished_at = body.finished_at

    if body.spools is not None:
        # Undo old spool weight deductions
        for old_pjs in job.spools:
            sr = await db.execute(
                select(Spool).where(Spool.id == old_pjs.spool_id, Spool.owner_id == current_user.id)
            )
            spool = sr.scalar_one_or_none()
            if spool:
                spool.used_weight = max(0.0, spool.used_weight - old_pjs.filament_used_g)
            await db.delete(old_pjs)

        await db.flush()

        # Apply new spool deductions
        now = datetime.now(UTC)
        for entry in body.spools:
            db.add(PrintJobSpool(
                print_job_id=job.id,
                spool_id=entry.spool_id,
                filament_used_g=entry.filament_used_g,
            ))
            sr = await db.execute(
                select(Spool).where(Spool.id == entry.spool_id, Spool.owner_id == current_user.id)
            )
            spool = sr.scalar_one_or_none()
            if spool:
                spool.used_weight = min(spool.initial_weight, spool.used_weight + entry.filament_used_g)
                spool.last_used = now
                if not spool.first_used:
                    spool.first_used = now

        job.filament_used_g = sum(s.filament_used_g for s in body.spools) or None
        job.spool_id = body.spools[0].spool_id if body.spools else None

    await db.flush()
    result = await db.execute(
        select(PrintJob).where(PrintJob.id == job.id).options(*_JOB_LOAD_OPTIONS)
    )
    return result.scalar_one()


@jobs_router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_print_job(
    job_id: int,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    """Delete a print job and restore spool weights."""
    result = await db.execute(
        select(PrintJob)
        .where(PrintJob.id == job_id, PrintJob.user_id == current_user.id)
        .options(selectinload(PrintJob.spools))
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found")

    for pjs in job.spools:
        sr = await db.execute(
            select(Spool).where(Spool.id == pjs.spool_id, Spool.owner_id == current_user.id)
        )
        spool = sr.scalar_one_or_none()
        if spool:
            spool.used_weight = max(0.0, spool.used_weight - pjs.filament_used_g)

    await db.delete(job)


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


# ── Daily usage breakdown ─────────────────────────────────────────────────────

@analytics_router.get("/daily", response_model=list[DailyUsagePoint])
async def daily_usage(
    days: int = Query(30, ge=7, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(UTC) - timedelta(days=days)

    rows = (await db.execute(
        select(
            func.strftime("%Y-%m-%d", PrintJob.finished_at).label("date"),
            func.sum(PrintJob.filament_used_g).label("grams"),
        )
        .where(PrintJob.user_id == current_user.id, PrintJob.finished_at >= since)
        .group_by(text("date"))
        .order_by(text("date"))
    )).all()

    day_map = {r.date: float(r.grams) for r in rows}
    now = datetime.now(UTC)
    points: list[DailyUsagePoint] = []
    cumulative = 0.0
    for i in range(days, -1, -1):
        d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        g = day_map.get(d, 0.0)
        cumulative += g
        points.append(DailyUsagePoint(date=d, grams=g, cumulative=cumulative))

    return points


# ── By-material breakdown ─────────────────────────────────────────────────────

@analytics_router.get("/by-material", response_model=MaterialAnalytics)
async def material_analytics(
    days: int = Query(30, ge=7, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(UTC) - timedelta(days=days)
    mat_col = func.coalesce(FilamentProfile.material, "Unknown")

    breakdown_rows = (await db.execute(
        select(mat_col.label("material"), func.sum(PrintJob.filament_used_g).label("total_grams"))
        .select_from(PrintJob)
        .outerjoin(Spool, PrintJob.spool_id == Spool.id)
        .outerjoin(FilamentProfile, Spool.filament_id == FilamentProfile.id)
        .where(PrintJob.user_id == current_user.id, PrintJob.finished_at >= since)
        .group_by(mat_col)
        .order_by(func.sum(PrintJob.filament_used_g).desc())
    )).all()

    total_g = sum(float(r.total_grams) for r in breakdown_rows) or 1.0
    breakdown = [
        MaterialBreakdown(
            material=r.material,
            total_grams=float(r.total_grams),
            pct=round(float(r.total_grams) / total_g * 100, 1),
            avg_daily_g=round(float(r.total_grams) / days, 1),
        )
        for r in breakdown_rows
    ]
    materials = [b.material for b in breakdown]

    # Weekly pivot — [{week_label, PLA: x, PETG: y, …}]
    weekly_rows = (await db.execute(
        select(
            func.strftime("%Y-%W", PrintJob.finished_at).label("week"),
            mat_col.label("material"),
            func.sum(PrintJob.filament_used_g).label("grams"),
        )
        .select_from(PrintJob)
        .outerjoin(Spool, PrintJob.spool_id == Spool.id)
        .outerjoin(FilamentProfile, Spool.filament_id == FilamentProfile.id)
        .where(PrintJob.user_id == current_user.id, PrintJob.finished_at >= since)
        .group_by(text("week"), mat_col)
        .order_by(text("week"))
    )).all()

    week_dict: dict[str, dict] = {}
    for row in weekly_rows:
        if row.week not in week_dict:
            week_dict[row.week] = {"week": row.week}
        week_dict[row.week][row.material] = float(row.grams)

    weekly: list[dict] = []
    for wk, data in sorted(week_dict.items()):
        try:
            yr, wn = wk.split("-")
            dt = datetime.strptime(f"{yr}-W{wn}-1", "%Y-W%W-%w")
            data = {**data, "week": dt.strftime("%b %-d")}
        except Exception:
            pass
        weekly.append(data)

    return MaterialAnalytics(breakdown=breakdown, weekly=weekly, materials=materials)


# ── By-printer breakdown ──────────────────────────────────────────────────────

@analytics_router.get("/by-printer", response_model=PrinterAnalytics)
async def printer_analytics(
    days: int = Query(30, ge=7, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(UTC) - timedelta(days=days)
    printer_name_col = func.coalesce(Printer.name, "Unknown")
    mat_col = func.coalesce(FilamentProfile.material, "Unknown")

    stat_rows = (await db.execute(
        select(
            Printer.id.label("printer_id"),
            printer_name_col.label("printer_name"),
            func.sum(PrintJob.filament_used_g).label("total_grams"),
        )
        .select_from(PrintJob)
        .outerjoin(Printer, PrintJob.printer_id == Printer.id)
        .where(PrintJob.user_id == current_user.id, PrintJob.finished_at >= since)
        .group_by(Printer.id, printer_name_col)
        .order_by(func.sum(PrintJob.filament_used_g).desc())
    )).all()

    total_g = sum(float(r.total_grams or 0) for r in stat_rows) or 1.0

    stats: list[PrinterStat] = []
    for r in stat_rows:
        top_mat_rows = (await db.execute(
            select(mat_col.label("material"), func.sum(PrintJob.filament_used_g).label("g"))
            .select_from(PrintJob)
            .outerjoin(Spool, PrintJob.spool_id == Spool.id)
            .outerjoin(FilamentProfile, Spool.filament_id == FilamentProfile.id)
            .where(
                PrintJob.user_id == current_user.id,
                PrintJob.printer_id == r.printer_id,
                PrintJob.finished_at >= since,
            )
            .group_by(mat_col)
            .order_by(func.sum(PrintJob.filament_used_g).desc())
            .limit(3)
        )).all()
        stats.append(PrinterStat(
            printer_id=r.printer_id,
            printer_name=r.printer_name,
            total_grams=float(r.total_grams or 0),
            pct=round(float(r.total_grams or 0) / total_g * 100, 1),
            top_materials=[row.material for row in top_mat_rows],
        ))

    # Daily per-printer pivot
    daily_rows = (await db.execute(
        select(
            func.strftime("%Y-%m-%d", PrintJob.finished_at).label("date"),
            printer_name_col.label("printer_name"),
            func.sum(PrintJob.filament_used_g).label("grams"),
        )
        .select_from(PrintJob)
        .outerjoin(Printer, PrintJob.printer_id == Printer.id)
        .where(PrintJob.user_id == current_user.id, PrintJob.finished_at >= since)
        .group_by(text("date"), printer_name_col)
        .order_by(text("date"))
    )).all()

    date_dict: dict[str, dict] = {}
    for row in daily_rows:
        if row.date not in date_dict:
            date_dict[row.date] = {"date": row.date}
        date_dict[row.date][row.printer_name] = float(row.grams)

    return PrinterAnalytics(stats=stats, daily=sorted(date_dict.values(), key=lambda d: d["date"]))


# ── Cost tracking ─────────────────────────────────────────────────────────────

@analytics_router.get("/cost", response_model=CostAnalytics)
async def cost_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Total invested + weight (for blended $/kg)
    agg = (await db.execute(
        select(
            func.coalesce(func.sum(Spool.purchase_price), 0).label("total"),
            func.coalesce(func.sum(Spool.initial_weight), 0).label("weight"),
        )
        .where(Spool.owner_id == current_user.id, Spool.purchase_price.isnot(None))
    )).one()
    total_invested = float(agg.total)
    total_weight_g = float(agg.weight)
    blended = (total_invested / (total_weight_g / 1000)) if total_weight_g > 0 else 0.0

    # This month spend
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    this_month = float((await db.execute(
        select(func.coalesce(func.sum(Spool.purchase_price), 0))
        .where(Spool.owner_id == current_user.id, Spool.registered >= month_start)
    )).scalar_one() or 0)

    # Monthly history (last 12 months)
    twelve_ago = now - timedelta(days=365)
    monthly_rows = (await db.execute(
        select(
            func.strftime("%Y-%m", Spool.registered).label("month"),
            func.sum(Spool.purchase_price).label("spend"),
        )
        .where(
            Spool.owner_id == current_user.id,
            Spool.purchase_price.isnot(None),
            Spool.registered >= twelve_ago,
        )
        .group_by(text("month"))
        .order_by(text("month"))
    )).all()
    monthly_history = [MonthlySpend(month=r.month, spend=float(r.spend or 0)) for r in monthly_rows]
    projected = (sum(m.spend for m in monthly_history) / len(monthly_history)) if monthly_history else 0.0

    # Cost per material
    mat_col = func.coalesce(FilamentProfile.material, "Unknown")
    mat_rows = (await db.execute(
        select(
            mat_col.label("material"),
            func.sum(Spool.purchase_price).label("total_spent"),
            func.sum(Spool.initial_weight).label("total_weight"),
        )
        .select_from(Spool)
        .outerjoin(FilamentProfile, Spool.filament_id == FilamentProfile.id)
        .where(Spool.owner_id == current_user.id, Spool.purchase_price.isnot(None))
        .group_by(mat_col)
        .order_by(func.sum(Spool.purchase_price).desc())
    )).all()
    cost_by_material = [
        MaterialCost(
            material=r.material,
            cost_per_kg=round(float(r.total_spent or 0) / (float(r.total_weight or 1) / 1000), 2),
            total_spent=float(r.total_spent or 0),
        )
        for r in mat_rows
        if (r.total_weight or 0) > 0
    ]

    return CostAnalytics(
        total_invested=total_invested,
        blended_cost_per_kg=round(blended, 2),
        this_month_spend=this_month,
        projected_monthly=round(projected, 2),
        monthly_history=monthly_history,
        cost_by_material=cost_by_material,
    )
