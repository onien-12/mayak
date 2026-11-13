"""Polite client for the Wikimedia APIs (Commons, Wikidata, Russian Wikipedia).

Few, batched requests: fifty files or entities, twenty articles per request; at most one request
a second across all three; the fixed descriptive User-Agent; `maxlag` honoured; no retries. A
refusal (403 / 429) from a service stops every further request to that service in the run.
"""

import logging
from collections import Counter
from collections.abc import Sequence
from typing import Any

import httpx

from app.core.http import USER_AGENT
from app.core.throttle import Throttle
from app.services.wikimedia import parser
from app.services.wikimedia.parser import Article, CommonsPhoto, Entity, Page

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
WIKIPEDIA_API = "https://ru.wikipedia.org/w/api.php"
SERVICES = {COMMONS_API: "commons", WIKIDATA_API: "wikidata", WIKIPEDIA_API: "wikipedia"}
REQUEST_TIMEOUT_S = 20.0
MIN_INTERVAL_S = 1.0
GEOSEARCH_LIMIT = 20
ARTICLES_NEAR_LIMIT = 500
CATEGORY_LIMIT = 20
THUMB_WIDTH_PX = 1280
BATCH_SIZE = 50
"""The API's own limit for `titles` / `ids` lists."""
EXTRACTS_BATCH_SIZE = 20
"""Introductions are given for at most twenty pages a request."""
_IMAGE_INFO = {
    "prop": "imageinfo|coordinates",
    "iiprop": "url|extmetadata|size|mime",
    "iiurlwidth": str(THUMB_WIDTH_PX),
    "iiextmetadatafilter": "Artist|LicenseShortName|ImageDescription|Categories",
}
_REFUSALS = frozenset({httpx.codes.FORBIDDEN, httpx.codes.TOO_MANY_REQUESTS})
_COMMON = {"format": "json", "formatversion": "2", "maxlag": "5"}

logger = logging.getLogger(__name__)


def _batches(items: Sequence[str], size: int) -> list[Sequence[str]]:
    return [items[start : start + size] for start in range(0, len(items), size)]


class WikimediaClient:
    def __init__(
        self, *, http_client: httpx.AsyncClient | None = None, min_interval_s: float = MIN_INTERVAL_S
    ) -> None:
        self._http = http_client or httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_S, headers={"User-Agent": USER_AGENT}
        )
        self._throttle = Throttle(min_interval_s)
        self.requests_made: Counter[str] = Counter()
        self.refused: set[str] = set()
        """Services that refused to serve us; nothing more is asked of them in this run."""

    async def _get(self, url: str, params: dict[str, str]) -> Any | None:
        service = SERVICES[url]
        async with self._throttle:
            if service in self.refused:
                return None
            self.requests_made[service] += 1
            try:
                response = await self._http.get(url, params={**_COMMON, **params})
                if response.status_code in _REFUSALS:
                    self.refused.add(service)
                    logger.warning("Wikimedia %s refused with HTTP %s", service, response.status_code)
                payload = response.json() if response.status_code == httpx.codes.OK else None
            except (httpx.HTTPError, ValueError) as error:
                logger.warning("Wikimedia %s request failed: %s", service, type(error).__name__)
                return None
        if isinstance(payload, dict) and "error" in payload:
            logger.warning("Wikimedia %s API error: %s", service, str(payload["error"].get("code"))[:40])
            return None
        return payload

    async def nearby(self, lat: float, lng: float, radius_m: int) -> list[CommonsPhoto]:
        """Geotagged Commons files around the point."""
        payload = await self._get(
            COMMONS_API,
            {
                "action": "query",
                "generator": "geosearch",
                "ggsnamespace": "6",
                "ggscoord": f"{lat:.6f}|{lng:.6f}",
                "ggsradius": str(radius_m),
                "ggslimit": str(GEOSEARCH_LIMIT),
                **_IMAGE_INFO,
            },
        )
        return list(parser.photos_from_query(payload))

    async def category(self, title: str) -> list[CommonsPhoto]:
        """Files of a Commons category (`Category:…`), as the category lists them."""
        payload = await self._get(
            COMMONS_API,
            {
                "action": "query",
                "generator": "categorymembers",
                "gcmtitle": title,
                "gcmtype": "file",
                "gcmlimit": str(CATEGORY_LIMIT),
                **_IMAGE_INFO,
            },
        )
        return list(parser.photos_from_query(payload))

    async def files(self, titles: Sequence[str]) -> list[CommonsPhoto]:
        """Named files (`File:…`), fifty per request."""
        photos: list[CommonsPhoto] = []
        for batch in _batches(titles, BATCH_SIZE):
            payload = await self._get(
                COMMONS_API, {"action": "query", "titles": "|".join(batch), **_IMAGE_INFO}
            )
            photos.extend(parser.photos_from_query(payload))
        return photos

    async def entities(self, entity_ids: Sequence[str]) -> dict[str, Entity]:
        """Image, Commons category and Russian article of Wikidata items, fifty per request."""
        found: dict[str, Entity] = {}
        for batch in _batches(entity_ids, BATCH_SIZE):
            payload = await self._get(
                WIKIDATA_API,
                {
                    "action": "wbgetentities",
                    "ids": "|".join(batch),
                    "props": "claims|sitelinks",
                    "sitefilter": "ruwiki",
                },
            )
            found.update(parser.entities(payload))
        return found

    async def articles_near(self, lat: float, lng: float, radius_m: int) -> list[Article]:
        """Geotagged Russian Wikipedia articles around the point, up to five hundred."""
        payload = await self._get(
            WIKIPEDIA_API,
            {
                "action": "query",
                "list": "geosearch",
                "gscoord": f"{lat:.6f}|{lng:.6f}",
                "gsradius": str(radius_m),
                "gslimit": str(ARTICLES_NEAR_LIMIT),
            },
        )
        return parser.articles_near(payload)

    async def pages(self, titles: Sequence[str]) -> dict[str, Page]:
        """Wikidata id, free lead image and first paragraph of articles, twenty per request."""
        found: dict[str, Page] = {}
        for batch in _batches(titles, EXTRACTS_BATCH_SIZE):
            payload = await self._get(
                WIKIPEDIA_API,
                {
                    "action": "query",
                    "titles": "|".join(batch),
                    "redirects": "1",
                    "prop": "extracts|pageimages|pageprops",
                    "exintro": "1",
                    "explaintext": "1",
                    "exlimit": str(EXTRACTS_BATCH_SIZE),
                    "piprop": "name",
                    "pilicense": "free",
                    "pilimit": str(EXTRACTS_BATCH_SIZE),
                    "ppprop": "wikibase_item",
                },
            )
            found.update(parser.pages(payload, batch))
        return found

    async def aclose(self) -> None:
        await self._http.aclose()
