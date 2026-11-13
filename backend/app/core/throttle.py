"""Spacing of outbound requests to public services with a fair-use limit."""

import asyncio
import time
from collections.abc import Awaitable, Callable
from types import TracebackType


class Throttle:
    """An async context manager around each request: requests run one at a time, and each starts
    at least `interval_s` after the previous one finished."""

    def __init__(
        self,
        interval_s: float,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._interval_s = interval_s
        self._clock = clock
        self._sleep = sleep
        self._lock = asyncio.Lock()
        self._finished_at: float | None = None

    async def __aenter__(self) -> None:
        await self._lock.acquire()
        if self._finished_at is not None:
            pause = self._finished_at + self._interval_s - self._clock()
            if pause > 0:
                await self._sleep(pause)

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self._finished_at = self._clock()
        self._lock.release()
