from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_totp_secret,
    get_totp_uri,
    hash_password,
    verify_password,
    verify_totp,
)
from app.db.session import get_db
from app.models.models import User
from app.schemas.schemas import (
    RefreshRequest,
    TokenResponse,
    TotpSetupResponse,
    TotpVerifyRequest,
    UserLogin,
    UserRegister,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserRegister, db: AsyncSession = Depends(get_db)):
    """Create a new account. Email must be unique."""
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        display_name=body.display_name,
        maker_name=body.maker_name,
    )
    db.add(user)
    await db.flush()
    return user


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    user.last_login_at = datetime.now(UTC)

    from app.core.config import get_settings
    settings = get_settings()

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id: str = payload["sub"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    from app.core.config import get_settings
    settings = get_settings()

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


# ── 2FA ───────────────────────────────────────────────────────────────────────

@router.post("/totp/setup", response_model=TotpSetupResponse)
async def totp_setup(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a new TOTP secret and return the otpauth:// URI for the QR code."""
    if current_user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA already enabled")
    secret = generate_totp_secret()
    current_user.totp_secret = secret
    return TotpSetupResponse(secret=secret, uri=get_totp_uri(secret, current_user.email))


@router.post("/totp/enable")
async def totp_enable(
    body: TotpVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Confirm the TOTP code and activate 2FA on the account."""
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="Run /totp/setup first")
    if not verify_totp(current_user.totp_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")
    current_user.totp_enabled = True
    return {"message": "2FA enabled successfully"}


@router.post("/totp/disable")
async def totp_disable(
    body: TotpVerifyRequest,
    current_user: User = Depends(get_current_user),
):
    """Disable 2FA after verifying one last code."""
    if not current_user.totp_enabled or not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA not enabled")
    if not verify_totp(current_user.totp_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")
    current_user.totp_enabled = False
    current_user.totp_secret = None
    return {"message": "2FA disabled"}
