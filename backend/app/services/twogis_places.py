"""HTTP client for the 2GIS Places API (`items/byid`): object outlines and aggregate ratings.

The Places quota is tiny (1 000 requests a month), so callers cache every answer. Every failure
is reported as "nothing"; the key is never logged.
"""

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.http import USER_AGENT

PLACES_URL = "https://catalog.api.2gis.com/3.0/items/byid"
OUTLINE_FIELDS = "items.point,items.geometry.selection,items.name,items.full_name"
RATING_FIELDS = "items.reviews"
REQUEST_TIMEOUT_S = 6.0

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ObjectRating:
    """`rating` is None when the object exists but has no ratings yet."""

    rating: float | None
    count: int


def parse_rating(payload: Any) -> ObjectRating | None:
    """`result.items[0].reviews.{general_rating, general_review_count}`; None when malformed."""
    try:
        reviews = payload["result"]["items"][0].get("reviews") or {}
    except (KeyError, IndexError, TypeError, AttributeError):
        return None
    rating, count = reviews.get("general_rating"), reviews.get("general_review_count")
    count = count if isinstance(count, int) and not isinstance(count, bool) and count >= 0 else 0
    if isinstance(rating, int | float) and not isinstance(rating, bool) and 0 < rating <= 5 and count:
        return ObjectRating(round(float(rating), 2), count)
    return ObjectRating(None, count)


class TwoGisPlacesClient:
    def __init__(self, api_key: str, *, http_client: httpx.AsyncClient | None = None) -> None:
        self._api_key = api_key
        self._http = http_client or httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_S, headers={"User-Agent": USER_AGENT}
        )

    async def _item(self, object_id: str, fields: str) -> Any | None:
        if not self._api_key:
            return None
        params = {"id": object_id, "fields": fields, "key": self._api_key}
        try:
            response = await self._http.get(PLACES_URL, params=params)
            return response.json() if response.status_code == httpx.codes.OK else None
        except (httpx.HTTPError, ValueError) as error:
            logger.warning("2GIS Places request failed: %s", type(error).__name__)
            return None

    async def object_outline(self, object_id: str) -> tuple[str, str] | None:
        """`(title, WKT)` of a map object, or None."""
        payload = await self._item(object_id, OUTLINE_FIELDS)
        try:
            item = payload["result"]["items"][0]
            title = next(
                (
                    value
                    for key in ("name", "full_name", "address_name")
                    if isinstance(value := item.get(key), str) and value.strip()
                ),
                "",
            )
            return title.strip(), item["geometry"]["selection"]
        except (KeyError, IndexError, TypeError, AttributeError):
            return None

    async def object_rating(self, object_id: str) -> ObjectRating | None:
        """The object's aggregate rating; None when the request failed."""
        payload = await self._item(object_id, RATING_FIELDS)
        return parse_rating(payload) if payload is not None else None

    async def aclose(self) -> None:
        await self._http.aclose()
