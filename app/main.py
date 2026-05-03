"""
FilamentHub API — main application entry point.

Run locally:
    uvicorn app.main:app --reload

OpenAPI docs:
    http://localhost:8000/docs      (Swagger UI)
    http://localhost:8000/redoc     (ReDoc)
    http://localhost:8000/openapi.json
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.brands import brands_router, filaments_router
from app.api.v1.endpoints.data import router as data_router
from app.api.v1.endpoints.alerts import router as alerts_router
from app.api.v1.endpoints.drying import drying_router
from app.api.v1.endpoints.print_jobs import analytics_router, jobs_router
from app.api.v1.endpoints.printers import router as printers_router
from app.api.v1.endpoints.spools import router as spools_router
from app.api.v1.endpoints.users import router as users_router
from app.api.v1.endpoints.locations import router as locations_router
from app.api.v1.endpoints.community import router as community_router
from app.api.v1.endpoints.webhooks import router as webhooks_router
from app.api.v1.endpoints.system import router as system_router
from app.api.v1.endpoints.integrations import router as integrations_router
from app.api.v1.endpoints.admin import router as admin_router
from app.core.config import get_settings
from app.core.scheduler import create_scheduler
from app.db.session import engine
from app.models import models  # noqa: F401 — registers all models with Base

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — ensure data directories exist
    settings.photos_path.mkdir(parents=True, exist_ok=True)
    # Start background alert scheduler
    scheduler = create_scheduler()
    scheduler.start()
    yield
    # Shutdown
    scheduler.shutdown(wait=False)
    await engine.dispose()


app = FastAPI(
    title="FilamentHub API",
    description="""
## FilamentHub — 3D Printer Filament Inventory Management

A Spoolman-compatible REST API for tracking filament spools, print jobs,
printers, and usage analytics.

### Authentication
All protected endpoints require a `Bearer` token in the `Authorization` header.
Tokens are obtained via `POST /api/v1/auth/login`.

API keys (prefixed `fh_`) can be used as an alternative to JWT tokens and are
generated in Settings → API & Webhooks.

### Compatibility
The spool and filament profile schemas are intentionally compatible with the
[Spoolman](https://github.com/Donkie/Spoolman) data model for easy migration.
    """,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ── Static media (uploaded photos) ───────────────────────────────────────────
# Served at /media/photos/**  →  DATA_DIR/photos/**
settings.photos_path.mkdir(parents=True, exist_ok=True)
app.mount("/media/photos", StaticFiles(directory=str(settings.photos_path)), name="media")

# ── Routers ───────────────────────────────────────────────────────────────────

V1 = "/api/v1"
app.include_router(auth_router,      prefix=V1)
app.include_router(users_router,     prefix=V1)
app.include_router(spools_router,    prefix=V1)
app.include_router(jobs_router,      prefix=V1)
app.include_router(analytics_router, prefix=V1)
app.include_router(brands_router,    prefix=V1)
app.include_router(filaments_router, prefix=V1)
app.include_router(printers_router,  prefix=V1)
app.include_router(drying_router,    prefix=V1)
app.include_router(alerts_router,    prefix=V1)
app.include_router(data_router,      prefix=V1)
app.include_router(locations_router, prefix=V1)
app.include_router(community_router, prefix=V1)
app.include_router(webhooks_router,  prefix=V1)
app.include_router(system_router,      prefix=V1)
app.include_router(integrations_router, prefix=V1)
app.include_router(admin_router,        prefix=V1)

# ── Health & info ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"], include_in_schema=False)
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}


@app.get("/", tags=["system"], include_in_schema=False)
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "openapi": "/openapi.json",
    }
