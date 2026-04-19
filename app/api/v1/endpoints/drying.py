"""Drying session endpoints."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_editor
from app.db.session import get_db
from app.models.models import DryingSession, Spool, User
from app.schemas.schemas import DryingSessionCreate, DryingSessionResponse

drying_router = APIRouter(prefix="/drying-sessions", tags=["drying"])


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

