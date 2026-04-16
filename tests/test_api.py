"""
Integration tests for FilamentHub API.

Run:  pytest tests/ -v --tb=short
Requires a running PostgreSQL instance (or use SQLite for unit tests with sync engine).
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.session import Base, get_db
from app.main import app

# Use an in-memory SQLite DB for tests (swap asyncpg → aiosqlite)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSession = async_sessionmaker(test_engine, expire_on_commit=False)


async def override_get_db():
    async with TestSession() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient):
    """Register a user and return auth headers."""
    await client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "testpassword123",
        "display_name": "Test User",
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "testpassword123",
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Auth tests ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient):
    resp = await client.post("/api/v1/auth/register", json={
        "email": "new@example.com",
        "password": "password123",
        "display_name": "New User",
    })
    assert resp.status_code == 201
    assert resp.json()["email"] == "new@example.com"

    resp = await client.post("/api/v1/auth/login", json={
        "email": "new@example.com",
        "password": "password123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_duplicate_registration(client: AsyncClient):
    payload = {"email": "dupe@example.com", "password": "pass1234", "display_name": "Dupe"}
    await client.post("/api/v1/auth/register", json=payload)
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_wrong_password(client: AsyncClient, auth_headers):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me(client: AsyncClient, auth_headers):
    resp = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_token_refresh(client: AsyncClient, auth_headers):
    login = await client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "testpassword123",
    })
    refresh_token = login.json()["refresh_token"]
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


# ── Spool CRUD tests ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_and_list_spool(client: AsyncClient, auth_headers):
    resp = await client.post("/api/v1/spools", headers=auth_headers, json={
        "initial_weight": 1000,
        "used_weight": 0,
    })
    assert resp.status_code == 201
    spool_id = resp.json()["id"]

    resp = await client.get("/api/v1/spools", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["id"] == spool_id


@pytest.mark.asyncio
async def test_spool_fill_percentage(client: AsyncClient, auth_headers):
    resp = await client.post("/api/v1/spools", headers=auth_headers, json={
        "initial_weight": 1000,
        "used_weight": 250,
    })
    spool = resp.json()
    assert spool["remaining_weight"] == 750
    assert spool["fill_percentage"] == 75.0


@pytest.mark.asyncio
async def test_update_spool(client: AsyncClient, auth_headers):
    create = await client.post("/api/v1/spools", headers=auth_headers, json={"initial_weight": 1000})
    spool_id = create.json()["id"]

    resp = await client.patch(f"/api/v1/spools/{spool_id}", headers=auth_headers, json={
        "used_weight": 400,
        "notes": "great spool",
    })
    assert resp.status_code == 200
    assert resp.json()["used_weight"] == 400
    assert resp.json()["notes"] == "great spool"


@pytest.mark.asyncio
async def test_delete_spool(client: AsyncClient, auth_headers):
    create = await client.post("/api/v1/spools", headers=auth_headers, json={"initial_weight": 1000})
    spool_id = create.json()["id"]
    del_resp = await client.delete(f"/api/v1/spools/{spool_id}", headers=auth_headers)
    assert del_resp.status_code == 204
    get_resp = await client.get(f"/api/v1/spools/{spool_id}", headers=auth_headers)
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_weight_log(client: AsyncClient, auth_headers):
    create = await client.post("/api/v1/spools", headers=auth_headers, json={
        "initial_weight": 1000,
        "spool_weight": 200,
    })
    spool_id = create.json()["id"]

    # Measure 850g total (200g tare = 650g filament remaining)
    resp = await client.post(
        f"/api/v1/spools/{spool_id}/weight-logs",
        headers=auth_headers,
        json={"measured_weight": 850, "spool_weight_tare": 200},
    )
    assert resp.status_code == 201
    assert resp.json()["net_weight"] == 650

    # Spool used_weight should now be 350g (1000 - 650)
    spool = (await client.get(f"/api/v1/spools/{spool_id}", headers=auth_headers)).json()
    assert spool["used_weight"] == 350


# ── Print job tests ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_log_print_job_deducts_filament(client: AsyncClient, auth_headers):
    spool = (await client.post("/api/v1/spools", headers=auth_headers, json={
        "initial_weight": 1000,
    })).json()
    spool_id = spool["id"]

    await client.post("/api/v1/print-jobs", headers=auth_headers, json={
        "spool_id": spool_id,
        "filament_used_g": 120,
        "file_name": "benchy.gcode",
        "outcome": "success",
    })

    updated = (await client.get(f"/api/v1/spools/{spool_id}", headers=auth_headers)).json()
    assert updated["used_weight"] == 120
    assert updated["remaining_weight"] == 880


@pytest.mark.asyncio
async def test_analytics_summary(client: AsyncClient, auth_headers):
    spool = (await client.post("/api/v1/spools", headers=auth_headers, json={"initial_weight": 1000})).json()
    await client.post("/api/v1/print-jobs", headers=auth_headers, json={
        "spool_id": spool["id"],
        "filament_used_g": 300,
    })

    resp = await client.get("/api/v1/analytics/summary?days=30", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["total_used_g"] == 300


# ── Brand + filament profile tests ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_brand_crud(client: AsyncClient, auth_headers):
    resp = await client.post("/api/v1/brands", headers=auth_headers, json={"name": "Bambu Lab"})
    assert resp.status_code == 201
    brand_id = resp.json()["id"]

    resp = await client.get("/api/v1/brands", headers=auth_headers)
    assert any(b["id"] == brand_id for b in resp.json())

    resp = await client.delete(f"/api/v1/brands/{brand_id}", headers=auth_headers)
    assert resp.status_code == 204


# ── Data export tests ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_csv(client: AsyncClient, auth_headers):
    await client.post("/api/v1/spools", headers=auth_headers, json={"initial_weight": 1000})
    resp = await client.get("/api/v1/data/export/csv", headers=auth_headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "initial_weight_g" in resp.text


@pytest.mark.asyncio
async def test_export_json(client: AsyncClient, auth_headers):
    await client.post("/api/v1/spools", headers=auth_headers, json={"initial_weight": 1000})
    resp = await client.get("/api/v1/data/export/json", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "spools" in data
    assert len(data["spools"]) == 1


# ── Security tests ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unauthenticated_request(client: AsyncClient):
    resp = await client.get("/api/v1/spools")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_cannot_access_other_users_spool(client: AsyncClient, auth_headers):
    # Create spool as user A
    spool = (await client.post("/api/v1/spools", headers=auth_headers, json={"initial_weight": 1000})).json()

    # Register user B
    await client.post("/api/v1/auth/register", json={
        "email": "other@example.com",
        "password": "password123",
        "display_name": "Other User",
    })
    login_b = await client.post("/api/v1/auth/login", json={
        "email": "other@example.com",
        "password": "password123",
    })
    headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}

    resp = await client.get(f"/api/v1/spools/{spool['id']}", headers=headers_b)
    assert resp.status_code == 404  # not visible to other user


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
