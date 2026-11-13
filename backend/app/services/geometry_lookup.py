"""Finds a territory outline for a new area: the 2GIS object's own geometry or an OSM boundary.

Both sources are metered or rate-limited, so answers are cached and Nominatim requests are
spaced at least a second apart. Whatever comes back is untrusted: only valid polygons survive.
"""

import asyncio
import logging
import time
from collections import OrderedDict
from typing import Any, Protocol

import httpx
from fastapi import Request

from app.core.http import USER_AGENT
from app.domain import geo, geometry
from app.domain.geo import BBox
from app.schemas.area import AreaGeometryCandidate

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSM_ATTRIBUTION = "© участники OpenStreetMap"
REQUEST_TIMEOUT_S = 10.0
NOMINATIM_MIN_INTERVAL_S = 1.0
MAX_CANDIDATES = 5
CACHE_SIZE = 256
NOMINATIM_LIMIT = 10
_BIAS_PRECISION = 2

logger = logging.getLogger(__name__)


class PlacesClient(Protocol):
    async def object_outline(self, object_id: str) -> tuple[str, str] | None:
        """`(title, WKT)` of a 2GIS map object, or None."""


class BoundaryClient(Protocol):
    async def search(self, query: str) -> list[dict[str, Any]]:
        """Raw Nominatim hits inside the service region, with their GeoJSON."""


class NominatimClient:
    """Searches only inside the service region (`OSM_BBOX`): a park of the same name in another
    city is never offered."""

    def __init__(self, region: BBox, *, http_client: httpx.AsyncClient | None = None) -> None:
        self._viewbox = f"{region.min_lng},{region.max_lat},{region.max_lng},{region.min_lat}"
        self._http = http_client or httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_S, headers={"User-Agent": USER_AGENT}
        )
        self._lock = asyncio.Lock()
        self._last_request_at = 0.0

    async def search(self, query: str) -> list[dict[str, Any]]:
        params: dict[str, str | int] = {
            "q": query,
            "format": "jsonv2",
            "polygon_geojson": 1,
            "limit": NOMINATIM_LIMIT,
            "accept-language": "ru",
            "viewbox": self._viewbox,
            "bounded": 1,
        }
        async with self._lock:
            pause = self._last_request_at + NOMINATIM_MIN_INTERVAL_S - time.monotonic()
            if pause > 0:
                await asyncio.sleep(pause)
            try:
                response = await self._http.get(NOMINATIM_URL, params=params)
                hits = response.json() if response.status_code == httpx.codes.OK else []
            except (httpx.HTTPError, ValueError) as error:
                logger.warning("Nominatim lookup failed: %s", type(error).__name__)
                hits = []
            finally:
                self._last_request_at = time.monotonic()
        return hits if isinstance(hits, list) else []

    async def aclose(self) -> None:
        await self._http.aclose()


def _short_title(hit: dict[str, Any], query: str) -> str:
    """The object's own name («Нагорный парк»), not the full address chain of `display_name`."""
    name = hit.get("name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    display_name = hit.get("display_name")
    first = display_name.split(",")[0].strip() if isinstance(display_name, str) else ""
    return first or query


def _distance_m(hit: dict[str, Any], near: tuple[float, float]) -> float:
    try:
        return geo.haversine_m(near[0], near[1], float(hit["lat"]), float(hit["lon"]))
    except (KeyError, TypeError, ValueError):
        return float("inf")


class GeometryLookup:
    def __init__(self, places: PlacesClient, boundaries: BoundaryClient) -> None:
        self._places = places
        self._boundaries = boundaries
        self._cache: OrderedDict[tuple[str, ...], list[AreaGeometryCandidate]] = OrderedDict()

    def _remember(self, key: tuple[str, ...], candidates: list[AreaGeometryCandidate]) -> None:
        self._cache[key] = candidates
        if len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)

    async def by_object(self, object_id: str) -> list[AreaGeometryCandidate]:
        """The polygon of a 2GIS map object; empty when it has none."""
        key = ("object", object_id)
        if key in self._cache:
            return self._cache[key]
        outline = await self._places.object_outline(object_id)
        polygon = geometry.parse_wkt(outline[1]) if outline else None
        candidates = (
            [AreaGeometryCandidate(title=outline[0], source="2gis", geometry=polygon, attribution=None)]
            if outline and polygon
            else []
        )
        if outline is not None:
            self._remember(key, candidates)
        return candidates

    async def by_query(self, query: str, near: tuple[float, float] | None) -> list[AreaGeometryCandidate]:
        """Boundaries found in OpenStreetMap by name; only polygonal results are kept."""
        bias = tuple(f"{value:.{_BIAS_PRECISION}f}" for value in near) if near else ()
        key = ("query", query.casefold(), *bias)
        if key in self._cache:
            return self._cache[key]
        hits = [hit for hit in await self._boundaries.search(query) if isinstance(hit, dict)]
        if near is not None:
            hits.sort(key=lambda hit: _distance_m(hit, near))
        candidates: list[AreaGeometryCandidate] = []
        for hit in hits:
            polygon = geometry.polygonal_geojson(hit.get("geojson"))
            if polygon is not None:
                candidates.append(
                    AreaGeometryCandidate(
                        title=_short_title(hit, query),
                        source="osm",
                        geometry=polygon,
                        attribution=OSM_ATTRIBUTION,
                    )
                )
        candidates = candidates[:MAX_CANDIDATES]
        self._remember(key, candidates)
        return candidates


def get_geometry_lookup(request: Request) -> GeometryLookup:
    return request.app.state.geometry_lookup
