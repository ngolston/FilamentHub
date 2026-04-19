"""Background scheduler — periodically checks alert rules and fires notifications.

Uses APScheduler's AsyncIOScheduler so all DB I/O stays on the event loop.
The scheduler is started during FastAPI lifespan startup and stopped on shutdown.

Notification deduplication:
  - A (rule_id, spool_id) pair fires at most once per ALERT_COOLDOWN_HOURS (default 4).
  - If severity *escalates* from low → critical the cooldown is bypassed.
  - State is persisted in the `alert_fired` table so restarts don't cause a storm.
"""

import logging
from datetime import UTC, datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.notifications import deliver_webhooks, send_discord_alert, send_email_alert
from app.db.session import AsyncSessionLocal
from app.models.models import AlertFired, AlertRule, FilamentProfile, Spool, User
from app.schemas.schemas import TriggeredAlert

logger = logging.getLogger(__name__)
settings = get_settings()

ALERT_COOLDOWN_HOURS = 4


# ── Per-rule helpers ──────────────────────────────────────────────────────────

def _triggered_spools(
    rule: AlertRule,
    owner_spools: list[Spool],
) -> list[tuple[Spool, str]]:
    """Return (spool, severity) pairs that breach this rule."""
    results: list[tuple[Spool, str]] = []
    for spool in owner_spools:
        if rule.material_filter:
            mat = spool.filament.material if spool.filament else None
            if not mat or mat.upper() != rule.material_filter.upper():
                continue
        pct = spool.fill_percentage
        if pct <= rule.critical_threshold_pct:
            results.append((spool, "critical"))
        elif pct <= rule.low_threshold_pct:
            results.append((spool, "low"))
    return results


def _needs_notification(
    spool_id: int,
    severity: str,
    fired_map: dict[tuple[int, int], AlertFired],
    rule_id: int,
    cooldown_cutoff: datetime,
) -> bool:
    existing = fired_map.get((rule_id, spool_id))
    if existing is None:
        return True
    if existing.fired_at.replace(tzinfo=UTC) < cooldown_cutoff:
        return True
    return severity == "critical" and existing.severity == "low"


def _build_alert_object(spool: Spool, severity: str, rule: AlertRule) -> TriggeredAlert:
    filament = spool.filament
    return TriggeredAlert(
        spool_id=spool.id,
        spool_name=spool.name or (filament.name if filament else None) or f"Spool #{spool.id}",
        material=filament.material if filament else None,
        brand_name=filament.brand.name if (filament and filament.brand) else None,
        color_hex=filament.color_hex if filament else None,
        remaining_g=round(spool.remaining_weight, 1),
        remaining_pct=round(spool.fill_percentage, 1),
        severity=severity,
        rule_id=rule.id,
        rule_name=rule.name,
    )


async def _process_rule(
    rule: AlertRule,
    owner_spools: list[Spool],
    fired_map: dict[tuple[int, int], AlertFired],
    cooldown_cutoff: datetime,
    db: AsyncSession,
) -> list[tuple[Spool, str]]:
    """Check a rule, fire notifications, return (spool, severity) pairs that fired."""
    triggered = _triggered_spools(rule, owner_spools)
    if not triggered:
        return []

    owner: User = rule.owner  # type: ignore[assignment]
    to_notify = [
        (s, sev) for s, sev in triggered
        if _needs_notification(s.id, sev, fired_map, rule.id, cooldown_cutoff)
    ]
    if not to_notify:
        return []

    alert_objects = [_build_alert_object(s, sev, rule) for s, sev in to_notify]

    webhook_url = owner.discord_webhook_url or settings.DISCORD_WEBHOOK_URL
    if rule.notify_discord and webhook_url:
        await send_discord_alert(webhook_url, alert_objects, rule.name)
    if rule.notify_email and owner.email:
        await send_email_alert(owner.email, alert_objects, rule.name)

    # Deliver to user-configured outbound webhooks
    wh_payload = {
        "event": "spool.alert",
        "triggered_at": datetime.now(UTC).isoformat(),
        "rule": {"id": rule.id, "name": rule.name},
        "alerts": [
            {
                "spool_id": a.spool_id,
                "spool_name": a.spool_name,
                "material": a.material,
                "brand_name": a.brand_name,
                "remaining_g": a.remaining_g,
                "remaining_pct": a.remaining_pct,
                "severity": a.severity,
            }
            for a in alert_objects
        ],
    }
    await deliver_webhooks(db, owner.id, "spool.alert", wh_payload)

    logger.info("Rule %d (%s): notified for %d spool(s).", rule.id, rule.name, len(to_notify))
    return to_notify


# ── Main job ──────────────────────────────────────────────────────────────────

async def _check_alerts() -> None:
    """Scheduler job — runs on every tick."""
    logger.debug("Running alert check…")
    async with AsyncSessionLocal() as db:
        rules_q = await db.execute(
            select(AlertRule)
            .where(AlertRule.is_active == True)  # noqa: E712
            .options(selectinload(AlertRule.owner))
        )
        rules: list[AlertRule] = rules_q.scalars().all()
        if not rules:
            return

        spools_q = await db.execute(
            select(Spool)
            .where(Spool.status != "archived")
            .options(selectinload(Spool.filament).selectinload(FilamentProfile.brand))
        )
        all_spools: list[Spool] = spools_q.scalars().all()

        fired_q = await db.execute(select(AlertFired))
        fired_map: dict[tuple[int, int], AlertFired] = {
            (f.rule_id, f.spool_id): f for f in fired_q.scalars().all()
        }

        cooldown_cutoff = datetime.now(UTC) - timedelta(hours=ALERT_COOLDOWN_HOURS)
        now = datetime.now(UTC)

        for rule in rules:
            owner: User = rule.owner  # type: ignore[assignment]
            owner_spools = [s for s in all_spools if s.owner_id == owner.id]
            fired = await _process_rule(rule, owner_spools, fired_map, cooldown_cutoff, db)

            for spool, severity in fired:
                key = (rule.id, spool.id)
                if key in fired_map:
                    fired_map[key].severity = severity
                    fired_map[key].fired_at = now
                else:
                    rec = AlertFired(
                        rule_id=rule.id, spool_id=spool.id, severity=severity, fired_at=now,
                    )
                    db.add(rec)
                    fired_map[key] = rec

        await db.commit()


# ── Factory ───────────────────────────────────────────────────────────────────

def create_scheduler() -> AsyncIOScheduler:
    """Create and configure the APScheduler instance (does not start it)."""
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        _check_alerts,
        trigger="interval",
        minutes=30,
        id="alert_check",
        name="Check filament alert rules",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    return scheduler
