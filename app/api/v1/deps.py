from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token, verify_api_key
from app.db.session import get_db
from app.models.models import ApiKey, User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Accepts both:
      - Bearer JWT (from login flow)
      - Bearer fh_* API key (from developer integrations)
    """
    raw_token = token or (credentials.credentials if credentials else None)

    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    # ── API key path ──────────────────────────────────────────────────────────
    if raw_token.startswith("fh_"):
        prefix = raw_token[:12]
        result = await db.execute(select(ApiKey).where(ApiKey.key_prefix == prefix))
        api_key_obj = result.scalar_one_or_none()
        if not api_key_obj or not verify_api_key(raw_token, api_key_obj.hashed_key):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
        result = await db.execute(select(User).where(User.id == api_key_obj.user_id))
        user = result.scalar_one_or_none()

    # ── JWT path ──────────────────────────────────────────────────────────────
    else:
        try:
            payload = decode_token(raw_token)
            if payload.get("type") != "access":
                raise HTTPException(status_code=401, detail="Invalid token type")
            user_id: str = payload["sub"]
        except (JWTError, KeyError):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return user


def require_role(*roles: UserRole):
    """Factory for role-based access control."""
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return _check


require_admin = require_role(UserRole.admin)
require_editor = require_role(UserRole.admin, UserRole.editor)
