"""API key management, user settings, and danger-zone endpoints."""

import json

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.security import generate_api_key, verify_password
from app.db.session import get_db
from app.models.models import ApiKey, DryingSession, PrintJob, Spool, User, WeightLog
from app.schemas.schemas import UserResponse, UserUpdate
from app.services.storage import upload_avatar

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/me/avatar", response_model=UserResponse)
async def update_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a new avatar image. Replaces any existing avatar."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    url = await upload_avatar(str(current_user.id), file)
    current_user.avatar_url = url
    await db.flush()
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    return current_user


# ── API keys ──────────────────────────────────────────────────────────────────

@router.get("/me/api-keys")
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.user_id == current_user.id)
        .order_by(ApiKey.created_at.desc())
    )
    keys = result.scalars().all()
    # Never return the hashed key — only safe metadata
    return [
        {
            "id": k.id,
            "name": k.name,
            "key_prefix": k.key_prefix,
            "scopes": k.scopes,
            "last_used_at": k.last_used_at,
            "expires_at": k.expires_at,
            "created_at": k.created_at,
        }
        for k in keys
    ]


@router.post("/me/api-keys", status_code=status.HTTP_201_CREATED)
async def create_api_key(
    name: str,
    scopes: str = "read",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a new API key. The raw key is returned ONCE — store it securely.
    Subsequent calls only return the prefix (first 12 chars).
    """
    raw_key, hashed = generate_api_key()
    prefix = raw_key[:12]

    key_obj = ApiKey(
        user_id=current_user.id,
        name=name,
        key_prefix=prefix,
        hashed_key=hashed,
        scopes=scopes,
    )
    db.add(key_obj)
    await db.flush()

    return {
        "id": key_obj.id,
        "name": name,
        "key": raw_key,          # shown once only
        "key_prefix": prefix,
        "scopes": scopes,
        "created_at": key_obj.created_at,
        "warning": "Store this key now — it will not be shown again.",
    }


@router.delete("/me/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    )
    key_obj = result.scalar_one_or_none()
    if not key_obj:
        raise HTTPException(status_code=404, detail="API key not found")
    await db.delete(key_obj)


# ── Danger zone ───────────────────────────────────────────────────────────────

@router.delete("/me/inventory", status_code=status.HTTP_204_NO_CONTENT)
async def clear_inventory(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete all spools (and their weight logs via cascade) for the current user."""
    await db.execute(delete(Spool).where(Spool.owner_id == current_user.id))


@router.delete("/me/history", status_code=status.HTTP_204_NO_CONTENT)
async def clear_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete all print jobs and drying sessions for the current user."""
    await db.execute(delete(PrintJob).where(PrintJob.user_id == current_user.id))
    # Drying sessions belong to spools; delete the user's own spool drying records
    spool_ids_q = select(Spool.id).where(Spool.owner_id == current_user.id)
    await db.execute(delete(DryingSession).where(DryingSession.spool_id.in_(spool_ids_q)))
    # Weight logs are per-spool
    await db.execute(delete(WeightLog).where(WeightLog.spool_id.in_(spool_ids_q)))


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    password: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete the authenticated user and all their data."""
    if not verify_password(password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password")
    await db.delete(current_user)


# ── Notification preferences ──────────────────────────────────────────────────

_DEFAULT_PREFS: dict = {  # type: ignore[type-arg]
    "alerts": {
        "runout": True, "low_stock": True, "drying": True,
        "print_done": False, "job_failed": True, "spool_empty": True,
    },
    "email": {
        "runout": False, "low_stock": False,
        "drying": False, "weekly_digest": True,
    },
    "quiet_hours": {
        "enabled": False, "start": "22:00", "end": "08:00",
    },
}


@router.get("/me/notification-prefs")
async def get_notification_prefs(
    current_user: User = Depends(get_current_user),
):
    if current_user.notification_prefs:
        stored = json.loads(current_user.notification_prefs)
        # Deep-merge: stored values override defaults so new keys still appear
        prefs = {**_DEFAULT_PREFS}
        for section, defaults in _DEFAULT_PREFS.items():
            if isinstance(defaults, dict):
                prefs[section] = {**defaults, **stored.get(section, {})}
        return prefs
    return _DEFAULT_PREFS


@router.patch("/me/notification-prefs")
async def update_notification_prefs(
    body: dict,  # type: ignore[type-arg]
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = json.loads(current_user.notification_prefs) if current_user.notification_prefs else {}
    # Deep-merge patch onto stored state
    for section, values in body.items():
        if isinstance(values, dict) and isinstance(existing.get(section), dict):
            existing[section] = {**existing[section], **values}
        else:
            existing[section] = values
    current_user.notification_prefs = json.dumps(existing)
    await db.flush()
    return existing


# ── UI / appearance preferences ───────────────────────────────────────────────

_DEFAULT_UI_PREFS: dict = {  # type: ignore[type-arg]
    "general": {
        "view_mode": "grid",
        "date_range": "30d",
        "sort_order": "date_added",
        "page_size": 24,
        "delete_confirm": True,
        "auto_sync": True,
        "low_stock_banner": True,
        "hotkeys": True,
    },
    "appearance": {
        "theme": "theme-dark",
        "accent": "#4f46e5",
        "accent_custom": "",
        "density": "default",
        "font_size": "medium",
        "reduce_motion": False,
    },
}


@router.get("/me/ui-prefs")
async def get_ui_prefs(
    current_user: User = Depends(get_current_user),
):
    if current_user.ui_prefs:
        stored = json.loads(current_user.ui_prefs)
        prefs = {**_DEFAULT_UI_PREFS}
        for section, defaults in _DEFAULT_UI_PREFS.items():
            if isinstance(defaults, dict):
                prefs[section] = {**defaults, **stored.get(section, {})}
        return prefs
    return _DEFAULT_UI_PREFS


@router.patch("/me/ui-prefs")
async def update_ui_prefs(
    body: dict,  # type: ignore[type-arg]
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = json.loads(current_user.ui_prefs) if current_user.ui_prefs else {}
    for section, values in body.items():
        if isinstance(values, dict) and isinstance(existing.get(section), dict):
            existing[section] = {**existing[section], **values}
        else:
            existing[section] = values
    current_user.ui_prefs = json.dumps(existing)
    await db.flush()
    return existing
