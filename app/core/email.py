"""
Email delivery service.

Uses Python stdlib smtplib in a thread executor (non-blocking).
If SMTP is not configured, emails are printed to stdout (dev mode).

SMTP settings are resolved in this order:
  1. system_config table in the database (admin-configurable via UI)
  2. Environment variables / .env file (SMTP_HOST, SMTP_PORT, etc.)
"""

import asyncio
import logging
import smtplib
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from functools import partial

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class SmtpSettings:
    host: str | None
    port: int
    user: str | None
    password: str | None
    from_addr: str
    tls: bool


async def get_effective_smtp() -> SmtpSettings:
    """Return SMTP settings, preferring DB config over env vars."""
    from sqlalchemy import select
    from app.db.session import AsyncSessionLocal
    from app.models.models import SystemConfig

    env = get_settings()
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(SystemConfig).where(SystemConfig.id == 1))
            cfg = result.scalar_one_or_none()
    except Exception:
        cfg = None

    if cfg and cfg.smtp_host:
        return SmtpSettings(
            host=cfg.smtp_host,
            port=cfg.smtp_port or 587,
            user=cfg.smtp_user,
            password=cfg.smtp_password,
            from_addr=cfg.smtp_from or env.EMAILS_FROM,
            tls=cfg.smtp_tls,
        )

    return SmtpSettings(
        host=env.SMTP_HOST,
        port=env.SMTP_PORT,
        user=env.SMTP_USER,
        password=env.SMTP_PASSWORD,
        from_addr=env.EMAILS_FROM,
        tls=True,
    )


def _send_sync(
    to: str,
    subject: str,
    html: str,
    text: str,
    smtp: SmtpSettings,
) -> None:
    if not smtp.host:
        logger.info(
            "EMAIL (no SMTP configured)\n"
            "  To:      %s\n"
            "  Subject: %s\n"
            "  Body:    %s",
            to, subject, text,
        )
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = smtp.from_addr
    msg["To"]      = to
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(smtp.host, smtp.port) as server:
        server.ehlo()
        if smtp.tls:
            server.starttls()
        if smtp.user and smtp.password:
            server.login(smtp.user, smtp.password)
        server.sendmail(smtp.from_addr, to, msg.as_string())


async def send_email(to: str, subject: str, html: str, text: str) -> None:
    smtp = await get_effective_smtp()
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, partial(_send_sync, to, subject, html, text, smtp))


# ── Templates ─────────────────────────────────────────────────────────────────

async def send_password_reset_email(to: str, reset_url: str) -> None:
    subject = "Reset your FilamentHub password"
    text = (
        f"You requested a password reset for your FilamentHub account.\n\n"
        f"Click the link below to set a new password (expires in 1 hour):\n{reset_url}\n\n"
        f"If you didn't request this, you can safely ignore this email."
    )
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1e1b4b;margin-bottom:8px">Reset your password</h2>
      <p style="color:#4b5563;margin-bottom:24px">
        You requested a password reset for your FilamentHub account.
        Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
      </p>
      <a href="{reset_url}"
         style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;
                border-radius:8px;text-decoration:none;font-weight:600">
        Reset password
      </a>
      <p style="color:#9ca3af;font-size:13px;margin-top:24px">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
    """
    await send_email(to, subject, html, text)


async def send_verification_email(to: str, verify_url: str) -> None:
    subject = "Verify your FilamentHub email"
    text = (
        f"Welcome to FilamentHub!\n\n"
        f"Please verify your email address by visiting:\n{verify_url}\n\n"
        f"This link expires in 24 hours."
    )
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1e1b4b;margin-bottom:8px">Verify your email</h2>
      <p style="color:#4b5563;margin-bottom:24px">
        Welcome to FilamentHub! Click the button below to verify your email address.
        This link expires in <strong>24 hours</strong>.
      </p>
      <a href="{verify_url}"
         style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;
                border-radius:8px;text-decoration:none;font-weight:600">
        Verify email
      </a>
    </div>
    """
    await send_email(to, subject, html, text)
