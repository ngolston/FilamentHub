import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Fields written to / read from the persistent config file in DATA_DIR.
# This survives container updates even if Unraid resets env vars.
_PERSIST_FIELDS = (
    "SECRET_KEY",
    "FRONTEND_URL",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "EMAILS_FROM",
    "DISCORD_WEBHOOK_URL",
)


def _data_config_path() -> Path:
    return Path(os.getenv("DATA_DIR", "./data")) / "config.env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ── App ───────────────────────────────────────────────────────────────────
    APP_NAME: str = "FilamentHub"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = False

    # ── Security ──────────────────────────────────────────────────────────────
    SECRET_KEY: str = "dev-secret-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/filamenthub.db"

    # ── Data / media storage ──────────────────────────────────────────────────
    # Directory on disk where photos and other uploads are stored.
    DATA_DIR: str = "./data"

    # ── Frontend ──────────────────────────────────────────────────────────────
    # Base URL of the frontend app — used to build password-reset / verify links
    FRONTEND_URL: str = "http://localhost:5173"

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v: str | list) -> list[str]:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                import json
                return json.loads(v)
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # ── Optional integrations ─────────────────────────────────────────────────
    DISCORD_WEBHOOK_URL: str | None = None
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM: str = "noreply@filamenthub.local"

    # ── Pagination ────────────────────────────────────────────────────────────
    DEFAULT_PAGE_SIZE: int = 50
    MAX_PAGE_SIZE: int = 200

    @property
    def data_path(self) -> Path:
        return Path(self.DATA_DIR)

    @property
    def photos_path(self) -> Path:
        return self.data_path / "photos"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


def _load_persistent_config() -> None:
    """Load config.env from the data volume without overriding existing env vars."""
    path = _data_config_path()
    if path.exists():
        from dotenv import load_dotenv
        load_dotenv(path, override=False)


def _write_persistent_config(settings: Settings) -> None:
    """Persist user-configured fields to the data volume on first run."""
    path = _data_config_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        lines: list[str] = []
        for key in _PERSIST_FIELDS:
            val = getattr(settings, key, None)
            if val is not None:
                lines.append(f"{key}={val}")
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except Exception:
        pass  # Non-fatal — don't crash if data dir isn't writable yet


@lru_cache
def get_settings() -> Settings:
    _load_persistent_config()
    settings = Settings()
    if not _data_config_path().exists():
        _write_persistent_config(settings)
    return settings
