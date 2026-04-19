"""Authentication, password management, and session endpoints."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.config import get_settings
from app.core.email import send_password_reset_email, send_verification_email
from app.core.rate_limit import auth_limiter, reset_limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_secure_token,
    generate_totp_secret,
    get_totp_uri,
    hash_password,
    hash_token,
    verify_password,
    verify_totp,
)
from app.db.session import get_db
from app.models.models import PasswordResetToken, RefreshToken, User
from app.schemas.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    RefreshRequest,
    ResetPasswordRequest,
    SessionResponse,
    TokenResponse,
    TotpSetupResponse,
    TotpVerifyRequest,
    UserLogin,
    UserRegister,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

_RESET_TOKEN_EXPIRE_HOURS = 1
_VERIFY_TOKEN_EXPIRE_HOURS = 24


# ── Helpers ───────────────────────────────────────────────────────────────────

def _device_name(request: Request) -> str:
    ua = request.headers.get("user-agent", "")
    if len(ua) > 200:
        ua = ua[:200]
    return ua or "Unknown device"


async def _store_refresh_token(
    db: AsyncSession,
    user_id: str,
    raw_token: str,
    request: Request,
) -> RefreshToken:
    forwarded_for = request.headers.get("X-Forwarded-For")
    ip = forwarded_for.split(",")[0].strip() if forwarded_for else (request.client.host if request.client else None)
    expires = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    rt = RefreshToken(
        user_id=user_id,
        token_hash=hash_token(raw_token),
        device_name=_device_name(request),
        ip_address=ip,
        expires_at=expires,
    )
    db.add(rt)
    await db.flush()
    return rt


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserRegister, request: Request, db: AsyncSession = Depends(get_db)):
    """Create a new account. Sends a verification email if SMTP is configured."""
    auth_limiter.check(request, "register")

    # Check if registration is enabled in system config
    from app.models.models import SystemConfig
    cfg_result = await db.execute(select(SystemConfig).where(SystemConfig.id == 1))
    cfg = cfg_result.scalar_one_or_none()
    if cfg is not None and not cfg.allow_registration:
        raise HTTPException(status_code=403, detail="Registration is disabled on this server")

    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    needs_verify = bool(settings.SMTP_HOST)
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        display_name=body.display_name,
        maker_name=body.maker_name,
        is_verified=not needs_verify,   # auto-verify if no SMTP
    )
    db.add(user)
    await db.flush()

    if needs_verify:
        raw = generate_secure_token()
        token = PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=datetime.now(UTC) + timedelta(hours=_VERIFY_TOKEN_EXPIRE_HOURS),
        )
        db.add(token)
        verify_url = f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={raw}"
        await send_verification_email(user.email, verify_url)

    return user


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    auth_limiter.check(request, "login")
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    user.last_login_at = datetime.now(UTC)
    raw_refresh = create_refresh_token(user.id)
    await _store_refresh_token(db, user.id, raw_refresh, request)

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=raw_refresh,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── Refresh ───────────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id: str = payload["sub"]
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from exc

    # Validate against DB
    token_hash = hash_token(body.refresh_token)
    rt_result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.is_revoked == False,  # noqa: E712
        )
    )
    stored = rt_result.scalar_one_or_none()
    if not stored or stored.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(status_code=401, detail="Session expired or revoked")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    # Rotate: revoke old, issue new
    stored.is_revoked = True
    raw_refresh = create_refresh_token(user.id)
    await _store_refresh_token(db, user.id, raw_refresh, request)

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=raw_refresh,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


# ── Change password ───────────────────────────────────────────────────────────

@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),  # noqa: ARG001 — session needed to flush entity changes
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.hashed_password = hash_password(body.new_password)


# ── Forgot / reset password ───────────────────────────────────────────────────

@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Always returns 204 to prevent email enumeration."""
    reset_limiter.check(request, "forgot-password")
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user:
        return  # silent — don't reveal whether email exists

    raw = generate_secure_token()
    token = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_token(raw),
        expires_at=datetime.now(UTC) + timedelta(hours=_RESET_TOKEN_EXPIRE_HOURS),
    )
    db.add(token)
    reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={raw}"
    await send_password_reset_email(user.email, reset_url)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    token_hash = hash_token(body.token)
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at == None,  # noqa: E711
        )
    )
    token = result.scalar_one_or_none()
    if not token or token.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user = await db.get(User, token.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    user.hashed_password = hash_password(body.new_password)
    token.used_at = datetime.now(UTC)

    # Revoke all existing sessions after password reset
    rt_result = await db.execute(
        select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.is_revoked == False)  # noqa: E712
    )
    for rt in rt_result.scalars().all():
        rt.is_revoked = True


# ── Email verification ────────────────────────────────────────────────────────

@router.post("/resend-verification", status_code=status.HTTP_204_NO_CONTENT)
async def resend_verification(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.is_verified:
        return
    raw = generate_secure_token()
    token = PasswordResetToken(
        user_id=current_user.id,
        token_hash=hash_token(raw),
        expires_at=datetime.now(UTC) + timedelta(hours=_VERIFY_TOKEN_EXPIRE_HOURS),
    )
    db.add(token)
    verify_url = f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={raw}"
    await send_verification_email(current_user.email, verify_url)


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    token_hash = hash_token(token)
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at == None,  # noqa: E711
        )
    )
    stored = result.scalar_one_or_none()
    if not stored or stored.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")

    user = await db.get(User, stored.user_id)
    if user:
        user.is_verified = True
    stored.used_at = datetime.now(UTC)


# ── Sessions ──────────────────────────────────────────────────────────────────

@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active (non-revoked, non-expired) sessions for the current user."""
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == current_user.id,
            RefreshToken.is_revoked == False,  # noqa: E712
            RefreshToken.expires_at > datetime.now(UTC),
        ).order_by(RefreshToken.last_used_at.desc())
    )
    tokens = result.scalars().all()

    # Determine current token hash from Authorization header
    auth_header = request.headers.get("Authorization", "")
    current_hash: str | None = None
    if auth_header.startswith("Bearer "):
        try:
            access_token = auth_header[7:]
            payload = decode_token(access_token)
            # We don't store access tokens; mark the most recently used session as current
            # by matching user_id and picking the newest last_used_at
            current_hash = "latest"
        except Exception:
            pass

    sessions: list[SessionResponse] = []
    for i, t in enumerate(tokens):
        s = SessionResponse.model_validate(t).model_copy(
            update={"is_current": i == 0 and current_hash == "latest"}
        )
        sessions.append(s)
    return sessions


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.id == session_id,
            RefreshToken.user_id == current_user.id,
        )
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Session not found")
    token.is_revoked = True


@router.delete("/sessions", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_all_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke all sessions (sign out everywhere)."""
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == current_user.id,
            RefreshToken.is_revoked == False,  # noqa: E712
        )
    )
    for token in result.scalars().all():
        token.is_revoked = True


# ── 2FA ───────────────────────────────────────────────────────────────────────

@router.post("/totp/setup", response_model=TotpSetupResponse)
async def totp_setup(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
    if not current_user.totp_enabled or not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA not enabled")
    if not verify_totp(current_user.totp_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")
    current_user.totp_enabled = False
    current_user.totp_secret = None
    return {"message": "2FA disabled"}
