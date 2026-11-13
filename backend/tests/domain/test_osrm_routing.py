"""OSRM: response parsing with off-network points, the client against `httpx.MockTransport`,
the request throttle and the routing settings."""

from collections.abc import Sequence
from typing import Any

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import ROUTING_PROVIDER_NAMES, Settings
from app.core.http import USER_AGENT
from app.core.throttle import Throttle
from app.domain import geo, routing
from app.domain.geo import LngLat
from app.domain.routing import TravelMode
from app.services.osrm_routing import OsrmRoutingClient
from app.services.route_planner import PROVIDER_FACTORIES
from app.services.twogis_routing import TwoGisRoutingClient

A, B, C, D = (131.880, 43.110), (131.885, 43.110), (131.885, 43.115), (131.890, 43.115)
NORTH_OF_C = (131.885, 43.120)
"""About 560 m from C: beyond the snapping limit."""
BASE_URL = "https://osrm.test"


def _length(*points: LngLat) -> float:
    return sum(routing.straight_legs_m(points))


def _payload(path: Sequence[LngLat], legs_m: Sequence[float], snaps_m: Sequence[float]) -> dict[str, Any]:
    return {
        "code": "Ok",
        "routes": [
            {
                "distance": sum(legs_m),
                "duration": 600.0,
                "geometry": {"type": "LineString", "coordinates": [list(point) for point in path]},
                "legs": [{"distance": leg, "duration": 0, "steps": [], "summary": ""} for leg in legs_m],
            }
        ],
        "waypoints": [{"location": [0, 0], "distance": snap, "name": ""} for snap in snaps_m],
    }


def _connector_s(*points: LngLat) -> float:
    return _length(*points) / (routing.OFF_NETWORK_SPEED_KMH * 1000) * routing.SECONDS_PER_HOUR


def test_parse_osrm_multi_leg_route() -> None:
    legs = [_length(A, B, C), _length(C, D)]
    routed = routing.parse_osrm_response(_payload([A, B, C, D], legs, [3, 12, 40]), [A, C, D])
    assert routed is not None
    assert (routed.path, routed.legs_m, routed.duration_s, routed.travel_min) == ([A, B, C, D], legs, 600, 10)


@pytest.mark.parametrize(
    "payload",
    [
        {"code": "NoRoute", "message": "Impossible route between points", "routes": []},
        {"code": "Ok", "routes": [], "waypoints": []},
        {"code": "Ok", "routes": [{"duration": 1, "legs": [{"distance": 1}]}], "waypoints": []},
        {**_payload([A, C], [1.0], [0, 0]), "waypoints": [{"distance": 0}]},
        _payload([A], [1.0], [0, 0]),
        _payload([A, C], [1.0, 2.0], [0, 0]),
        {"message": "Too many requests"},
        [],
    ],
)
def test_parse_osrm_response_without_usable_route(payload: Any) -> None:
    assert routing.parse_osrm_response(payload, [A, C]) is None


def test_far_start_and_finish_are_joined_by_straight_connectors() -> None:
    start, finish = (131.875, 43.110), NORTH_OF_C
    legs = [_length(A, B, C)]
    routed = routing.parse_osrm_response(_payload([A, B, C], legs, [406, 556]), [start, finish])
    assert routed is not None
    assert routed.path == [start, A, B, C, finish]
    assert routed.legs_m == [pytest.approx(_length(start, A, B, C, finish))]
    assert routed.duration_s == pytest.approx(600 + _connector_s(start, A) + _connector_s(C, finish))


def test_far_intermediate_point_is_visited_out_and_back() -> None:
    legs = [_length(A, B, C), _length(C, D)]
    routed = routing.parse_osrm_response(_payload([A, B, C, D], legs, [0, 556, 0]), [A, NORTH_OF_C, D])
    assert routed is not None
    assert routed.path == [A, B, C, NORTH_OF_C, C, D]
    spur = _length(C, NORTH_OF_C)
    assert routed.legs_m == [pytest.approx(legs[0] + spur), pytest.approx(legs[1] + spur)]
    assert routed.duration_s == pytest.approx(600 + 2 * _connector_s(C, NORTH_OF_C))


