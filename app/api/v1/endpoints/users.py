"""API key management and user settings endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.security import generate_api_key
from app.db.session import get_db
from app.models.models import ApiKey, User
from app.schemas.schemas import UserResponse, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


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
