"""Drying session and alert rule endpoints."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_editor
from app.db.session import get_db
from app.models.models import AlertRule, DryingSession, Spool, User
from app.schemas.schemas import DryingSessionCreate, DryingSessionResponse

drying_router = APIRouter(prefix="/drying-sessions", tags=["drying"])
alerts_router = APIRouter(prefix="/alert-rules", tags=["alerts"])


# ── Drying sessions ───────────────────────────────────────────────────────────

@drying_router.post("/spools/{spool_id}/dry", response_model=DryingSessionResponse, status_code=201)
async def start_drying(
    spool_id: int,
    body: DryingSessionCreate,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    spool = await db.get(Spool, spool_id)
    if not spool or spool.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Spool not found")

    session = DryingSession(spool_id=spool_id, **body.model_dump())
    db.add(session)
    spool.status = "drying"
    await db.flush()
    return session


@drying_router.patch("/{session_id}/finish", response_model=DryingSessionResponse)
async def finish_drying(
    session_id: int,
    humidity_after: float | None = None,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DryingSession)
        .join(Spool, DryingSession.spool_id == Spool.id)
        .where(DryingSession.id == session_id, Spool.owner_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Drying session not found")

    session.finished_at = datetime.now(UTC)
    if humidity_after is not None:
        session.humidity_after = humidity_after

    spool = await db.get(Spool, session.spool_id)
    if spool:
        spool.status = "active"

    return session


@drying_router.get("/spools/{spool_id}", response_model=list[DryingSessionResponse])
async def get_spool_drying_history(
    spool_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    spool = await db.get(Spool, spool_id)
    if not spool or spool.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Spool not found")

    result = await db.execute(
        select(DryingSession)
        .where(DryingSession.spool_id == spool_id)
        .order_by(DryingSession.started_at.desc())
    )
    return result.scalars().all()


# ── Alert rules ───────────────────────────────────────────────────────────────

@alerts_router.get("")
async def list_alert_rules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AlertRule).where(AlertRule.owner_id == current_user.id)
    )
    return result.scalars().all()


@alerts_router.post("", status_code=status.HTTP_201_CREATED)
async def create_alert_rule(
    name: str,
    low_threshold_pct: float = 20.0,
    critical_threshold_pct: float = 10.0,
    material_filter: str | None = None,
    notify_discord: bool = True,
    notify_email: bool = False,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    rule = AlertRule(
        owner_id=current_user.id,
        name=name,
        low_threshold_pct=low_threshold_pct,
        critical_threshold_pct=critical_threshold_pct,
        material_filter=material_filter,
        notify_discord=notify_discord,
        notify_email=notify_email,
    )
    db.add(rule)
    await db.flush()
    return rule


@alerts_router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_rule(
    rule_id: int,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AlertRule).where(AlertRule.id == rule_id, AlertRule.owner_id == current_user.id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    await db.delete(rule)
