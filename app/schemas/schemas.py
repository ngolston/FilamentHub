"""
Pydantic v2 schemas — request bodies, response models, and shared types.
"""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, field_validator


# ── Shared helpers ────────────────────────────────────────────────────────────

class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=8, max_length=100)]
    display_name: Annotated[str, Field(min_length=1, max_length=100)]
    maker_name: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class RefreshRequest(BaseModel):
    refresh_token: str


class TotpSetupResponse(BaseModel):
    secret: str
    uri: str  # otpauth:// URI for QR code


class TotpVerifyRequest(BaseModel):
    code: Annotated[str, Field(min_length=6, max_length=6)]


class UserResponse(OrmBase):
    id: str
    email: str
    display_name: str
    maker_name: str | None
    avatar_url: str | None
    role: str
    is_active: bool
    totp_enabled: bool
    preferred_weight_unit: str
    preferred_temp_unit: str
    preferred_currency: str
    timezone: str
    created_at: datetime
    last_login_at: datetime | None


class UserUpdate(BaseModel):
    display_name: str | None = None
    maker_name: str | None = None
    preferred_weight_unit: str | None = None
    preferred_temp_unit: str | None = None
    preferred_currency: str | None = None
    timezone: str | None = None


# ── Brands ────────────────────────────────────────────────────────────────────

class BrandCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    website: str | None = None
    country_of_origin: str | None = None
    notes: str | None = None


class BrandUpdate(BaseModel):
    name: str | None = None
    website: str | None = None
    country_of_origin: str | None = None
    notes: str | None = None


class BrandResponse(OrmBase):
    id: int
    name: str
    website: str | None
    country_of_origin: str | None
    logo_url: str | None
    notes: str | None
    created_at: datetime


# ── Filament profiles ─────────────────────────────────────────────────────────

class FilamentProfileCreate(BaseModel):
    brand_id: int | None = None
    name: Annotated[str, Field(min_length=1, max_length=200)]
    material: Annotated[str, Field(min_length=1, max_length=50)]
    color_name: str | None = None
    color_hex: str | None = None
    diameter: float = 1.75
    density: float | None = None
    print_temp_min: int | None = None
    print_temp_max: int | None = None
    bed_temp_min: int | None = None
    bed_temp_max: int | None = None
    max_print_speed: int | None = None
    drying_temp: int | None = None
    drying_duration: int | None = None
    product_url: str | None = None
    notes: str | None = None

    @field_validator("color_hex")
    @classmethod
    def validate_hex(cls, v: str | None) -> str | None:
        if v is not None and not v.startswith("#"):
            v = f"#{v}"
        return v


class FilamentProfileUpdate(FilamentProfileCreate):
    name: str | None = None
    material: str | None = None


class FilamentProfileResponse(OrmBase):
    id: int
    brand_id: int | None
    brand: BrandResponse | None
    name: str
    material: str
    color_name: str | None
    color_hex: str | None
    diameter: float
    density: float | None
    print_temp_min: int | None
    print_temp_max: int | None
    bed_temp_min: int | None
    bed_temp_max: int | None
    max_print_speed: int | None
    drying_temp: int | None
    drying_duration: int | None
    is_community: bool
    is_verified: bool
    product_url: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


# ── Storage locations ─────────────────────────────────────────────────────────

class LocationCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    description: str | None = None
    is_dry_box: bool = False


class LocationResponse(OrmBase):
    id: int
    name: str
    description: str | None
    is_dry_box: bool


# ── Spools ────────────────────────────────────────────────────────────────────

class SpoolCreate(BaseModel):
    filament_id: int | None = None
    brand_id: int | None = None
    location_id: int | None = None
    name: str | None = None
    lot_nr: str | None = None
    initial_weight: Annotated[float, Field(gt=0)]
    spool_weight: float | None = None
    used_weight: float = 0.0
    purchase_date: datetime | None = None
    purchase_price: float | None = None
    supplier: str | None = None
    product_url: str | None = None
    status: str = "active"
    notes: str | None = None


