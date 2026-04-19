"""
Home Assistant REST API client.

Docs: https://developers.home-assistant.io/docs/api/rest/

FilamentHub pushes one sensor entity per spool:
  sensor.filamenthub_spool_<id>

Entity attributes include: fill_pct, remaining_g, status, brand, material, color.
State value = fill percentage (0-100).
"""

import logging
import re
from typing import Any

import httpx

from app.models.models import Spool

logger = logging.getLogger(__name__)
_TIMEOUT = 10.0


class HaConnectionError(Exception):
    """Raised when we cannot reach the HA instance."""


class HaAuthError(Exception):
    """Raised when the token is invalid."""


def _slug(name: str) -> str:
    """Turn a display name into a safe entity-ID segment."""
    return re.sub(r"[^a-z0-9_]", "_", name.lower().strip())


def _entity_id(spool: Spool) -> str:
    fp   = spool.filament
    mat  = _slug(fp.material if fp else "unknown")
    name = _slug(spool.name or (fp.name if fp else "") or str(spool.id))
    return f"sensor.filamenthub_{mat}_{name}_{spool.id}"


def _state_payload(spool: Spool) -> dict[str, Any]:
    fp = spool.filament
    return {
        "state": round(spool.fill_percentage, 1),
        "attributes": {
            "unit_of_measurement": "%",
            "friendly_name": spool.name or (fp.name if fp else f"Spool #{spool.id}"),
            "icon": "mdi:printer-3d-nozzle",
            "device_class": None,
            "spool_id": spool.id,
            "brand": spool.brand.name if spool.brand else None,
            "material": fp.material if fp else None,
            "color_hex": fp.color_hex if fp else None,
            "color_name": fp.color_name if fp else None,
            "remaining_g": round(spool.remaining_weight, 1),
            "initial_g": round(spool.initial_weight, 1),
            "used_g": round(spool.used_weight, 1),
            "status": spool.status,
            "location": spool.location.name if spool.location else None,
        },
    }


async def test_connection(url: str, token: str) -> dict[str, Any]:
    """
    Verify HA URL + token by hitting GET /api/.
    Returns the HA API info dict on success.
    Raises HaConnectionError or HaAuthError on failure.
    """
    base = url.rstrip("/")
    async with httpx.AsyncClient(timeout=_TIMEOUT, verify=False) as client:  # noqa: S501
        try:
            resp = await client.get(
                f"{base}/api/",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
        except httpx.RequestError as exc:
            raise HaConnectionError(f"Cannot reach Home Assistant at {url}: {exc}") from exc

    if resp.status_code == 401:
        raise HaAuthError("Invalid or expired Home Assistant token")
    if resp.status_code != 200:
        raise HaConnectionError(f"HA returned HTTP {resp.status_code}")

    return resp.json()


async def push_spool_sensors(url: str, token: str, spools: list[Spool]) -> dict[str, Any]:
    """
    POST each spool's current state to HA as a sensor entity.

    Returns a summary dict: {"pushed": int, "errors": int}.
    """
    base    = url.rstrip("/")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    pushed  = 0
    errors  = 0

    async with httpx.AsyncClient(timeout=_TIMEOUT, verify=False) as client:  # noqa: S501
        for spool in spools:
            eid     = _entity_id(spool)
            payload = _state_payload(spool)
            try:
                resp = await client.post(
                    f"{base}/api/states/{eid}",
                    headers=headers,
                    json=payload,
                )
                if resp.status_code in (200, 201):
                    pushed += 1
                else:
                    logger.warning("HA push for %s returned %s", eid, resp.status_code)
                    errors += 1
            except httpx.RequestError as exc:
                logger.warning("HA push for %s failed: %s", eid, exc)
                errors += 1

    return {"pushed": pushed, "errors": errors, "total": len(spools)}
