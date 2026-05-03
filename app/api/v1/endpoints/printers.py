"""Printer and AMS management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.deps import get_current_user, require_editor
from app.db.session import get_db
from app.models.models import AmsSlot, AmsUnit, Printer, Spool, StorageLocation, User
from app.schemas.schemas import PrinterCreate, PrinterResponse, PrinterUpdate

router = APIRouter(prefix="/printers", tags=["printers"])


def _printer_q(owner_id: str):
    return (
        select(Printer)
        .where(Printer.owner_id == owner_id)
        .options(
            selectinload(Printer.ams_units).selectinload(AmsUnit.slots).selectinload(AmsSlot.spool).selectinload(Spool.filament),
            selectinload(Printer.ams_units).selectinload(AmsUnit.slots).selectinload(AmsSlot.spool).selectinload(Spool.brand),
            selectinload(Printer.direct_spool).selectinload(Spool.filament),
            selectinload(Printer.direct_spool).selectinload(Spool.brand),
        )
    )


@router.get("", response_model=list[PrinterResponse])
async def list_printers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(_printer_q(current_user.id))
    return result.scalars().all()


@router.post("", response_model=PrinterResponse, status_code=status.HTTP_201_CREATED)
async def create_printer(
    body: PrinterCreate,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    printer = Printer(owner_id=current_user.id, **body.model_dump())
    db.add(printer)
    await db.flush()

    # Auto-create an "Ext 1" storage location for the external spool slot
    db.add(StorageLocation(owner_id=current_user.id, name=f"{printer.name} Ext 1"))
    await db.flush()

    result = await db.execute(_printer_q(current_user.id).where(Printer.id == printer.id))
    return result.scalar_one()


@router.get("/{printer_id}", response_model=PrinterResponse)
async def get_printer(
    printer_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(_printer_q(current_user.id).where(Printer.id == printer_id))
    printer = result.scalar_one_or_none()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    return printer


@router.patch("/{printer_id}", response_model=PrinterResponse)
async def update_printer(
    printer_id: int,
    body: PrinterUpdate,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Printer).where(Printer.id == printer_id, Printer.owner_id == current_user.id)
    )
    printer = result.scalar_one_or_none()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(printer, field, value)
    await db.flush()
    result = await db.execute(_printer_q(current_user.id).where(Printer.id == printer.id))
    return result.scalar_one()


@router.delete("/{printer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_printer(
    printer_id: int,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Printer).where(Printer.id == printer_id, Printer.owner_id == current_user.id)
    )
    printer = result.scalar_one_or_none()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    await db.delete(printer)


# ── AMS ───────────────────────────────────────────────────────────────────────

@router.post("/{printer_id}/ams", status_code=status.HTTP_201_CREATED)
async def add_ams_unit(
    printer_id: int,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    """Add a new AMS unit to a printer and provision its 4 slots."""
    result = await db.execute(
        select(Printer)
        .where(Printer.id == printer_id, Printer.owner_id == current_user.id)
        .options(selectinload(Printer.ams_units))
    )
    printer = result.scalar_one_or_none()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    unit_index = len(printer.ams_units)
    letter = chr(65 + unit_index)  # A, B, C, …
    unit = AmsUnit(printer_id=printer_id, unit_index=unit_index, name=f"AMS {unit_index + 1}")
    db.add(unit)
    await db.flush()

    for i in range(4):
        db.add(AmsSlot(ams_unit_id=unit.id, slot_index=i))

    # Auto-create one storage location per AMS slot
    for i in range(4):
        db.add(StorageLocation(
            owner_id=current_user.id,
            name=f"{printer.name} AMS {letter}{i + 1}",
        ))

    await db.flush()
    return {"id": unit.id, "unit_index": unit_index, "name": unit.name, "slots": 4}


@router.patch("/{printer_id}/ams/{unit_id}/slots/{slot_index}")
async def assign_spool_to_slot(
    printer_id: int,
    unit_id: int,
    slot_index: int,
    spool_id: int | None = None,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    """Assign (or unassign) a spool to an AMS slot."""
    # Verify printer ownership
    printer = await db.get(Printer, printer_id)
    if not printer or printer.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Printer not found")

    result = await db.execute(
        select(AmsSlot).where(AmsSlot.ams_unit_id == unit_id, AmsSlot.slot_index == slot_index)
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    if spool_id is not None:
        spool = await db.get(Spool, spool_id)
        if not spool or spool.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Spool not found")

    slot.spool_id = spool_id
    return {"unit_id": unit_id, "slot_index": slot_index, "spool_id": spool_id}


# ── Direct / external spool ───────────────────────────────────────────────────

@router.patch("/{printer_id}/direct-spool", response_model=PrinterResponse)
async def assign_direct_spool(
    printer_id: int,
    spool_id: int | None = None,
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    """Assign (or unassign) the external spool directly loaded into the printer."""
    result = await db.execute(_printer_q(current_user.id).where(Printer.id == printer_id))
    printer = result.scalar_one_or_none()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    if spool_id is not None:
        spool = await db.get(Spool, spool_id)
        if not spool or spool.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="Spool not found")

    printer.direct_spool_id = spool_id
    await db.flush()
    # Reload with relationships
    result2 = await db.execute(_printer_q(current_user.id).where(Printer.id == printer_id))
    return result2.scalar_one()
