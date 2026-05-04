"""Local filesystem storage service — replaces MinIO for simplicity."""

import uuid
from pathlib import Path

import aiofiles
from fastapi import UploadFile

from app.core.config import get_settings

settings = get_settings()

# Media served at /media/*  →  DATA_DIR/photos/*
MEDIA_PREFIX = "/media/photos"


def _ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


async def upload_spool_photo(spool_id: int, file: UploadFile) -> str:
    """Save a spool photo to disk and return its public URL."""
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    dest_dir = _ensure_dir(settings.photos_path / "spools" / str(spool_id))
    dest = dest_dir / filename

    content = await file.read()
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    return f"{MEDIA_PREFIX}/spools/{spool_id}/{filename}"


async def upload_avatar(user_id: str, file: UploadFile) -> str:
    """Save a user avatar to disk and return its public URL."""
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
        ext = "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    dest_dir = _ensure_dir(settings.photos_path / "avatars" / user_id)
    dest = dest_dir / filename

    content = await file.read()
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    return f"{MEDIA_PREFIX}/avatars/{user_id}/{filename}"


async def upload_print_job_photo(job_id: int, file: UploadFile) -> str:
    """Save a print job photo to disk and return its public URL."""
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
        ext = "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    dest_dir = _ensure_dir(settings.photos_path / "print_jobs" / str(job_id))
    dest = dest_dir / filename

    content = await file.read()
    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    return f"{MEDIA_PREFIX}/print_jobs/{job_id}/{filename}"


async def delete_object(url_path: str) -> None:
    """Delete a file given its public URL path (e.g. /media/photos/spools/1/abc.jpg)."""
    if not url_path.startswith(MEDIA_PREFIX):
        return
    relative = url_path.removeprefix(MEDIA_PREFIX).lstrip("/")
    target = settings.photos_path / relative
    try:
        target.unlink(missing_ok=True)
    except OSError:
        pass
