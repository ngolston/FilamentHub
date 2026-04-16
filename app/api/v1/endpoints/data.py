"""Data import and export endpoints."""

import json

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_editor
from app.db.session import get_db
from app.models.models import User
from app.services.import_export import (
    export_spoolman_json,
    export_spools_csv,
    import_spoolman_json,
)

router = APIRouter(prefix="/data", tags=["import-export"])


@router.post("/import/spoolman")
async def import_from_spoolman(
    file: UploadFile = File(...),
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a Spoolman JSON backup file to import spools into FilamentHub.
    Brands and filament profiles are created automatically and de-duplicated.
    """
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Please upload a .json file")

    content = await file.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    result = await import_spoolman_json(data, current_user.id, db)
    return result


@router.get("/export/csv")
async def export_csv(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download all spools as a CSV file."""
    csv_data = await export_spools_csv(current_user.id, db)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=filamenthub_export.csv"},
    )


@router.get("/export/json")
async def export_json(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download all spools as a Spoolman-compatible JSON file."""
    data = await export_spoolman_json(current_user.id, db)
    content = json.dumps({"spools": data}, indent=2, default=str)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=filamenthub_export.json"},
    )
