# FilamentHub API

> FastAPI + PostgreSQL backend for FilamentHub — 3D printer filament inventory management.  
> Spoolman-compatible. Self-hosted via Docker Compose.

---

## Quick start

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env — at minimum change SECRET_KEY and POSTGRES_PASSWORD

# 2. Generate a secure secret key
openssl rand -hex 32

# 3. Start everything
docker compose up -d

# 4. Check it's running
curl http://localhost:8000/health
# → {"status": "ok", "version": "0.1.0"}

# 5. Open the API docs
open http://localhost:8000/docs
```

That's it. The API is live at **http://localhost:8000**.

---

## Services

| Service | Port | Description |
|---------|------|-------------|
| `api` | 8000 | FastAPI application |
| `db` | 5432 | PostgreSQL 16 |
| `minio` | 9000 / 9001 | Object storage (spool photos) |
| `nginx` | 80 / 443 | Reverse proxy (production profile only) |

---

## API overview

All endpoints live under `/api/v1`. Interactive docs at `/docs`.

### Authentication
```bash
# Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword","display_name":"Jamie"}'

# Login → get tokens
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}'

# Use the access_token in subsequent requests
export TOKEN="eyJ..."
```

### Spools
```bash
# List all spools
curl http://localhost:8000/api/v1/spools \
  -H "Authorization: Bearer $TOKEN"

# Add a spool
curl -X POST http://localhost:8000/api/v1/spools \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"initial_weight":1000,"used_weight":0,"status":"active"}'

# Log a weight measurement (scale reading)
curl -X POST http://localhost:8000/api/v1/spools/1/weight-logs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"measured_weight":850,"spool_weight_tare":200}'
```

### Print jobs
```bash
# Log a print job (auto-deducts filament from spool)
curl -X POST http://localhost:8000/api/v1/print-jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"spool_id":1,"filament_used_g":47,"file_name":"benchy.gcode","outcome":"success"}'
```

### Analytics
```bash
# 30-day usage summary
curl "http://localhost:8000/api/v1/analytics/summary?days=30" \
  -H "Authorization: Bearer $TOKEN"

# Run-out forecast for all active spools
curl http://localhost:8000/api/v1/analytics/forecast \
  -H "Authorization: Bearer $TOKEN"
```

### Import from Spoolman
```bash
# Upload a Spoolman JSON backup — brands, profiles, and spools are created automatically
curl -X POST http://localhost:8000/api/v1/data/import/spoolman \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@spoolman_backup.json"
```

### Export
```bash
# CSV
curl http://localhost:8000/api/v1/data/export/csv \
  -H "Authorization: Bearer $TOKEN" \
  -o filaments.csv

# JSON (Spoolman-compatible)
curl http://localhost:8000/api/v1/data/export/json \
  -H "Authorization: Bearer $TOKEN" \
  -o filaments.json
```

### API keys (for integrations)
```bash
# Generate a key — shown once, store it securely
curl -X POST "http://localhost:8000/api/v1/users/me/api-keys?name=OctoPrint&scopes=read" \
  -H "Authorization: Bearer $TOKEN"

# Use the key directly (no login required)
curl http://localhost:8000/api/v1/spools \
  -H "Authorization: Bearer fh_abc123..."
```

---

## Development

```bash
# Install dependencies
pip install -e ".[dev]"

# Run locally (needs a postgres instance)
uvicorn app.main:app --reload

# Run the test suite (uses SQLite in-memory — no postgres needed)
pytest tests/ -v

# Generate a new migration after model changes
alembic revision --autogenerate -m "add column x to spools"

# Apply migrations
alembic upgrade head

# Roll back one migration
alembic downgrade -1
```

---

## Project structure

```
filamenthub/
├── app/
│   ├── main.py                  # FastAPI app, middleware, router registration
│   ├── core/
│   │   ├── config.py            # Pydantic settings (reads .env)
│   │   └── security.py          # JWT, bcrypt, TOTP, API key generation
│   ├── db/
│   │   └── session.py           # Async SQLAlchemy engine + get_db dependency
│   ├── models/
│   │   └── models.py            # All ORM models (User, Spool, Printer, PrintJob…)
│   ├── schemas/
│   │   └── schemas.py           # Pydantic v2 request/response schemas
│   ├── services/
│   │   ├── storage.py           # MinIO / S3 photo upload
│   │   └── import_export.py     # Spoolman JSON import, CSV/JSON export
│   └── api/v1/
│       ├── deps.py              # Auth dependencies (JWT + API key)
│       └── endpoints/
│           ├── auth.py          # Register, login, refresh, 2FA
│           ├── users.py         # Profile update, API key CRUD
│           ├── spools.py        # Spool CRUD, weight logs, photo upload
│           ├── brands.py        # Brand + filament profile CRUD
│           ├── printers.py      # Printer + AMS unit/slot management
│           ├── print_jobs.py    # Job logging + analytics
│           ├── drying.py        # Drying sessions + alert rules
│           └── data.py          # Import / export
├── alembic/
│   ├── env.py                   # Async migration environment
│   └── versions/
│       └── 0001_initial.py      # Full initial schema migration
├── tests/
│   └── test_api.py              # Integration tests (SQLite in-memory)
├── nginx/
│   └── nginx.conf               # Production reverse proxy
├── docker-compose.yml
├── Dockerfile
├── pyproject.toml
├── alembic.ini
└── .env.example
```

---

## Spoolman compatibility

FilamentHub's data model intentionally mirrors [Spoolman](https://github.com/Donkie/Spoolman):

| Spoolman | FilamentHub |
|----------|-------------|
| `Vendor` | `Brand` |
| `Filament` | `FilamentProfile` |
| `Spool` | `Spool` |
| `spool.used_weight` | `spool.used_weight` |
| `spool.registered` | `spool.registered` |
| `spool.lot_nr` | `spool.lot_nr` |
| `spool.comment` | `spool.notes` |

Migrate from Spoolman: `POST /api/v1/data/import/spoolman` with your Spoolman JSON export.

---

## Production deployment

```bash
# Generate TLS certs (or use your own)
mkdir nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/certs/key.pem -out nginx/certs/cert.pem

# Start with nginx reverse proxy
docker compose --profile production up -d
```

For real deployments, use Let's Encrypt with certbot and point your domain at the server.
