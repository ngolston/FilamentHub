"""System-wide configuration endpoints (SMTP, etc.)."""

import smtplib

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.models import SystemConfig, User

router = APIRouter(prefix="/system", tags=["system"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class PublicConfig(BaseModel):
    allow_registration: bool


class RegistrationConfigIn(BaseModel):
    allow_registration: bool


class SmtpConfigIn(BaseModel):
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_tls: bool = True


class SmtpConfigOut(BaseModel):
    smtp_host: str | None
    smtp_port: int | None
    smtp_user: str | None
    smtp_from: str | None
    smtp_tls: bool
    configured: bool   # True if smtp_host is set


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_create_config(db: AsyncSession) -> SystemConfig:
    result = await db.execute(select(SystemConfig).where(SystemConfig.id == 1))
    cfg = result.scalar_one_or_none()
    if not cfg:
        cfg = SystemConfig(id=1)
        db.add(cfg)
        await db.flush()
    return cfg


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/smtp", response_model=SmtpConfigOut)
async def get_smtp_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current SMTP configuration. Password is never returned."""
    cfg = await _get_or_create_config(db)
    # Fall back to env vars if DB not set
    from app.core.config import get_settings
    env = get_settings()
    host = cfg.smtp_host or env.SMTP_HOST
    return SmtpConfigOut(
        smtp_host=host,
        smtp_port=cfg.smtp_port or (env.SMTP_PORT if host else None),
        smtp_user=cfg.smtp_user or env.SMTP_USER,
        smtp_from=cfg.smtp_from or env.EMAILS_FROM,
        smtp_tls=cfg.smtp_tls,
        configured=bool(host),
    )


@router.patch("/smtp", response_model=SmtpConfigOut)
async def update_smtp_config(
    body: SmtpConfigIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update SMTP settings. Omit smtp_password to leave it unchanged."""
    cfg = await _get_or_create_config(db)

    if body.smtp_host is not None:
        cfg.smtp_host = body.smtp_host or None   # empty string → NULL (clear)
    if body.smtp_port is not None:
        cfg.smtp_port = body.smtp_port
    if body.smtp_user is not None:
        cfg.smtp_user = body.smtp_user or None
    if body.smtp_password is not None:
        cfg.smtp_password = body.smtp_password or None
    if body.smtp_from is not None:
        cfg.smtp_from = body.smtp_from or None
    cfg.smtp_tls = body.smtp_tls

    await db.flush()

    from app.core.config import get_settings
    env = get_settings()
    host = cfg.smtp_host or env.SMTP_HOST
    return SmtpConfigOut(
        smtp_host=host,
        smtp_port=cfg.smtp_port or (env.SMTP_PORT if host else None),
        smtp_user=cfg.smtp_user or env.SMTP_USER,
        smtp_from=cfg.smtp_from or env.EMAILS_FROM,
        smtp_tls=cfg.smtp_tls,
        configured=bool(host),
    )


@router.post("/smtp/test", status_code=200)
async def test_smtp(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a test email to the authenticated user's address to verify SMTP settings."""
    from app.core.email import get_effective_smtp, _send_sync

    smtp = await get_effective_smtp()
    if not smtp.host:
        raise HTTPException(status_code=400, detail="SMTP is not configured")

    try:
        _send_sync(
            to=current_user.email,
            subject="FilamentHub — SMTP test",
            html="<p>Your SMTP configuration is working correctly.</p>",
            text="Your SMTP configuration is working correctly.",
            smtp=smtp,
        )
    except smtplib.SMTPException as exc:
        raise HTTPException(status_code=502, detail=f"SMTP error: {exc}") from exc
    except OSError as exc:
        raise HTTPException(status_code=502, detail=f"Connection error: {exc}") from exc

    return {"ok": True, "sent_to": current_user.email}


# ── Public instance config ─────────────────────────────────────────────────────

@router.get("/config", response_model=PublicConfig)
async def get_public_config(db: AsyncSession = Depends(get_db)):
    """Return public server configuration (no auth required).

    The login page fetches this to decide whether to show the registration link.
    """
    result = await db.execute(select(SystemConfig).where(SystemConfig.id == 1))
    cfg = result.scalar_one_or_none()
    return PublicConfig(allow_registration=cfg.allow_registration if cfg else True)


@router.patch("/config", response_model=PublicConfig)
async def update_public_config(
    body: RegistrationConfigIn,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update server-wide public configuration. Admin only."""
    cfg = await _get_or_create_config(db)
    cfg.allow_registration = body.allow_registration
    await db.flush()
    return PublicConfig(allow_registration=cfg.allow_registration)
