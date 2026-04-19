"""
Simple in-memory rate limiter for auth endpoints.

Uses a sliding-window counter per (IP, route) key.
No external dependencies required.

For production at scale, swap the in-memory store for a Redis backend.
"""

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request, status


class RateLimiter:
    """Thread-safe sliding-window rate limiter."""

    def __init__(self, max_calls: int, window_seconds: int) -> None:
        self.max_calls = max_calls
        self.window = window_seconds
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def check(self, request: Request, route_key: str = "") -> None:
        """Raise 429 if the client has exceeded the rate limit."""
        key = f"{self._client_ip(request)}:{route_key}"
        now = time.monotonic()
        cutoff = now - self.window

        with self._lock:
            bucket = self._buckets[key]
            # Evict timestamps outside the window
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= self.max_calls:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many requests. Try again in {self.window} seconds.",
                    headers={"Retry-After": str(self.window)},
                )
            bucket.append(now)


# ── Shared limiters ───────────────────────────────────────────────────────────
# These are module-level singletons shared across all requests.

# Auth endpoints: 10 attempts per 60 s per IP
auth_limiter = RateLimiter(max_calls=10, window_seconds=60)

# Password reset requests: 5 per 15 min per IP (prevent email spam)
reset_limiter = RateLimiter(max_calls=5, window_seconds=900)
