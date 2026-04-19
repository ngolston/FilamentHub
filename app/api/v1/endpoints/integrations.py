"""Bambu Cloud and Home Assistant integration endpoints."""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.db.session import get_db
from app.models.models import AmsUnit, Printer, Spool, User
from app.services.bambu import BambuApiError, BambuAuthError, authenticate, authenticate_2fa, get_devices
from app.services.home_assistant import HaAuthError, HaConnectionError, push_spool_sensors, test_connection

router = APIRouter(prefix="/integrations", tags=["integrations"])


# ═══════════════════════════════════════════════════════════════════════════════
# Bambu Cloud
# ═══════════════════════════════════════════════════════════════════════════════

class BambuConnectIn(BaseModel):
    email: str
    password: str


class BambuVerify2faIn(BaseModel):
    code: str


class BambuConnectOut(BaseModel):
    connected: bool
    tfa_required: bool = False
    username: str | None = None
    printer_count: int = 0


# Keep a single response model name used by the GET endpoint
BambuConfigOut = BambuConnectOut


def _load_bambu(user: User) -> dict:
    if user.bambu_config:
        try:
            return json.loads(user.bambu_config)
        except Exception:
            pass
    return {}


@router.get("/bambu", response_model=BambuConfigOut)
async def get_bambu_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cfg = _load_bambu(current_user)
    count = 0
    if cfg.get("access_token"):
        result = await db.execute(
            select(Printer).where(
                Printer.owner_id == current_user.id,
                Printer.connection_type == "bambu",
            )
        )
        count = len(result.scalars().all())
    return BambuConfigOut(connected=bool(cfg.get("access_token")), username=cfg.get("username"), printer_count=count)


