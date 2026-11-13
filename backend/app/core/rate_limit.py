"""In-memory sliding-window rate limiter and the FastAPI dependencies built on it."""

from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta

from fastapi import Request

from app.core.clock import utcnow
from app.core.deps import CurrentUser
from app.core.errors import RateLimitedError


class SlidingWindowLimiter:
    """Counts hits per key inside a moving time window. Process-local by design."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[datetime]] = defaultdict(deque)

    def allow(self, key: str, *, limit: int, window: timedelta, now: datetime) -> bool:
        """Register a hit and report whether it fits the limit; rejected hits are not recorded."""
        hits = self._hits[key]
        while hits and now - hits[0] >= window:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True


def _limiter(request: Request) -> SlidingWindowLimiter:
    return request.app.state.rate_limiter


def limit_by_ip(
    scope: str, *, limit: int, window: timedelta, message: str
) -> Callable[[Request], Awaitable[None]]:
    async def dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        if not _limiter(request).allow(f"{scope}:ip:{client_ip}", limit=limit, window=window, now=utcnow()):
            raise RateLimitedError(message)

    return dependency


def limit_by_user(
    scope: str, *, limit: int, window: timedelta, message: str
) -> Callable[[Request, CurrentUser], Awaitable[None]]:
    async def dependency(request: Request, user: CurrentUser) -> None:
        if not _limiter(request).allow(f"{scope}:user:{user.id}", limit=limit, window=window, now=utcnow()):
            raise RateLimitedError(message)

    return dependency
