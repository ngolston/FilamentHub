"""
FilamentHub — SQLAlchemy ORM models.

Schema is intentionally compatible with Spoolman's data model so that
existing Spoolman users can migrate via a JSON/CSV import.
"""

import uuid
from datetime import UTC, datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def now_utc() -> datetime:
    return datetime.now(UTC)


def new_uuid() -> str:
    return str(uuid.uuid4())


# ── Enums ─────────────────────────────────────────────────────────────────────

class UserRole(str, PyEnum):
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


class SpoolStatus(str, PyEnum):
    active = "active"       # in rotation, loaded or ready to load
    storage = "storage"     # on the shelf, available to load
    archived = "archived"   # retired, analytics only


class PrinterStatus(str, PyEnum):
    idle = "idle"
    printing = "printing"
    paused = "paused"
    error = "error"
    offline = "offline"


class PrinterConnectionType(str, PyEnum):
    octoprint = "octoprint"
    moonraker = "moonraker"
    bambu = "bambu"
    manual = "manual"


class PrintJobOutcome(str, PyEnum):
    success = "success"
    failed = "failed"
    cancelled = "cancelled"


class AlertSeverity(str, PyEnum):
    info = "info"
    warning = "warning"
    critical = "critical"


# ── Users ─────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    maker_name: Mapped[str | None] = mapped_column(String(100))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.editor)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=True)   # True = email confirmed

    # 2FA
    totp_secret: Mapped[str | None] = mapped_column(String(32))
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # Preferences (JSON stored as text for simplicity; use JSONB in PG directly if preferred)
    preferred_weight_unit: Mapped[str] = mapped_column(String(10), default="g")
    preferred_temp_unit: Mapped[str] = mapped_column(String(1), default="C")
    preferred_currency: Mapped[str] = mapped_column(String(3), default="USD")
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")

    # Integrations
    discord_webhook_url: Mapped[str | None] = mapped_column(String(500))
    bambu_config: Mapped[str | None] = mapped_column(Text)   # JSON: {access_token, refresh_token, username}
    ha_config: Mapped[str | None] = mapped_column(Text)      # JSON: {url, token}

    # Notification preferences (serialised JSON blob; parsed in the API layer)
    notification_prefs: Mapped[str | None] = mapped_column(Text)

    # UI / appearance preferences (serialised JSON blob)
    ui_prefs: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    api_keys: Mapped[list["ApiKey"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    spools: Mapped[list["Spool"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    printers: Mapped[list["Printer"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    print_jobs: Mapped[list["PrintJob"]] = relationship(back_populates="user")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    password_reset_tokens: Mapped[list["PasswordResetToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(12), nullable=False)  # shown in UI e.g. "fh_abc123…"
    hashed_key: Mapped[str] = mapped_column(String(255), nullable=False)
    scopes: Mapped[str] = mapped_column(String(200), default="read")  # space-separated
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    user: Mapped["User"] = relationship(back_populates="api_keys")


# ── Filament brands & profiles ────────────────────────────────────────────────

class Brand(Base):
    """Manufacturer / brand — e.g. Bambu Lab, Polymaker, eSun."""
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    website: Mapped[str | None] = mapped_column(String(500))
    country_of_origin: Mapped[str | None] = mapped_column(String(100))
    logo_url: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    filament_profiles: Mapped[list["FilamentProfile"]] = relationship(back_populates="brand")
    spools: Mapped[list["Spool"]] = relationship(back_populates="brand")


class FilamentProfile(Base):
    """
    A reusable filament specification — material + brand + color + print settings.
    Mirrors Spoolman's 'Filament' entity. Spools reference these profiles.
    """
    __tablename__ = "filament_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brand_id: Mapped[int | None] = mapped_column(ForeignKey("brands.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    material: Mapped[str] = mapped_column(String(50), nullable=False)  # PLA, PETG, ABS, TPU…
    color_name: Mapped[str | None] = mapped_column(String(100))
    color_hex: Mapped[str | None] = mapped_column(String(7))          # e.g. "#4F46E5"
    diameter: Mapped[float] = mapped_column(Float, default=1.75)      # mm
    density: Mapped[float | None] = mapped_column(Float)              # g/cm³

    # Print settings
    print_temp_min: Mapped[int | None] = mapped_column(Integer)       # °C
    print_temp_max: Mapped[int | None] = mapped_column(Integer)
    bed_temp_min: Mapped[int | None] = mapped_column(Integer)
    bed_temp_max: Mapped[int | None] = mapped_column(Integer)
    max_print_speed: Mapped[int | None] = mapped_column(Integer)      # mm/s
    drying_temp: Mapped[int | None] = mapped_column(Integer)          # °C
    drying_duration: Mapped[int | None] = mapped_column(Integer)      # hours

    # Community profile metadata
    is_community: Mapped[bool] = mapped_column(Boolean, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    product_url: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    brand: Mapped["Brand | None"] = relationship(back_populates="filament_profiles")
    spools: Mapped[list["Spool"]] = relationship(back_populates="filament")

    __table_args__ = (
        Index("ix_filament_profiles_material", "material"),
        Index("ix_filament_profiles_brand_id", "brand_id"),
    )


# ── Spools ────────────────────────────────────────────────────────────────────

class StorageLocation(Base):
    __tablename__ = "storage_locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "Dry Box #1"
    description: Mapped[str | None] = mapped_column(String(300))
    is_dry_box: Mapped[bool] = mapped_column(Boolean, default=False)

    spools: Mapped[list["Spool"]] = relationship(back_populates="location")


class Spool(Base):
    """
    A physical spool of filament owned by a user.
    Spoolman-compatible: id, registered, first_used, last_used, weight,
    spool_weight, used_weight, remaining_weight, lot_nr, comment.
    """
    __tablename__ = "spools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filament_id: Mapped[int | None] = mapped_column(ForeignKey("filament_profiles.id", ondelete="SET NULL"))
    brand_id: Mapped[int | None] = mapped_column(ForeignKey("brands.id", ondelete="SET NULL"))
    location_id: Mapped[int | None] = mapped_column(ForeignKey("storage_locations.id", ondelete="SET NULL"))

    # Identity
    name: Mapped[str | None] = mapped_column(String(200))  # optional custom name
    lot_nr: Mapped[str | None] = mapped_column(String(100))
    photo_url: Mapped[str | None] = mapped_column(String(500))

    # Weight tracking (grams) — Spoolman-compatible field names
    initial_weight: Mapped[float] = mapped_column(Float, nullable=False)   # net filament weight
    spool_weight: Mapped[float | None] = mapped_column(Float)              # empty spool tare
    used_weight: Mapped[float] = mapped_column(Float, default=0.0)

    @property
    def remaining_weight(self) -> float:
        return max(0.0, self.initial_weight - self.used_weight)

    @property
    def fill_percentage(self) -> float:
        if self.initial_weight <= 0:
            return 0.0
        return round(self.remaining_weight / self.initial_weight * 100, 1)

    # Purchase info
    purchase_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    purchase_price: Mapped[float | None] = mapped_column(Float)
    supplier: Mapped[str | None] = mapped_column(String(200))
    product_url: Mapped[str | None] = mapped_column(String(500))

    # Extra colors (for multi-color / gradient / silk filaments)
    extra_color_hex_2: Mapped[str | None] = mapped_column(String(7))
    extra_color_hex_3: Mapped[str | None] = mapped_column(String(7))
    extra_color_hex_4: Mapped[str | None] = mapped_column(String(7))

    # Status
    status: Mapped[SpoolStatus] = mapped_column(Enum(SpoolStatus), default=SpoolStatus.storage)
    notes: Mapped[str | None] = mapped_column(Text)

    # Timestamps (Spoolman-compatible)
    registered: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    first_used: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="spools")
    filament: Mapped["FilamentProfile | None"] = relationship(back_populates="spools")
    brand: Mapped["Brand | None"] = relationship(back_populates="spools")
    location: Mapped["StorageLocation | None"] = relationship(back_populates="spools")
    print_jobs: Mapped[list["PrintJob"]] = relationship(back_populates="spool")
    weight_logs: Mapped[list["WeightLog"]] = relationship(back_populates="spool", cascade="all, delete-orphan")
    drying_sessions: Mapped[list["DryingSession"]] = relationship(back_populates="spool", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_spools_owner_id", "owner_id"),
        Index("ix_spools_status", "status"),
    )


class WeightLog(Base):
    """Manual scale measurement log — used to correct remaining weight."""
    __tablename__ = "weight_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    spool_id: Mapped[int] = mapped_column(ForeignKey("spools.id", ondelete="CASCADE"))
    measured_weight: Mapped[float] = mapped_column(Float, nullable=False)  # total (spool + filament)
    net_weight: Mapped[float] = mapped_column(Float, nullable=False)        # filament only
    notes: Mapped[str | None] = mapped_column(String(300))
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    spool: Mapped["Spool"] = relationship(back_populates="weight_logs")


# ── Printers ──────────────────────────────────────────────────────────────────

class Printer(Base):
    __tablename__ = "printers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str | None] = mapped_column(String(100))
    connection_type: Mapped[PrinterConnectionType] = mapped_column(
        Enum(PrinterConnectionType), default=PrinterConnectionType.manual
    )
    serial_number: Mapped[str | None] = mapped_column(String(100))  # Bambu printer serial
    api_url: Mapped[str | None] = mapped_column(String(500))        # OctoPrint / Moonraker / Bambu IP
    api_key: Mapped[str | None] = mapped_column(String(200))        # API key or Bambu access code
    status: Mapped[PrinterStatus] = mapped_column(Enum(PrinterStatus), default=PrinterStatus.offline)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    direct_spool_id: Mapped[int | None] = mapped_column(
        ForeignKey("spools.id", ondelete="SET NULL"), nullable=True
    )

    owner: Mapped["User"] = relationship(back_populates="printers")
    print_jobs: Mapped[list["PrintJob"]] = relationship(back_populates="printer")
    ams_units: Mapped[list["AmsUnit"]] = relationship(back_populates="printer", cascade="all, delete-orphan")
    direct_spool: Mapped["Spool | None"] = relationship(foreign_keys=[direct_spool_id])


class AmsUnit(Base):
    """An AMS (Automatic Material System) unit attached to a Bambu printer."""
    __tablename__ = "ams_units"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    printer_id: Mapped[int] = mapped_column(ForeignKey("printers.id", ondelete="CASCADE"))
    unit_index: Mapped[int] = mapped_column(Integer, default=0)  # 0-based
    name: Mapped[str] = mapped_column(String(100), default="AMS 1")

    printer: Mapped["Printer"] = relationship(back_populates="ams_units")
    slots: Mapped[list["AmsSlot"]] = relationship(back_populates="ams_unit", cascade="all, delete-orphan")


class AmsSlot(Base):
    """One of the 4 slots inside an AMS unit."""
    __tablename__ = "ams_slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ams_unit_id: Mapped[int] = mapped_column(ForeignKey("ams_units.id", ondelete="CASCADE"))
    slot_index: Mapped[int] = mapped_column(Integer, nullable=False)   # 0-3
    spool_id: Mapped[int | None] = mapped_column(ForeignKey("spools.id", ondelete="SET NULL"))

    ams_unit: Mapped["AmsUnit"] = relationship(back_populates="slots")
    spool: Mapped["Spool | None"] = relationship()

    __table_args__ = (UniqueConstraint("ams_unit_id", "slot_index"),)


# ── Print Jobs ────────────────────────────────────────────────────────────────

class PrintJob(Base):
    """
    A single print job — records which spool was consumed, how much,
    and on which printer.
    """
    __tablename__ = "print_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    printer_id: Mapped[int | None] = mapped_column(ForeignKey("printers.id", ondelete="SET NULL"))
    spool_id: Mapped[int | None] = mapped_column(ForeignKey("spools.id", ondelete="SET NULL"))

    file_name: Mapped[str | None] = mapped_column(String(300))
    filament_used_g: Mapped[float] = mapped_column(Float, nullable=False)   # grams consumed
    duration_seconds: Mapped[int | None] = mapped_column(Integer)           # print time
    outcome: Mapped[PrintJobOutcome] = mapped_column(Enum(PrintJobOutcome), default=PrintJobOutcome.success)
    notes: Mapped[str | None] = mapped_column(Text)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    user: Mapped["User"] = relationship(back_populates="print_jobs")
    printer: Mapped["Printer | None"] = relationship(back_populates="print_jobs")
    spool: Mapped["Spool | None"] = relationship(back_populates="print_jobs")

    __table_args__ = (
        Index("ix_print_jobs_user_id", "user_id"),
        Index("ix_print_jobs_spool_id", "spool_id"),
        Index("ix_print_jobs_finished_at", "finished_at"),
    )


# ── Drying sessions ───────────────────────────────────────────────────────────

class DryingSession(Base):
    __tablename__ = "drying_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    spool_id: Mapped[int] = mapped_column(ForeignKey("spools.id", ondelete="CASCADE"))
    drying_temp: Mapped[int] = mapped_column(Integer)           # °C
    target_duration_hours: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    humidity_before: Mapped[float | None] = mapped_column(Float)   # %RH
    humidity_after: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)

    spool: Mapped["Spool"] = relationship(back_populates="drying_sessions")


# ── Alerts ────────────────────────────────────────────────────────────────────

class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    low_threshold_pct: Mapped[float] = mapped_column(Float, default=20.0)       # % remaining
    critical_threshold_pct: Mapped[float] = mapped_column(Float, default=10.0)
    material_filter: Mapped[str | None] = mapped_column(String(50))  # null = all materials
    notify_discord: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_email: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id])


# ── Auth tokens ───────────────────────────────────────────────────────────────

class RefreshToken(Base):
    """Persistent refresh token — enables session listing and individual revocation."""
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    device_name: Mapped[str | None] = mapped_column(String(200))   # e.g. "Chrome on macOS"
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")

    __table_args__ = (Index("ix_refresh_tokens_user_id", "user_id"),)


class PasswordResetToken(Base):
    """Single-use token sent via email for password resets."""
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="password_reset_tokens")


# ── Webhooks ──────────────────────────────────────────────────────────────────

class Webhook(Base):
    """User-defined outbound webhook — FilamentHub POSTs a JSON payload when events fire."""
    __tablename__ = "webhooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    # comma-separated event slugs, e.g. "spool.low,spool.critical"  (empty string = all)
    events: Mapped[str] = mapped_column(String(300), default="")
    secret: Mapped[str | None] = mapped_column(String(200))   # HMAC-SHA256 signing secret
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status_code: Mapped[int | None] = mapped_column(Integer)   # HTTP response from last delivery

    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id])

    __table_args__ = (Index("ix_webhooks_owner_id", "owner_id"),)


# ── System configuration ──────────────────────────────────────────────────────

class SystemConfig(Base):
    """Single-row table holding server-wide configuration (SMTP, etc.).

    Always use id=1. Read via get_system_config(); write via update_system_config().
    Falls back to environment variables when a field is NULL.
    """
    __tablename__ = "system_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    smtp_host: Mapped[str | None] = mapped_column(String(255))
    smtp_port: Mapped[int | None] = mapped_column(Integer)
    smtp_user: Mapped[str | None] = mapped_column(String(255))
    smtp_password: Mapped[str | None] = mapped_column(String(255))
    smtp_from: Mapped[str | None] = mapped_column(String(255))
    smtp_tls: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_registration: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


# ── Alert notification deduplication ─────────────────────────────────────────

class AlertFired(Base):
    """Tracks the last time a (rule, spool) pair fired a notification.

    Prevents repeat notifications every scheduler tick for the same breach.
    A new notification is sent when:
      - The pair has never been recorded, or
      - Severity escalated (low → critical), or
      - cooldown_hours have elapsed since last_fired_at.
    """
    __tablename__ = "alert_fired"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("alert_rules.id", ondelete="CASCADE"), nullable=False)
    spool_id: Mapped[int] = mapped_column(ForeignKey("spools.id", ondelete="CASCADE"), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)  # "low" | "critical"
    fired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    __table_args__ = (
        Index("ix_alert_fired_rule_spool", "rule_id", "spool_id", unique=True),
    )
