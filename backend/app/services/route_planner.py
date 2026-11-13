"""Builds route paths: the configured routing providers in order, straight segments otherwise."""

from collections import OrderedDict
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

from fastapi import Request

from app.core.config import Settings
from app.domain import routing
from app.domain.enums import PathMode, PathSource, RouteKind
from app.domain.geo import LngLat
from app.domain.routing import RoutedPath, TravelMode
from app.services.osrm_routing import OsrmRoutingClient
from app.services.twogis_routing import TwoGisRoutingClient

CACHE_SIZE = 256
COORDINATE_PRECISION = 5


class RoutingProvider(Protocol):
    source: PathSource
    max_points: int
    """Most points one request may carry; longer routes are requested in chunks."""

    async def route(self, travel: TravelMode, points: Sequence[LngLat]) -> RoutedPath | None:
        """A path through all points in order, or None when this provider cannot route them."""

    async def aclose(self) -> None: ...


PROVIDER_FACTORIES: dict[str, Callable[[Settings], RoutingProvider]] = {
    "osrm": lambda settings: OsrmRoutingClient(settings.osrm_base_url),
    "2gis": lambda settings: TwoGisRoutingClient(settings.twogis_api_key),
}


@dataclass(frozen=True, slots=True)
class PlannedPath:
    path: list[LngLat]
    legs_m: list[int]
    """Distance between consecutive requested points, along the path."""
    travel_min: int
    source: PathSource

    @property
    def distance_m(self) -> int:
        return sum(self.legs_m)


def straight_plan(kind: RouteKind, points: Sequence[LngLat]) -> PlannedPath:
    legs_m = [round(leg) for leg in routing.straight_legs_m(points)]
    return PlannedPath(list(points), legs_m, routing.travel_minutes(sum(legs_m), kind), PathSource.STRAIGHT)


class RoutePlanner:
    """Successful answers are cached by provider, travel mode and rounded points: the providers
    are public services with fair-use limits or tiny quotas."""

    def __init__(self, providers: Sequence[RoutingProvider]) -> None:
        self._providers = list(providers)
        self._cache: OrderedDict[tuple[PathSource, TravelMode, tuple[LngLat, ...]], RoutedPath] = (
            OrderedDict()
        )

    async def plan(
        self, kind: RouteKind, points: Sequence[LngLat], mode: PathMode = PathMode.ROADS
    ) -> PlannedPath:
        """Path through all points in order: the first provider that routes the whole route wins;
        when none does (outage, quota), straight segments."""
        if mode is PathMode.DIRECT:
            return straight_plan(kind, points)
        travel = routing.TRAVEL_BY_KIND[kind]
        for provider in self._providers:
            routed = await self._route(provider, travel, points)
            if routed is not None:
                legs_m = [round(leg) for leg in routed.legs_m]
                return PlannedPath(routed.path, legs_m, routed.travel_min, provider.source)
        return straight_plan(kind, points)

    async def _route(
        self, provider: RoutingProvider, travel: TravelMode, points: Sequence[LngLat]
    ) -> RoutedPath | None:
        """Long routes go as chunks sharing their joint points; the first failed chunk ends the attempt."""
        parts: list[RoutedPath] = []
        for chunk in routing.request_chunks(points, provider.max_points):
            routed = await self._cached_route(provider, travel, chunk)
            if routed is None:
                return None
            parts.append(routed)
        return routing.stitch(parts)

    async def _cached_route(
        self, provider: RoutingProvider, travel: TravelMode, points: Sequence[LngLat]
    ) -> RoutedPath | None:
        rounded = tuple(
            (round(lng, COORDINATE_PRECISION), round(lat, COORDINATE_PRECISION)) for lng, lat in points
        )
        key = (provider.source, travel, rounded)
        routed = self._cache.get(key)
        if routed is not None:
            self._cache.move_to_end(key)
            return routed
        routed = await provider.route(travel, points)
        if routed is not None:
            self._cache[key] = routed
            if len(self._cache) > CACHE_SIZE:
                self._cache.popitem(last=False)
        return routed

    async def aclose(self) -> None:
        for provider in self._providers:
            await provider.aclose()


def build_planner(settings: Settings) -> RoutePlanner:
    return RoutePlanner([PROVIDER_FACTORIES[name](settings) for name in settings.routing_provider_list])


def get_route_planner(request: Request) -> RoutePlanner:
    return request.app.state.route_planner
