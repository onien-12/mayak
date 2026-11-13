"""Routing on OpenStreetMap data through an OSRM server; every failure is reported as "no route".

The default server is the FOSSGIS one behind openstreetmap.org: no key, but a fair-use policy —
a descriptive User-Agent, at most one request a second, cached results. The planner caches, and
one client per process spaces its requests.
"""

import logging
from collections.abc import Sequence

import httpx

from app.core.http import USER_AGENT
from app.core.throttle import Throttle
from app.domain import routing
from app.domain.enums import PathSource
from app.domain.geo import LngLat
from app.domain.routing import RoutedPath, TravelMode

MAX_POINTS_PER_REQUEST = 25
REQUEST_TIMEOUT_S = 8.0
MIN_REQUEST_INTERVAL_S = 1.0
COORDINATE_DECIMALS = 6

PROFILES: dict[TravelMode, tuple[str, str]] = {
    TravelMode.FOOT: ("routed-foot", "foot"),
    TravelMode.BIKE: ("routed-bike", "bike"),
    TravelMode.CAR: ("routed-car", "driving"),
}
"""Travel mode → (service path on the FOSSGIS server, OSRM profile)."""

ROUTE_PARAMS = {"overview": "full", "geometries": "geojson", "steps": "false"}

logger = logging.getLogger(__name__)


class OsrmRoutingClient:
    source = PathSource.OSM
    max_points = MAX_POINTS_PER_REQUEST

    def __init__(
        self,
        base_url: str,
        *,
        http_client: httpx.AsyncClient | None = None,
        throttle: Throttle | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._http = http_client or httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_S, headers={"User-Agent": USER_AGENT}
        )
        self._throttle = throttle or Throttle(MIN_REQUEST_INTERVAL_S)

    def _route_url(self, travel: TravelMode, points: Sequence[LngLat]) -> str:
        service, profile = PROFILES[travel]
        coordinates = ";".join(
            f"{lng:.{COORDINATE_DECIMALS}f},{lat:.{COORDINATE_DECIMALS}f}" for lng, lat in points
        )
        return f"{self._base_url}/{service}/route/v1/{profile}/{coordinates}"

    async def route(self, travel: TravelMode, points: Sequence[LngLat]) -> RoutedPath | None:
        """Route through `points` (lng, lat) in order; None when the server cannot or fails."""
        try:
            async with self._throttle:
                response = await self._http.get(self._route_url(travel, points), params=ROUTE_PARAMS)
        except httpx.HTTPError as error:
            logger.warning("OSRM routing request failed: %s", type(error).__name__)
            return None
        if response.status_code != httpx.codes.OK:
            logger.warning("OSRM routing responded with HTTP %s", response.status_code)
            return None
        try:
            payload = response.json()
        except ValueError:
            return None
        return routing.parse_osrm_response(payload, points)

    async def aclose(self) -> None:
        await self._http.aclose()