@router.post("/bambu/connect", response_model=BambuConnectOut)
async def connect_bambu(
    body: BambuConnectIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 1 — Exchange email + password for a Bambu Cloud token.

    If the account has 2FA enabled, returns {tfa_required: true} and temporarily
    stores the email so the verify-2fa step can use it.
    Password is never stored.
    """
    try:
        result = await authenticate(body.email, body.password)
    except BambuAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except BambuApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if result.get("tfa_required"):
        # Store only the email as pending — no token yet
        current_user.bambu_config = json.dumps({"pending_tfa_email": body.email})
        await db.flush()
        return BambuConnectOut(connected=False, tfa_required=True, username=body.email)

    cfg = {
        "access_token":  result["access_token"],
        "refresh_token": result["refresh_token"],
        "username":      body.email,
    }
    current_user.bambu_config = json.dumps(cfg)
    await db.flush()
    return BambuConnectOut(connected=True, username=body.email)


@router.post("/bambu/verify-2fa", response_model=BambuConnectOut)
async def verify_bambu_2fa(
    body: BambuVerify2faIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Step 2 — Submit the 2FA / email verification code sent by Bambu.

    Requires that /bambu/connect was called first (email stored as pending_tfa_email).
    """
    cfg = _load_bambu(current_user)
    email = cfg.get("pending_tfa_email")
    if not email:
        raise HTTPException(status_code=400, detail="No pending 2FA session — call /bambu/connect first")

    try:
        tokens = await authenticate_2fa(email, body.code.strip())
    except BambuAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except BambuApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    new_cfg = {
        "access_token":  tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "username":      email,
    }
    current_user.bambu_config = json.dumps(new_cfg)
    await db.flush()
    return BambuConnectOut(connected=True, username=email)


@router.delete("/bambu", status_code=204)
async def disconnect_bambu(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.bambu_config = None
    await db.flush()


@router.post("/bambu/sync")
async def sync_bambu(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Pull device list from Bambu Cloud and upsert Printer records.

    - Creates a Printer for each cloud device not already tracked.
    - Updates name/model for existing Bambu printers.
    - Provisions 1 AMS unit (4 slots) for printers that don't have one yet.
    Returns a summary of created / updated / unchanged printers.
    """
    cfg = _load_bambu(current_user)
    if not cfg.get("access_token"):
        raise HTTPException(status_code=400, detail="Bambu Cloud is not connected")

    try:
        devices = await get_devices(cfg["access_token"])
    except BambuAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except BambuApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Fetch existing Bambu printers keyed by serial number
    result = await db.execute(
        select(Printer).where(
            Printer.owner_id == current_user.id,
            Printer.connection_type == "bambu",
        )
    )
    existing: dict[str, Printer] = {p.serial_number: p for p in result.scalars().all() if p.serial_number}

    created = updated = unchanged = 0

    for dev in devices:
        serial   = dev.get("dev_id") or dev.get("serial_number") or dev.get("sn", "")
        name     = dev.get("name") or dev.get("dev_product_name") or f"Bambu Printer {serial[:8]}"
        model    = dev.get("dev_model_name") or dev.get("model") or "Bambu Lab"

        if serial in existing:
            printer = existing[serial]
            changed = False
            if printer.name != name:
                printer.name = name
                changed = True
            if printer.model != model:
                printer.model = model
                changed = True
            if changed:
                updated += 1
            else:
                unchanged += 1
        else:
            printer = Printer(
                owner_id=current_user.id,
                name=name,
                model=model,
                serial_number=serial,
                connection_type="bambu",
            )
            db.add(printer)
            await db.flush()

            # Provision one AMS unit with 4 empty slots
            from app.models.models import AmsSlot
            unit = AmsUnit(printer_id=printer.id, unit_index=0, name="AMS 1")
            db.add(unit)
            await db.flush()
            for i in range(4):
                db.add(AmsSlot(ams_unit_id=unit.id, slot_index=i))

            created += 1

    await db.flush()
    return {"created": created, "updated": updated, "unchanged": unchanged, "total": len(devices)}


# ═══════════════════════════════════════════════════════════════════════════════
# Home Assistant
# ═══════════════════════════════════════════════════════════════════════════════

class HaConfigIn(BaseModel):
    url: str
    token: str


class HaConfigOut(BaseModel):
    connected: bool
    url: str | None


def _load_ha(user: User) -> dict:
    if user.ha_config:
        try:
            return json.loads(user.ha_config)
        except Exception:
            pass
    return {}


@router.get("/home-assistant", response_model=HaConfigOut)
async def get_ha_config(
    current_user: User = Depends(get_current_user),
):
    cfg = _load_ha(current_user)
    return HaConfigOut(connected=bool(cfg.get("url") and cfg.get("token")), url=cfg.get("url"))


@router.patch("/home-assistant", response_model=HaConfigOut)
async def update_ha_config(
    body: HaConfigIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cfg = {"url": body.url.rstrip("/"), "token": body.token}
    current_user.ha_config = json.dumps(cfg)
    await db.flush()
    return HaConfigOut(connected=True, url=cfg["url"])


@router.delete("/home-assistant", status_code=204)
async def disconnect_ha(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.ha_config = None
    await db.flush()


@router.post("/home-assistant/test")
async def test_ha(
    current_user: User = Depends(get_current_user),
):
    cfg = _load_ha(current_user)
    if not cfg.get("url") or not cfg.get("token"):
        raise HTTPException(status_code=400, detail="Home Assistant is not configured")

    try:
        info = await test_connection(cfg["url"], cfg["token"])
    except HaAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except HaConnectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"ok": True, "ha_version": info.get("version"), "url": cfg["url"]}


@router.post("/home-assistant/sync")
async def sync_ha(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Push all active/storage spools to Home Assistant as sensor entities.

    Each spool becomes `sensor.filamenthub_<material>_<name>_<id>` with
    fill percentage as the state and full spool details as attributes.
    """
    cfg = _load_ha(current_user)
    if not cfg.get("url") or not cfg.get("token"):
        raise HTTPException(status_code=400, detail="Home Assistant is not configured")

    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Spool)
        .where(Spool.owner_id == current_user.id, Spool.status != "archived")
        .options(
            selectinload(Spool.filament),
            selectinload(Spool.brand),
            selectinload(Spool.location),
        )
    )
    spools = result.scalars().all()

    try:
        summary = await push_spool_sensors(cfg["url"], cfg["token"], spools)
    except HaAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except HaConnectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return summary