def test_near_points_are_snapped_without_connectors() -> None:
    near_a = (131.8798, 43.1101)
    assert geo.haversine_m(near_a[1], near_a[0], A[1], A[0]) < routing.MAX_SNAP_M
    routed = routing.parse_osrm_response(_payload([A, B, C], [_length(A, B, C)], [20, 0]), [near_a, C])
    assert routed is not None
    assert routed.path == [A, B, C]


def test_leg_split_keeps_the_order_on_an_out_and_back_path() -> None:
    legs = [_length(A, B, C), _length(C, B, A)]
    routed = routing.parse_osrm_response(_payload([A, B, C, B, A], legs, [0, 556, 0]), [A, NORTH_OF_C, A])
    assert routed is not None
    assert routed.path == [A, B, C, NORTH_OF_C, C, B, A]


def _client(handler: Any, throttle: Throttle | None = None) -> OsrmRoutingClient:
    return OsrmRoutingClient(
        f"{BASE_URL}/",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        throttle=throttle,
    )


async def test_osrm_request_shape() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=_payload([A, B, C], [_length(A, B, C)], [0, 0]))

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), headers={"User-Agent": USER_AGENT}
    ) as http:
        routed = await OsrmRoutingClient(BASE_URL, http_client=http).route(TravelMode.BIKE, [A, C])
    assert routed is not None
    assert routed.path == [A, B, C]
    request = seen[0]
    assert request.url.path == "/routed-bike/route/v1/bike/131.880000,43.110000;131.885000,43.115000"
    assert dict(request.url.params) == {"overview": "full", "geometries": "geojson", "steps": "false"}
    assert request.headers["User-Agent"] == USER_AGENT


@pytest.mark.parametrize(
    ("travel", "prefix"),
    [(TravelMode.FOOT, "/routed-foot/route/v1/foot/"), (TravelMode.CAR, "/routed-car/route/v1/driving/")],
)
async def test_osrm_profiles(travel: TravelMode, prefix: str) -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(200, json=_payload([A, C], [_length(A, C)], [0, 0]))

    await _client(handler).route(travel, [A, C])
    assert seen[0].startswith(prefix)


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(400, json={"code": "NoRoute", "message": "Impossible route between points"}),
        httpx.Response(429, text="Too Many Requests"),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"code": "NoSegment"}),
    ],
)
async def test_osrm_failures_mean_no_route(response: httpx.Response) -> None:
    assert await _client(lambda _: response).route(TravelMode.FOOT, [A, C]) is None


async def test_osrm_network_error_means_no_route() -> None:
    def explode(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("no network", request=request)

    assert await _client(explode).route(TravelMode.FOOT, [A, C]) is None


class FakeTime:
    def __init__(self) -> None:
        self.now = 1000.0
        self.slept: list[float] = []

    def clock(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds


async def test_throttle_spaces_requests_from_the_end_of_the_previous_one() -> None:
    time = FakeTime()
    throttle = Throttle(1.0, clock=time.clock, sleep=time.sleep)
    async with throttle:
        time.now += 0.3
    async with throttle:
        time.now += 0.2
    time.now += 5
    async with throttle:
        pass
    assert time.slept == [pytest.approx(1.0)]


async def test_osrm_client_requests_go_through_the_throttle() -> None:
    time = FakeTime()
    calls: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(time.now)
        return httpx.Response(503)

    client = _client(handler, Throttle(1.0, clock=time.clock, sleep=time.sleep))
    for _ in range(3):
        await client.route(TravelMode.FOOT, [A, C])
    assert calls == [1000.0, 1001.0, 1002.0]


def test_routing_provider_settings() -> None:
    assert Settings(_env_file=None).routing_provider_list == ["osrm"]
    assert Settings(_env_file=None, routing_providers=" osrm, 2gis ").routing_provider_list == [
        "osrm",
        "2gis",
    ]
    assert Settings(_env_file=None, routing_providers="").routing_provider_list == []
    with pytest.raises(ValidationError, match="yandex"):
        Settings(_env_file=None, routing_providers="osrm,yandex")


async def test_every_provider_name_has_a_client() -> None:
    assert set(PROVIDER_FACTORIES) == set(ROUTING_PROVIDER_NAMES)
    settings = Settings(_env_file=None)
    osrm, twogis = PROVIDER_FACTORIES["osrm"](settings), PROVIDER_FACTORIES["2gis"](settings)
    assert (type(osrm), type(twogis)) == (OsrmRoutingClient, TwoGisRoutingClient)
    await osrm.aclose()
    await twogis.aclose()
