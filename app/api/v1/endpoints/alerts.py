"""Alert rule endpoints — CRUD + triggered-alert computation."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_editor
from app.db.session import get_db
from app.models.models import AlertRule, Spool, FilamentProfile, Brand, User
from app.schemas.schemas import (
    AlertRuleCreate,
    AlertRuleUpdate,
    AlertRuleResponse,
    TriggeredAlert,
)

router = APIRouter(prefix="/alert-rules", tags=["alerts"])


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _triggered_for_rule(
    rule: AlertRule,
    spools: list[Spool],
) -> list[TriggeredAlert]:
    """Return triggered-alert objects for all spools that breach this rule."""
    results: list[TriggeredAlert] = []
    for spool in spools:
        if spool.status == "archived":
            continue
        if rule.material_filter:
            mat = spool.filament.material if spool.filament else None
            if not mat or mat.upper() != rule.material_filter.upper():
                continue
        pct = spool.fill_percentage
        if pct <= rule.critical_threshold_pct:
            severity = "critical"
        elif pct <= rule.low_threshold_pct:
            severity = "low"
        else:
            continue

        filament = spool.filament
        results.append(TriggeredAlert(
            spool_id=spool.id,
            spool_name=(
                spool.name
                or (filament.name if filament else None)
                or f"Spool #{spool.id}"
            ),
            material=filament.material if filament else None,
            brand_name=filament.brand.name if (filament and filament.brand) else None,
            color_hex=filament.color_hex if filament else None,
            remaining_g=round(spool.remaining_weight, 1),
            remaining_pct=round(pct, 1),
            severity=severity,
            rule_id=rule.id,
            rule_name=rule.name,
        ))
    return results


# ── List rules ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[AlertRuleResponse])
async def list_alert_rules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rules_q = await db.execute(
        select(AlertRule)
        .where(AlertRule.owner_id == current_user.id)
        .order_by(AlertRule.created_at.desc())
    )
    rules = rules_q.scalars().all()

    # Load spools once, eagerly joined to filament+brand for threshold checks
    from sqlalchemy.orm import selectinload
    spools_q = await db.execute(
        select(Spool)
        .where(Spool.owner_id == current_user.id)
        .where(Spool.status != "archived")
        .options(
            selectinload(Spool.filament).selectinload(FilamentProfile.brand)
        )
    )
    spools = spools_q.scalars().all()

    items: list[AlertRuleResponse] = []
    for rule in rules:
        triggered = await _triggered_for_rule(rule, spools) if rule.is_active else []
        item = AlertRuleResponse.model_validate(rule).model_copy(
            update={"triggered_count": len(triggered)}
        )
        items.append(item)
    return items


# ── Triggered alerts ──────────────────────────────────────────────────────────

@router.get("/triggered", response_model=list[TriggeredAlert])
async def get_triggered_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return every spool that currently breaches at least one active alert rule."""
    from sqlalchemy.orm import selectinload

    rules_q = await db.execute(
        select(AlertRule)
        .where(AlertRule.owner_id == current_user.id, AlertRule.is_active == True)  # noqa: E712
    )
    rules = rules_q.scalars().all()
    if not rules:
        return []

    spools_q = await db.execute(
        select(Spool)
        .where(Spool.owner_id == current_user.id)
        .where(Spool.status != "archived")
        .options(
            selectinload(Spool.filament).selectinload(FilamentProfile.brand)
        )
    )
    spools = spools_q.scalars().all()

    # Deduplicate by (spool_id, severity) — keep the most critical per spool
    seen: dict[int, TriggeredAlert] = {}
    for rule in rules:
        for alert in await _triggered_for_rule(rule, spools):
            existing = seen.get(alert.spool_id)
            if existing is None or (alert.severity == "critical" and existing.severity == "low"):
                seen[alert.spool_id] = alert

    # Sort: critical first, then by remaining_pct ascending
    return sorted(
        seen.values(),
        key=lambda a: (0 if a.severity == "critical" else 1, a.remaining_pct),
    )


# ── Create rule ───────────────────────────────────────────────────────────────

@router.post("", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_alert_rule(
    body: AlertRuleCreate,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    rule = AlertRule(owner_id=current_user.id, **body.model_dump())
    db.add(rule)
    await db.flush()
    return AlertRuleResponse.model_validate(rule)


# ── Update rule ───────────────────────────────────────────────────────────────

@router.patch("/{rule_id}", response_model=AlertRuleResponse)
async def update_alert_rule(
    rule_id: int,
    body: AlertRuleUpdate,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AlertRule).where(AlertRule.id == rule_id, AlertRule.owner_id == current_user.id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)

    await db.flush()
    return AlertRuleResponse.model_validate(rule)


# ── Delete rule ───────────────────────────────────────────────────────────────

@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
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
