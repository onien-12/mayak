import pytest

from app.domain import geo, routing
from app.domain.enums import RouteKind

VOKZAL = (43.1112, 131.8817)
MAYAK = (43.0731, 131.8431)


def test_haversine_between_known_points() -> None:
    distance = geo.haversine_m(*VOKZAL, *MAYAK)
    assert distance == pytest.approx(5270, rel=0.02)
    assert geo.haversine_m(*VOKZAL, *VOKZAL) == 0


def test_parse_bbox() -> None:
    bbox = geo.parse_bbox("131.80,43.05,131.95,43.15")
    assert (bbox.min_lng, bbox.min_lat, bbox.max_lng, bbox.max_lat) == (131.80, 43.05, 131.95, 43.15)


@pytest.mark.parametrize("raw", ["", "1,2,3", "a,b,c,d", "131.9,43.2,131.8,43.1", "0,0,0,91"])
def test_parse_bbox_rejects_malformed_input(raw: str) -> None:
    with pytest.raises(ValueError):  # noqa: PT011
        geo.parse_bbox(raw)


def test_bbox_around_covers_the_circle() -> None:
    bbox = geo.bbox_around(*VOKZAL, 150)
    assert geo.haversine_m(VOKZAL[0], VOKZAL[1], bbox.max_lat, VOKZAL[1]) == pytest.approx(150, rel=0.01)
    assert geo.haversine_m(VOKZAL[0], VOKZAL[1], VOKZAL[0], bbox.min_lng) == pytest.approx(150, rel=0.01)


def test_parse_linestring() -> None:
    assert routing.parse_linestring("LINESTRING(131.88 43.11, 131.89 43.12)") == [
        (131.88, 43.11),
        (131.89, 43.12),
    ]
    assert routing.parse_linestring("POINT(1 2)") == []
    assert routing.parse_linestring("LINESTRING(131.88 43.11, oops)") == []


def test_merge_segments_drops_repeated_joints() -> None:
    merged = routing.merge_segments([[(1, 1), (2, 2)], [(2, 2), (3, 3)], [(3, 3), (4, 4)]])
    assert merged == [(1, 1), (2, 2), (3, 3), (4, 4)]


def test_parse_twogis_response() -> None:
    payload = {
        "result": [
            {
                "total_distance": 1234,
                "total_duration": 900,
                "maneuvers": [
                    {
                        "outcoming_path": {
                            "geometry": [{"selection": "LINESTRING(131.88 43.11, 131.89 43.12)"}]
                        }
                    },
                    {"comment": "finish"},
                    {
                        "outcoming_path": {
                            "geometry": [{"selection": "LINESTRING(131.89 43.12, 131.90 43.13)"}]
                        }
                    },
                ],
            }
        ]
    }
    routed = routing.parse_twogis_response(payload, [(131.88, 43.11), (131.90, 43.13)])
    assert routed is not None
    assert routed.path == [(131.88, 43.11), (131.89, 43.12), (131.90, 43.13)]
    assert routed.travel_min == 15
    assert routed.legs_m == pytest.approx(routing.straight_legs_m([(131.88, 43.11), (131.90, 43.13)]))


@pytest.mark.parametrize("payload", [{}, {"result": []}, {"result": [{"maneuvers": []}]}, {"status": "FAIL"}])
def test_parse_twogis_response_without_route(payload: dict[str, object]) -> None:
    assert routing.parse_twogis_response(payload, [(131.88, 43.11), (131.90, 43.13)]) is None


def test_travel_minutes_depend_on_kind() -> None:
    assert routing.travel_minutes(4800, RouteKind.WALK) == 60
    assert routing.travel_minutes(4800, RouteKind.CAR) < routing.travel_minutes(4800, RouteKind.BIKE)
    assert routing.travel_minutes(10, RouteKind.CAR) == 1


def test_every_route_kind_has_travel_mode_and_speed() -> None:
    assert set(routing.TRAVEL_BY_KIND) == set(RouteKind) == set(routing.SPEED_KMH)
    assert routing.TRAVEL_BY_KIND[RouteKind.HIKE] is routing.TravelMode.FOOT
    assert routing.total_duration_min(30, [10, 20]) == 60


def test_passes_through_requires_every_point_in_order() -> None:
    path = [(131.880, 43.110), (131.885, 43.112), (131.890, 43.115), (131.895, 43.118)]
    start, middle, finish = path[0], path[2], path[3]
    assert routing.passes_through(path, [start, middle, finish])
    assert routing.passes_through(path, [start, finish])
    assert not routing.passes_through(path, [start, finish, middle])
    assert not routing.passes_through(path[:2], [start, finish])
    assert not routing.passes_through(path, [start, (131.95, 43.20), finish])
