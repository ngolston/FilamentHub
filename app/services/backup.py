"""Full-database backup service.

Creates a ZIP archive containing:
  - filamenthub.db  — safe hot-copy of the live SQLite database
  - photos/...      — all uploaded media files

The ZIP is written to DATA_DIR/backups/ and can be used to fully restore
the app: stop the server, extract over the data directory, restart.
"""

import logging
import sqlite3
import zipfile
from datetime import datetime
from pathlib import Path

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _hot_copy_db(src_path: Path, dst_path: Path) -> None:
    """Copy a live SQLite database safely using the built-in backup API."""
    src = sqlite3.connect(str(src_path))
    dst = sqlite3.connect(str(dst_path))
    try:
        src.backup(dst)
    finally:
        src.close()
        dst.close()


def run_full_backup() -> str:
    """
    Create a full backup ZIP in DATA_DIR/backups/.

    Returns the filename of the created archive.
    Raises on any I/O error so callers can log or surface it.
    """
    settings = get_settings()
    backup_dir: Path = settings.data_path / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    zip_name = f"filamenthub_backup_{timestamp}.zip"
    zip_path = backup_dir / zip_name
    tmp_db = backup_dir / f"_tmp_{timestamp}.db"

    db_path: Path = settings.data_path / "filamenthub.db"

    try:
        _hot_copy_db(db_path, tmp_db)

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(tmp_db, "filamenthub.db")

            photos_dir: Path = settings.photos_path
            if photos_dir.exists():
                for photo in photos_dir.rglob("*"):
                    if photo.is_file():
                        zf.write(photo, photo.relative_to(settings.data_path))
    finally:
        if tmp_db.exists():
            tmp_db.unlink()

    size_kb = zip_path.stat().st_size / 1024
    logger.info("Backup created: %s (%.1f KB)", zip_name, size_kb)
    return zip_name
