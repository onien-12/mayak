"""HTTP client for the 2GIS Routing API, an optional routing provider (`ROUTING_PROVIDERS=2gis`).

It needs a key with Routing in its subscription; every failure is reported as "no route".
"""

import logging
from collections.abc import Sequence

import httpx

from app.core.http import USER_AGENT
from app.domain import routing
from app.domain.enums import PathSource
from app.domain.geo import LngLat
from app.domain.routing import RoutedPath, TravelMode

ROUTING_URL = "https://routing.api.2gis.com/routing/7.0.0/global"
REQUEST_TIMEOUT_S = 6.0
MAX_POINTS_PER_REQUEST = 10

TRANSPORTS: dict[TravelMode, str] = {
    TravelMode.FOOT: "walking",
    TravelMode.BIKE: "bicycle",
    TravelMode.CAR: "driving",
}

logger = logging.getLogger(__name__)


def _request_points(points: Sequence[LngLat]) -> list[dict[str, object]]:
    """First and last points are stops, the rest are via points.

    Several `stop` points would be read by the API as alternative destinations: the route
    would end at whichever is closest to the start.
    """
    last = len(points) - 1
    return [
        {"type": "stop" if index in (0, last) else "pref", "lon": lng, "lat": lat}
        for index, (lng, lat) in enumerate(points)
    ]


class TwoGisRoutingClient:
    source = PathSource.TWOGIS
    max_points = MAX_POINTS_PER_REQUEST

    def __init__(self, api_key: str, *, http_client: httpx.AsyncClient | None = None) -> None:
        self._api_key = api_key
        self._http = http_client or httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_S, headers={"User-Agent": USER_AGENT}
        )

    async def route(self, travel: TravelMode, points: Sequence[LngLat]) -> RoutedPath | None:
        """Route through `points` (lng, lat); None when the key is missing or the API fails."""
        if not self._api_key:
            return None
        body = {"points": _request_points(points), "transport": TRANSPORTS[travel], "locale": "ru"}
        try:
            response = await self._http.post(ROUTING_URL, params={"key": self._api_key}, json=body)
        except httpx.HTTPError as error:
            logger.warning("2GIS routing request failed: %s", type(error).__name__)
            return None
        if response.status_code != httpx.codes.OK:
            logger.warning("2GIS routing responded with HTTP %s", response.status_code)
            return None
        try:
            routed = routing.parse_twogis_response(response.json(), points)
        except ValueError:
            return None
        if routed is not None and not routing.passes_through(routed.path, points):
            logger.warning("2GIS route does not pass through every requested point")
            return None
        return routed

    async def aclose(self) -> None:
        await self._http.aclose()
