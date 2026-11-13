"""Wikivoyage API: the wikitext of a few articles, one request each, at most one a second."""

import logging

import httpx

from app.core.http import USER_AGENT
from app.core.throttle import Throttle

API_URL = "https://ru.wikivoyage.org/w/api.php"
REQUEST_TIMEOUT_S = 20.0
MIN_INTERVAL_S = 1.0

logger = logging.getLogger(__name__)


class WikivoyageClient:
    def __init__(
        self, *, http_client: httpx.AsyncClient | None = None, min_interval_s: float = MIN_INTERVAL_S
    ) -> None:
        self._http = http_client or httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_S, headers={"User-Agent": USER_AGENT}
        )
        self._throttle = Throttle(min_interval_s)
        self.requests_made = 0

    async def wikitext(self, title: str) -> str | None:
        """The article's current wikitext, or None on any failure. No retries."""
        params = {
            "action": "parse",
            "page": title,
            "prop": "wikitext",
            "format": "json",
            "formatversion": "2",
            "maxlag": "5",
        }
        async with self._throttle:
            self.requests_made += 1
            try:
                response = await self._http.get(API_URL, params=params)
                payload = response.json() if response.status_code == httpx.codes.OK else None
            except (httpx.HTTPError, ValueError) as error:
                logger.warning("Wikivoyage request failed: %s", type(error).__name__)
                return None
        text = (payload.get("parse") or {}).get("wikitext") if isinstance(payload, dict) else None
        return text if isinstance(text, str) else None

    async def aclose(self) -> None:
        await self._http.aclose()
