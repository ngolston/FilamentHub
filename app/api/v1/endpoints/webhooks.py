"""Outbound webhook management — CRUD and test-fire."""

import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.db.session import get_db
from app.models.models import User, Webhook
from app.schemas.schemas import WebhookCreate, WebhookResponse, WebhookUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _deliver(
    webhook: Webhook,
    payload: dict,  # type: ignore[type-arg]
    db: AsyncSession,
) -> int:
    """POST payload to webhook.url; update last_triggered_at and last_status_code."""
    body = json.dumps(payload, default=str).encode()
    headers = {"Content-Type": "application/json", "User-Agent": "FilamentHub/1.0"}

    if webhook.secret:
        sig = hmac.new(webhook.secret.encode(), body, hashlib.sha256).hexdigest()
        headers["X-FilamentHub-Signature"] = f"sha256={sig}"

    status_code = 0
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(webhook.url, content=body, headers=headers)
            status_code = r.status_code
    except httpx.HTTPError as exc:
        logger.warning("Webhook %s delivery failed: %s", webhook.id, exc)
        status_code = 0

    webhook.last_triggered_at = datetime.now(UTC)
    webhook.last_status_code = status_code
    return status_code


async def _get_owned(webhook_id: int, user: User, db: AsyncSession) -> Webhook:
    result = await db.execute(
        select(Webhook).where(Webhook.id == webhook_id, Webhook.owner_id == user.id)
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return obj


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[WebhookResponse])
async def list_webhooks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Webhook)
        .where(Webhook.owner_id == current_user.id)
        .order_by(Webhook.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=WebhookResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    body: WebhookCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    webhook = Webhook(
        owner_id=current_user.id,
        name=body.name,
        url=body.url,
        events=body.events,
        secret=body.secret,
    )
    db.add(webhook)
    await db.flush()
    return webhook


@router.patch("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: int,
    body: WebhookUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    webhook = await _get_owned(webhook_id, current_user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(webhook, field, value)
    return webhook


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    webhook_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    webhook = await _get_owned(webhook_id, current_user, db)
    await db.delete(webhook)


@router.post("/{webhook_id}/test", status_code=status.HTTP_200_OK)
async def test_webhook(
    webhook_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fire a test payload to the webhook URL and return the HTTP status code."""
    webhook = await _get_owned(webhook_id, current_user, db)
    payload = {
        "event": "webhook.test",
        "triggered_at": datetime.now(UTC).isoformat(),
        "message": "This is a test delivery from FilamentHub.",
    }
    code = await _deliver(webhook, payload, db)
    success = 200 <= code < 300
    return {"status_code": code, "success": success}
