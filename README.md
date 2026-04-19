# FilamentHub

**3D printer filament inventory management — self-hosted, open source.**

Track your spool collection, log print jobs, get runout forecasts, print QR labels, and see full usage analytics. Runs entirely on your own hardware with a single Docker command.

![License](https://img.shields.io/badge/license-MIT-blue)
![Docker](https://img.shields.io/badge/docker-hub-blue?logo=docker)

---

## Self-host in 3 minutes

### Prerequisites
- Docker Engine 24+ and Docker Compose v2
- A machine on your LAN (home server, NAS, Raspberry Pi 4+, VPS)

### 1. Create your config

```bash
# Download the compose file and example env
curl -O https://raw.githubusercontent.com/YOUR_GITHUB/filamenthub/main/docker-compose.hub.yml
curl -O https://raw.githubusercontent.com/YOUR_GITHUB/filamenthub/main/.env.example

cp .env.example .env
```

Open `.env` and set **two things** at minimum:

```ini
# Generate a secure key:  openssl rand -hex 32
SECRET_KEY=paste-your-key-here

# The URL your browser uses to reach FilamentHub
# LAN example:  http://192.168.1.50
# Domain:       https://filamenthub.yourdomain.com
FRONTEND_URL=http://YOUR-SERVER-IP
```

### 2. Start

```bash
docker compose -f docker-compose.hub.yml up -d
```

That's it. Open **http://YOUR-SERVER-IP** in your browser and create your first account.

### 3. Update

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

---

## All `.env` options

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | *(required)* | JWT signing key — `openssl rand -hex 32` |
| `FRONTEND_URL` | `http://localhost` | Public URL of your instance (no trailing slash) |
| `PORT` | `80` | Host port to expose |
| `SMTP_HOST` | — | SMTP server for password-reset emails |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASSWORD` | — | SMTP password |
| `EMAILS_FROM` | `noreply@filamenthub.local` | From address for emails |

**Email is optional.** If SMTP is not configured, password-reset links are logged to the container console instead.

---

## Backup & restore

All data (SQLite database + spool photos) lives in a Docker named volume: `filamenthub_data`.

**Backup:**
```bash
docker run --rm \
  -v filamenthub_data:/data \
  -v $(pwd):/out \
  busybox tar czf /out/filamenthub-backup-$(date +%Y%m%d).tar.gz /data
```

**Restore:**
```bash
# Stop the stack first
docker compose -f docker-compose.hub.yml down

docker run --rm \
  -v filamenthub_data:/data \
  -v $(pwd):/out \
  busybox tar xzf /out/filamenthub-backup-YYYYMMDD.tar.gz -C /

docker compose -f docker-compose.hub.yml up -d
```

---

## Running on a NAS

### Synology (DSM 7)

1. Install **Container Manager** from Package Center
2. Open Container Manager → **Project** → **Create**
3. Set project name: `filamenthub`
4. Upload `docker-compose.hub.yml` and `.env`
5. Click **Build**

### Unraid

1. Install the **Docker Compose Manager** community app
2. Create a new compose stack, paste in `docker-compose.hub.yml`
3. Add your `.env` variables in the UI
4. Start the stack

### QNAP (Container Station 3)

1. Open Container Station → **Applications** → **Create**
2. Switch to **Upload** and provide `docker-compose.hub.yml`
3. Set environment variables from `.env`
4. Click **Validate** then **Create**

### Raspberry Pi / ARM servers

The Docker images are built for both `linux/amd64` and `linux/arm64` — no changes needed.

---

## Reverse proxy & HTTPS

For production use with a real domain, put FilamentHub behind a reverse proxy that handles TLS.

### Caddy (simplest — auto HTTPS)

```caddyfile
filamenthub.yourdomain.com {
    reverse_proxy localhost:80
}
```

### Traefik

```yaml
# In docker-compose.hub.yml, add to the web service:
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.filamenthub.rule=Host(`filamenthub.yourdomain.com`)"
  - "traefik.http.routers.filamenthub.entrypoints=websecure"
  - "traefik.http.routers.filamenthub.tls.certresolver=letsencrypt"
```

### nginx Proxy Manager

Set the **Proxy Host** to `http://YOUR-SERVER-IP:80` and enable **Force SSL** + **Let's Encrypt**.

---

## Features

| | |
|---|---|
| **Spool inventory** | Track brand, material, color, weight, location, lot number |
| **Print job logging** | Log filament used per job, auto-deduct from spool |
| **Analytics** | Daily/weekly/monthly charts, by-material, by-printer, cost tracking |
| **Run-out forecast** | Days remaining per spool based on actual usage rate |
| **QR labels** | 7 label templates, print-ready at physical size |
| **Reorder list** | Low-stock spools with supplier links and suggested quantities |
| **Alerts** | Low-stock notifications, SMTP or Discord webhook |
| **Community DB** | Browse shared filament profiles |
| **Import** | Spoolman JSON export → FilamentHub in one click |
| **Export** | CSV or JSON export of your inventory |
| **2FA** | TOTP two-factor authentication |
| **API keys** | Machine-to-machine access for OctoPrint/Moonraker integrations |
| **Multi-user** | Admin / editor / viewer roles |

---

## Development

### Prerequisites
- Python 3.12+
- Node.js 22+

### Backend

```bash
# Install dependencies
pip install -e ".[dev]"

# Start the API (SQLite, hot-reload)
uvicorn app.main:app --reload

# Run tests
pytest tests/ -v

# Create a migration after changing models
alembic revision --autogenerate -m "description"
alembic upgrade head
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # Vite dev server on :5173, proxies /api → localhost:8000
npm run build        # Production build → dist/
```

### Full stack (dev)

```bash
# Starts API + frontend dev server (hot-reload on both)
docker compose --profile dev up
```

---

## Publishing to Docker Hub

### One-time setup

1. **Create a Docker Hub account** at [hub.docker.com](https://hub.docker.com)

2. **Create two repositories** on Docker Hub:
   - `YOUR_USERNAME/filamenthub-api`
   - `YOUR_USERNAME/filamenthub-web`

3. **Create a Docker Hub access token:**
   Docker Hub → Account Settings → Security → **New Access Token**
   Permissions: **Read, Write, Delete**

4. **Add secrets to GitHub:**
   Your repo → Settings → Secrets → Actions → **New repository secret**
   - `DOCKERHUB_USERNAME` — your Docker Hub username
   - `DOCKERHUB_TOKEN` — the access token from step 3

### Trigger a build

The GitHub Actions workflow (`.github/workflows/docker-publish.yml`) runs automatically:

| Event | Tags pushed |
|---|---|
| Push to `main` | `:latest` |
| Push tag `v1.2.3` | `:1.2.3`, `:1.2`, `:1`, `:latest` |
| Pull request | Build only (no push) |

**To release a new version:**
```bash
git tag v1.0.0
git push origin v1.0.0
```

Watch the build at **GitHub → Actions**.

### Manual push (without CI)

```bash
# Log in
docker login

# Build and push the API image
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag YOUR_USERNAME/filamenthub-api:latest \
  --push \
  .

# Build and push the Web image (frontend + nginx)
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag YOUR_USERNAME/filamenthub-web:latest \
  --push \
  -f frontend/Dockerfile.prod \
  ./frontend
```

Then update `docker-compose.hub.yml` to replace `YOUR_DOCKERHUB_USERNAME` with your real username before sharing it.

---

## Architecture

```
Browser
  │
  ▼
┌─────────────────────────────┐
│   web container             │
│   nginx:stable-alpine       │
│                             │
│   /            → React SPA  │  (built into image at docker build time)
│   /api/*       → api:8000   │
└─────────────────────────────┘
  │  internal network
  ▼
┌─────────────────────────────┐
│   api container             │
│   python:3.12-slim          │
│                             │
│   FastAPI + Uvicorn         │
│   SQLite (named volume)     │
│   Photos (named volume)     │
└─────────────────────────────┘
  │
  ▼
┌─────────────────────────────┐
│  filamenthub_data volume    │
│  /app/data/                 │
│    filamenthub.db           │
│    photos/                  │
└─────────────────────────────┘
```

The API is never exposed directly to the network — all traffic goes through the nginx container.

---

## Spoolman migration

FilamentHub can import a Spoolman JSON backup:

```bash
curl -X POST http://YOUR-SERVER-IP/api/v1/data/import/spoolman \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@spoolman_backup.json"
```

Brands, filament profiles, and spools are created automatically.

---

## License

MIT — do whatever you want with it.
