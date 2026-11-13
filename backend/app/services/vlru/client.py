"""Polite HTTP client for VL.ru: one request per second, descriptive User-Agent, robots.txt rules."""

import asyncio
import logging
import time
from collections.abc import Mapping

import httpx

from app.core.http import USER_AGENT

BASE_URL = "https://www.vl.ru"
REQUEST_TIMEOUT_S = 15.0
MIN_INTERVAL_S = 1.0
DISALLOWED_PREFIXES = ("/off/map/", "/off/blackout/", "/afisha/admin", "/afisha/purchase/", "/ajax/")
DISALLOWED_QUERY_KEYS = frozenset({"page"})
"""`robots.txt` of the site forbids these; the importers must never ask for them."""

logger = logging.getLogger(__name__)


class VlRuClient:
    def __init__(
        self, *, http_client: httpx.AsyncClient | None = None, min_interval_s: float = MIN_INTERVAL_S
    ) -> None:
        self._http = http_client or httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=REQUEST_TIMEOUT_S,
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
        )
        self._min_interval_s = min_interval_s
        self._last_request_at = 0.0
        self._lock = asyncio.Lock()

    async def get(self, path: str, params: Mapping[str, str] | None = None) -> str | None:
        """Page text, or None on any failure. Requests are serialised and spaced out."""
        if path.startswith(DISALLOWED_PREFIXES) or DISALLOWED_QUERY_KEYS.intersection(params or {}):
            raise ValueError(f"robots.txt disallows {path}")
        async with self._lock:
            pause = self._last_request_at + self._min_interval_s - time.monotonic()
            if pause > 0:
                await asyncio.sleep(pause)
            try:
                response = await self._http.get(path, params=params)
            except httpx.HTTPError as error:
                logger.warning("VL.ru request %s failed: %s", path, type(error).__name__)
                return None
            finally:
                self._last_request_at = time.monotonic()
        if response.status_code != httpx.codes.OK:
            logger.warning("VL.ru responded with HTTP %s for %s", response.status_code, path)
            return None
        return response.text

    async def aclose(self) -> None:
        await self._http.aclose()
