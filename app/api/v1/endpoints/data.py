"""Data import and export endpoints."""

import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_editor
from app.core.config import get_settings
from app.db.session import get_db
from app.models.models import User
from app.services.import_export import (
    export_spoolman_json,
    export_spools_csv,
    import_spoolman_json,
    import_spools_csv,
)

router = APIRouter(prefix="/data", tags=["import-export"])


@router.post("/import/spoolman")
async def import_from_spoolman(
    file: UploadFile = File(...),
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    """Upload a Spoolman JSON backup file to import spools into FilamentHub."""
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Please upload a .json file")

    content = await file.read()
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON file") from exc

    return await import_spoolman_json(data, current_user.id, db)


@router.post("/import/csv")
async def import_from_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    """Upload a FilamentHub CSV export to re-import spools."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")

    raw = await file.read()
    try:
        content = raw.decode("utf-8-sig")  # strips BOM if present
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded") from exc

    return await import_spools_csv(content, current_user.id, db)


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
    body = json.dumps({"spools": data}, indent=2, default=str)
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=filamenthub_export.json"},
    )


@router.post("/backup")
async def create_server_backup(
    current_user: User = Depends(get_current_user),
):
    """Trigger an immediate full backup to DATA_DIR/backups/ on the server."""
    import asyncio
    from app.services.backup import run_full_backup
    try:
        filename = await asyncio.to_thread(run_full_backup)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Backup failed: {exc}") from exc

    settings = get_settings()
    zip_path: Path = settings.data_path / "backups" / filename
    return {
        "filename": filename,
        "size_bytes": zip_path.stat().st_size,
    }


@router.get("/backups")
async def list_server_backups(
    current_user: User = Depends(get_current_user),
):
    """List full backups stored in DATA_DIR/backups/."""
    settings = get_settings()
    backup_dir: Path = settings.data_path / "backups"
    if not backup_dir.exists():
        return {"backups": []}

    backups = [
        {
            "filename": f.name,
            "size_bytes": f.stat().st_size,
            "created_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        }
        for f in sorted(backup_dir.glob("filamenthub_backup_*.zip"), reverse=True)
    ]
    return {"backups": backups}


@router.get("/backups/{filename}")
async def download_server_backup(
    filename: str,
    current_user: User = Depends(get_current_user),
):
    """Download a specific backup archive."""
    if "/" in filename or "\\" in filename or not filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Invalid filename")

    settings = get_settings()
    path: Path = settings.data_path / "backups" / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")

    return FileResponse(path, media_type="application/zip", filename=filename)
