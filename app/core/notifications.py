"""Outbound notification helpers — Discord webhook and email alerts."""

import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.email import send_email

if TYPE_CHECKING:
    from app.models.models import Webhook
    from app.schemas.schemas import TriggeredAlert

logger = logging.getLogger(__name__)
settings = get_settings()


async def _post_discord(webhook_url: str, payload: dict) -> None:  # type: ignore[type-arg]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(webhook_url, json=payload)
            r.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Discord webhook failed: %s", exc)


async def send_discord_alert(
    webhook_url: str,
    alerts: list["TriggeredAlert"],
    rule_name: str,
) -> None:
    """Post a Discord embed for a batch of triggered alerts under one rule."""
    if not alerts:
        return

    critical = [a for a in alerts if a.severity == "critical"]
    low = [a for a in alerts if a.severity == "low"]
    color = 0xEF4444 if critical else 0xF59E0B  # red / amber

    lines: list[str] = []
    for a in sorted(alerts, key=lambda x: (0 if x.severity == "critical" else 1, x.remaining_pct)):
        icon = "🔴" if a.severity == "critical" else "🟡"
        name = f"{a.brand_name} — {a.spool_name}" if a.brand_name else a.spool_name
        lines.append(f"{icon} **{name}** · {a.remaining_pct:.0f}% ({a.remaining_g:.0f} g)")

    summary_parts = []
    if critical:
        summary_parts.append(f"{len(critical)} critical")
    if low:
        summary_parts.append(f"{len(low)} low")
    summary = ", ".join(summary_parts)

    embed = {
        "title": f"⚠️ FilamentHub Alert — {rule_name}",
        "description": "\n".join(lines),
        "color": color,
        "footer": {"text": f"{summary} · FilamentHub"},
    }
    await _post_discord(webhook_url, {"embeds": [embed]})


async def send_email_alert(
    to_email: str,
    alerts: list["TriggeredAlert"],
    rule_name: str,
) -> None:
    """Send an HTML email summary for triggered alerts."""
    if not alerts:
        return

    rows_html = ""
    for a in sorted(alerts, key=lambda x: (0 if x.severity == "critical" else 1, x.remaining_pct)):
        badge_color = "#EF4444" if a.severity == "critical" else "#F59E0B"
        label = f"{a.brand_name} — {a.spool_name}" if a.brand_name else a.spool_name
        rows_html += (
            f"<tr>"
            f'<td style="padding:8px 12px;border-bottom:1px solid #2d2d2d">{label}</td>'
            f'<td style="padding:8px 12px;border-bottom:1px solid #2d2d2d;text-align:center">'
            f'<span style="background:{badge_color};color:#fff;padding:2px 8px;'
            f'border-radius:9999px;font-size:12px;font-weight:600">'
            f"{a.severity.upper()}</span></td>"
            f'<td style="padding:8px 12px;border-bottom:1px solid #2d2d2d;text-align:right">'
            f"{a.remaining_pct:.0f}% ({a.remaining_g:.0f} g)</td>"
            f"</tr>"
        )

    manage_url = f"{settings.FRONTEND_URL}/alerts"
    html_body = (
        '<div style="font-family:system-ui,sans-serif;background:#1a1a1a;color:#e5e5e5;'
        'padding:32px;max-width:560px;margin:0 auto;border-radius:12px">'
        f'<h2 style="margin:0 0 4px;color:#f5f5f5">⚠️ FilamentHub Alert</h2>'
        f'<p style="margin:0 0 24px;color:#9ca3af">Rule: <strong>{rule_name}</strong></p>'
        '<table style="width:100%;border-collapse:collapse">'
        '<thead><tr style="background:#262626">'
        '<th style="padding:8px 12px;text-align:left;color:#9ca3af;font-weight:500;font-size:12px">Spool</th>'
        '<th style="padding:8px 12px;text-align:center;color:#9ca3af;font-weight:500;font-size:12px">Severity</th>'
        '<th style="padding:8px 12px;text-align:right;color:#9ca3af;font-weight:500;font-size:12px">Remaining</th>'
        f"</tr></thead><tbody>{rows_html}</tbody></table>"
        f'<p style="margin:24px 0 0;font-size:12px;color:#6b7280">'
        f'Sent by FilamentHub · <a href="{manage_url}" style="color:#818cf8">Manage alerts</a>'
        f"</p></div>"
    )

    plain = f"FilamentHub Alert — {rule_name}\n\n" + "\n".join(
        f"{'CRITICAL' if a.severity == 'critical' else 'LOW'}: "
        f"{a.spool_name} — {a.remaining_pct:.0f}% ({a.remaining_g:.0f} g)"
        for a in alerts
    )
    await send_email(
        to=to_email,
        subject=f"[FilamentHub] Filament running low — {rule_name}",
        html=html_body,
        text=plain,
    )


async def deliver_webhooks(
    db: AsyncSession,
    owner_id: str,
    event: str,
    payload: dict,  # type: ignore[type-arg]
) -> None:
    """POST payload to all active webhooks belonging to owner_id that match event."""
    from app.models.models import Webhook  # local import avoids circular

    result = await db.execute(
        select(Webhook).where(
            Webhook.owner_id == owner_id,
            Webhook.is_active.is_(True),
        )
    )
    webhooks: list["Webhook"] = result.scalars().all()

    body = json.dumps(payload, default=str).encode()
    for wh in webhooks:
        # Skip if webhook has event filter and this event isn't in it
        if wh.events:
            subscribed = {e.strip() for e in wh.events.split(",") if e.strip()}
            if event not in subscribed:
                continue

        headers = {"Content-Type": "application/json", "User-Agent": "FilamentHub/1.0"}
        if wh.secret:
            sig = hmac.new(wh.secret.encode(), body, hashlib.sha256).hexdigest()
            headers["X-FilamentHub-Signature"] = f"sha256={sig}"

        status_code = 0
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(wh.url, content=body, headers=headers)
                status_code = r.status_code
        except httpx.HTTPError as exc:
            logger.warning("Webhook %s delivery failed: %s", wh.id, exc)

        wh.last_triggered_at = datetime.now(UTC)
        wh.last_status_code = status_code
