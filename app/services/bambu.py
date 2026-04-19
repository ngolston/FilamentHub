"""
Bambu Lab Cloud API client.

Uses the official Bambu Cloud REST API documented at:
  https://bambutools.github.io/bambulabs_api/api.html
  https://github.com/Doridian/OpenBambuAPI

Authentication:
  POST https://api.bambulab.com/v1/user-service/user/login
  Body: {"account": "<email>", "password": "<password>"}
  Returns: {"accessToken": "...", "refreshToken": "...", "message": "success"}

Device list:
  GET https://api.bambulab.com/v1/iot-service/api/user/bind
  Authorization: Bearer <accessToken>
"""

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_BASE_URL   = "https://api.bambulab.com"
_AUTH_URL   = f"{_BASE_URL}/v1/user-service/user/login"
_DEVICE_URL = f"{_BASE_URL}/v1/iot-service/api/user/bind"
_TIMEOUT    = 15.0


class BambuAuthError(Exception):
    """Raised when authentication fails."""


class BambuApiError(Exception):
    """Raised when the Bambu API returns an unexpected response."""


_TFA_MESSAGES = {"verifyCode", "tfa", "2fa", "mfa"}


def _parse_token_response(data: dict) -> dict[str, str]:
    """Extract tokens from a successful Bambu auth response."""
    token   = data.get("accessToken")
    refresh = data.get("refreshToken", "")
    if not token:
        raise BambuApiError("Bambu returned success but no accessToken in response")
    return {"access_token": token, "refresh_token": refresh}


def _is_tfa_required(data: dict) -> bool:
    """Return True if Bambu is asking for a 2FA / verification code."""
    msg = (data.get("message") or "").lower()
    return msg in _TFA_MESSAGES or "verif" in msg or "code" in msg


async def _post_auth(payload: dict) -> dict:
    """POST to the Bambu auth endpoint and return the parsed JSON body."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            resp = await client.post(
                _AUTH_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
        except httpx.RequestError as exc:
            raise BambuApiError(f"Network error reaching Bambu Cloud: {exc}") from exc

    if resp.status_code in (400, 401, 403):
        try:
            body   = resp.json()
            detail = body.get("error") or body.get("message") or "Invalid credentials"
        except Exception:
            detail = "Invalid credentials"
        raise BambuAuthError(detail)

    if resp.status_code != 200:
        raise BambuApiError(f"Bambu auth returned HTTP {resp.status_code}")

    return resp.json()


async def authenticate(email: str, password: str) -> dict[str, Any]:
    """
    Step 1 — Exchange email + password for tokens.

    Returns one of:
      {"access_token": str, "refresh_token": str}          — fully authenticated
      {"tfa_required": True}                               — 2FA code needed (call authenticate_2fa next)

    Raises:
        BambuAuthError — wrong credentials or account locked
        BambuApiError  — unexpected API response
    """
    data = await _post_auth({"account": email, "password": password})

    if _is_tfa_required(data):
        return {"tfa_required": True}

    if data.get("error") or (data.get("message", "success") != "success" and not data.get("accessToken")):
        raise BambuAuthError(data.get("error") or data.get("message") or "Authentication failed")

    return _parse_token_response(data)


async def authenticate_2fa(email: str, code: str) -> dict[str, str]:
    """
    Step 2 — Submit the 2FA / email verification code.

    Returns:
      {"access_token": str, "refresh_token": str}

    Raises:
        BambuAuthError — wrong or expired code
        BambuApiError  — unexpected API response
    """
    data = await _post_auth({"account": email, "code": code})

    if data.get("error") or (data.get("message", "success") != "success" and not data.get("accessToken")):
        raise BambuAuthError(data.get("error") or data.get("message") or "Invalid or expired verification code")

    return _parse_token_response(data)


async def get_devices(access_token: str) -> list[dict[str, Any]]:
    """
    Return the authenticated user's device list from Bambu Cloud.

    Each device dict contains at minimum:
      dev_id, name, dev_model_name, dev_product_name, nozzle_diameter
    """
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            resp = await client.get(
                _DEVICE_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        except httpx.RequestError as exc:
            raise BambuApiError(f"Network error reaching Bambu Cloud: {exc}") from exc

    if resp.status_code == 401:
        raise BambuAuthError("Bambu access token is invalid or expired")

    if resp.status_code != 200:
        raise BambuApiError(f"Bambu device list returned HTTP {resp.status_code}")

    data = resp.json()
    # Response: {"message": "success", "devices": [...]}
    if isinstance(data, list):
        return data
    devices = data.get("devices")
    if isinstance(devices, list):
        return devices
    return []