class SpoolUpdate(BaseModel):
    filament_id: int | None = None
    location_id: int | None = None
    name: str | None = None
    used_weight: float | None = None
    purchase_price: float | None = None
    supplier: str | None = None
    status: str | None = None
    notes: str | None = None


class SpoolResponse(OrmBase):
    id: int
    filament_id: int | None
    filament: FilamentProfileResponse | None
    brand_id: int | None
    brand: BrandResponse | None
    location_id: int | None
    location: LocationResponse | None
    name: str | None
    lot_nr: str | None
    photo_url: str | None
    initial_weight: float
    spool_weight: float | None
    used_weight: float
    remaining_weight: float
    fill_percentage: float
    purchase_date: datetime | None
    purchase_price: float | None
    supplier: str | None
    product_url: str | None
    status: str
    notes: str | None
    registered: datetime
    first_used: datetime | None
    last_used: datetime | None


class WeightLogCreate(BaseModel):
    measured_weight: Annotated[float, Field(gt=0)]
    spool_weight_tare: float = 0.0   # empty spool weight to subtract
    notes: str | None = None


class WeightLogResponse(OrmBase):
    id: int
    spool_id: int
    measured_weight: float
    net_weight: float
    notes: str | None
    logged_at: datetime


# ── Printers ──────────────────────────────────────────────────────────────────

class PrinterCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    model: str | None = None
    connection_type: str = "manual"
    api_url: str | None = None
    api_key: str | None = None
    notes: str | None = None


class PrinterUpdate(BaseModel):
    name: str | None = None
    model: str | None = None
    connection_type: str | None = None
    api_url: str | None = None
    api_key: str | None = None
    notes: str | None = None


class PrinterResponse(OrmBase):
    id: int
    name: str
    model: str | None
    connection_type: str
    status: str
    notes: str | None
    created_at: datetime
    last_seen_at: datetime | None


# ── Print jobs ────────────────────────────────────────────────────────────────

class PrintJobCreate(BaseModel):
    printer_id: int | None = None
    spool_id: int | None = None
    file_name: str | None = None
    filament_used_g: Annotated[float, Field(gt=0)]
    duration_seconds: int | None = None
    outcome: str = "success"
    notes: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class PrintJobResponse(OrmBase):
    id: int
    printer_id: int | None
    printer: PrinterResponse | None
    spool_id: int | None
    file_name: str | None
    filament_used_g: float
    duration_seconds: int | None
    outcome: str
    notes: str | None
    started_at: datetime | None
    finished_at: datetime


# ── Drying sessions ───────────────────────────────────────────────────────────

class DryingSessionCreate(BaseModel):
    drying_temp: Annotated[int, Field(ge=30, le=120)]
    target_duration_hours: Annotated[int, Field(ge=1, le=72)]
    humidity_before: float | None = None
    notes: str | None = None


class DryingSessionResponse(OrmBase):
    id: int
    spool_id: int
    drying_temp: int
    target_duration_hours: int
    started_at: datetime
    finished_at: datetime | None
    humidity_before: float | None
    humidity_after: float | None
    notes: str | None


# ── Pagination ────────────────────────────────────────────────────────────────

class Pagination(BaseModel):
    page: Annotated[int, Field(ge=1)] = 1
    page_size: Annotated[int, Field(ge=1, le=200)] = 50


class PaginatedResponse[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


# ── Analytics ────────────────────────────────────────────────────────────────

class UsageSummary(BaseModel):
    total_used_g: float
    avg_daily_g: float
    total_spend: float
    spools_depleted: int
    period_days: int


class SpoolForecast(BaseModel):
    spool_id: int
    spool_name: str
    remaining_g: float
    fill_pct: float
    avg_daily_g: float
    days_remaining: float | None
    estimated_runout: datetime | None
    severity: str  # ok | warning | critical
