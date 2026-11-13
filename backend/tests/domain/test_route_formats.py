"""GPX export and the per-leg distances of a planned path."""

from xml.etree import ElementTree as ET

import pytest

from app.domain import gpx, routing
from app.domain.gpx import GpxWaypoint

NS = {"g": gpx.GPX_NAMESPACE}
A, B, C, D = (131.880, 43.110), (131.885, 43.110), (131.885, 43.115), (131.890, 43.115)


def test_gpx_has_waypoints_and_one_track() -> None:
    document = gpx.build_gpx(
        "Тропа на мыс",
        "Описание & детали",
        [
            GpxWaypoint("Старт", "Парковка <у музея>", 42.9815, 131.8904),
            GpxWaypoint("Мыс", "", 42.9449, 131.8707),
        ],
        [(131.8904, 42.9815), (131.88, 42.96), (131.8707, 42.9449)],
    )
    assert document.startswith('<?xml version="1.0" encoding="UTF-8"?>')
    root = ET.fromstring(document)
    assert (root.tag, root.get("version")) == (f"{{{gpx.GPX_NAMESPACE}}}gpx", "1.1")
    assert root.find("g:metadata/g:desc", NS).text == "Описание & детали"
    waypoints = root.findall("g:wpt", NS)
    assert [(point.get("lat"), point.get("lon")) for point in waypoints] == [
        ("42.981500", "131.890400"),
        ("42.944900", "131.870700"),
    ]
    assert waypoints[0].find("g:desc", NS).text == "Парковка <у музея>"
    assert waypoints[1].find("g:desc", NS) is None
    track_points = root.findall("g:trk/g:trkseg/g:trkpt", NS)
    assert len(track_points) == 3
    assert track_points[1].get("lon") == "131.880000"


def test_request_chunks_share_joint_points() -> None:
    points = [(131.0 + index / 1000, 43.0) for index in range(25)]
    chunks = routing.request_chunks(points, 10)
    assert [len(chunk) for chunk in chunks] == [10, 10, 7]
    assert chunks[0][-1] == chunks[1][0]
    assert chunks[1][-1] == chunks[2][0]
    assert routing.request_chunks(points[:10], 10) == [points[:10]]
    assert [len(chunk) for chunk in routing.request_chunks(points[:11], 10)] == [10, 2]
    assert routing.request_chunks(points[:2], 10) == [points[:2]]
    assert routing.request_chunks(points, 25) == [points]


def test_stitch_joins_chunks_legs_and_durations() -> None:
    first = routing.RoutedPath([A, B, C], [700.0, 550.0], 900)
    second = routing.RoutedPath([C, D], [400.0], 300)
    stitched = routing.stitch([first, second])
    assert stitched.path == [A, B, C, D]
    assert (stitched.legs_m, stitched.duration_s, stitched.travel_min) == ([700.0, 550.0, 400.0], 1200, 20)


def test_path_legs_follow_the_path_not_the_chord() -> None:
    path = [A, B, C, D]
    legs = routing.path_legs_m(path, [A, C, D])
    straight = routing.straight_legs_m([A, C, D])
    assert legs[0] == pytest.approx(sum(routing.straight_legs_m([A, B, C])))
    assert legs[0] > straight[0]
    assert legs[1] == pytest.approx(straight[1])
    assert sum(legs) == pytest.approx(sum(routing.straight_legs_m(path)))


def test_path_legs_on_an_out_and_back_path_keep_the_order() -> None:
    path = [A, B, C, B, A]
    legs = routing.path_legs_m(path, [A, C, A])
    assert legs[0] == pytest.approx(legs[1])
    assert legs[0] > 0


def test_stop_distances_skip_via_points_for_visible_stops() -> None:
    distances = routing.stop_distances([100, 200, 300, 400], [False, True, False, True, False])
    assert distances == [None, 100, 300, 300, 700]
    assert routing.stop_distances([50], [False, False]) == [None, 50]
