"""Territory geometry and the interest of an area."""

import math

import pytest

from app.domain import areas, geo, geometry
from app.domain.areas import CountedPlace
from app.domain.enums import PlaceStatus
from app.domain.geometry import InvalidGeometryError

LAT, LNG = 43.118, 131.922
M_LAT = 1 / 111_320
M_LNG = 1 / (111_320 * math.cos(math.radians(LAT)))


def rectangle(width_m: float, height_m: float, lat: float = LAT, lng: float = LNG) -> dict[str, object]:
    """A rectangle whose south-west corner is at (lat, lng)."""
    east, north = lng + width_m * M_LNG, lat + height_m * M_LAT
    ring = [[lng, lat], [east, lat], [east, north], [lng, north], [lng, lat]]
    return {"type": "Polygon", "coordinates": [ring]}


def horseshoe() -> dict[str, object]:
    """A U-shaped embankment: its centroid lies in the water between the two arms."""
    points_m = [(0, 0), (400, 0), (400, 300), (340, 300), (340, 60), (60, 60), (60, 300), (0, 300), (0, 0)]
    ring = [[LNG + x * M_LNG, LAT + y * M_LAT] for x, y in points_m]
    return {"type": "Polygon", "coordinates": [ring]}


def test_valid_polygon_is_measured() -> None:
    territory = geometry.parse_territory(rectangle(200, 100))
    assert territory.area_m2 == pytest.approx(20_000, rel=0.01)
    assert territory.geojson["type"] == "Polygon"
    assert territory.geojson["coordinates"][0][0] == territory.geojson["coordinates"][0][-1]
    assert geometry.contains(territory.geojson, territory.label_lat, territory.label_lng)
    assert territory.radius_m == pytest.approx(math.hypot(100, 50), abs=3)
    assert (territory.bbox.min_lat, territory.bbox.min_lng) == (pytest.approx(LAT), pytest.approx(LNG))


def test_label_point_is_inside_a_concave_shape_whose_centroid_is_outside() -> None:
    shape = horseshoe()
    centroid_lat, centroid_lng = LAT + 150 * M_LAT, LNG + 200 * M_LNG
    assert not geometry.contains(shape, centroid_lat, centroid_lng)
    territory = geometry.parse_territory(shape)
    assert geometry.contains(territory.geojson, territory.label_lat, territory.label_lng)
    assert geometry.contains(shape, LAT + 200 * M_LAT, LNG + 30 * M_LNG)
    assert not geometry.contains(shape, LAT + 200 * M_LAT, LNG + 200 * M_LNG)


@pytest.mark.parametrize(
    ("geojson", "fragment"),
    [
        (None, "полигоном"),
        ({"type": "Point", "coordinates": [LNG, LAT]}, "полигоном"),
        ({"type": "Polygon", "coordinates": "oops"}, "формат"),
        (
            {"type": "Polygon", "coordinates": [[[LNG, LAT], [LNG + 0.001, LAT], [LNG, LAT + 0.001]]]},
            "замкнут",
        ),
        ({"type": "Polygon", "coordinates": [[[LNG, LAT], [LNG + 0.001, LAT], [LNG, LAT]]]}, "замкнут"),
        (
            {
                "type": "Polygon",
                "coordinates": [[[LNG, 95.0], [LNG + 0.001, 95.0], [LNG, 95.001], [LNG, 95.0]]],
            },
            "диапазона",
        ),
        (rectangle(1, 1), "мала"),
        (rectangle(7000, 5000), "велика"),
    ],
)
def test_invalid_geometry_is_rejected(geojson: object, fragment: str) -> None:
    with pytest.raises(InvalidGeometryError, match=fragment):
        geometry.parse_territory(geojson)


def test_self_intersecting_outline_is_rejected() -> None:
    bow_tie = [[LNG, LAT], [LNG + 0.002, LAT + 0.002], [LNG + 0.002, LAT], [LNG, LAT + 0.002], [LNG, LAT]]
    with pytest.raises(InvalidGeometryError, match="пересекать"):
        geometry.parse_territory({"type": "Polygon", "coordinates": [bow_tie]})


def test_too_many_vertices_are_rejected_and_big_outlines_are_simplified() -> None:
    def circle(points: int) -> dict[str, object]:
        ring = [
            [
                LNG + 300 * M_LNG * math.cos(2 * math.pi * step / points),
                LAT + 300 * M_LAT * math.sin(2 * math.pi * step / points),
            ]
            for step in range(points)
        ]
        return {"type": "Polygon", "coordinates": [[*ring, ring[0]]]}

    with pytest.raises(InvalidGeometryError, match="вершин"):
        geometry.parse_territory(circle(geometry.MAX_INPUT_VERTICES + 1))
    detailed = geometry.parse_territory(circle(450))
    assert len(detailed.geojson["coordinates"][0]) <= geometry.MAX_TRANSFER_VERTICES
    assert detailed.area_m2 == pytest.approx(math.pi * 300**2, rel=0.02)


def test_circle_fallback_becomes_a_polygon() -> None:
    territory = geometry.circle_territory(LAT, LNG, 250)
    assert territory.geojson["type"] == "Polygon"
    assert len(territory.geojson["coordinates"][0]) == geometry.CIRCLE_SEGMENTS + 1
    assert territory.area_m2 == pytest.approx(math.pi * 250**2, rel=0.01)
    assert territory.radius_m == pytest.approx(250, abs=3)
    assert geometry.contains(territory.geojson, LAT + 200 * M_LAT, LNG)
    assert not geometry.contains(territory.geojson, LAT + 260 * M_LAT, LNG)
    assert geo.haversine_m(LAT, LNG, territory.label_lat, territory.label_lng) < 5


def test_multipolygon_territory() -> None:
    first = rectangle(100, 100)["coordinates"]
    second = rectangle(100, 100, lat=LAT + 0.005)["coordinates"]
    territory = geometry.parse_territory({"type": "MultiPolygon", "coordinates": [first, second]})
    assert territory.geojson["type"] == "MultiPolygon"
    assert territory.area_m2 == pytest.approx(20_000, rel=0.01)
    assert geometry.contains(territory.geojson, LAT + 0.005 + 50 * M_LAT, LNG + 50 * M_LNG)
    assert not geometry.contains(territory.geojson, LAT + 0.003, LNG + 50 * M_LNG)


def test_buffered_line_makes_an_elongated_territory() -> None:
    line = [(LNG, LAT), (LNG + 400 * M_LNG, LAT), (LNG + 400 * M_LNG, LAT + 300 * M_LAT)]
    embankment = geometry.buffered_line(line, 40)
    territory = geometry.parse_territory(embankment)
    assert territory.area_m2 == pytest.approx(700 * 80 + math.pi * 40**2, rel=0.08)
    assert geometry.contains(embankment, LAT + 30 * M_LAT, LNG + 200 * M_LNG)
    assert not geometry.contains(embankment, LAT + 150 * M_LAT, LNG + 200 * M_LNG)


def test_wkt_parsing() -> None:
    polygon = geometry.parse_wkt(
        "POLYGON((131.92 43.11, 131.93 43.11, 131.93 43.12, 131.92 43.12, 131.92 43.11))"
    )
    assert polygon == {
        "type": "Polygon",
        "coordinates": [
            [[131.92, 43.11], [131.93, 43.11], [131.93, 43.12], [131.92, 43.12], [131.92, 43.11]]
        ],
    }
    with_hole = geometry.parse_wkt(
        "POLYGON((131.92 43.11, 131.93 43.11, 131.93 43.12, 131.92 43.12, 131.92 43.11),"
        "(131.924 43.114, 131.926 43.114, 131.926 43.116, 131.924 43.116, 131.924 43.114))"
    )
    assert with_hole is not None
    assert len(with_hole["coordinates"]) == 2
    assert not geometry.contains(with_hole, 43.115, 131.925)
    assert geometry.contains(with_hole, 43.112, 131.922)
    multi = geometry.parse_wkt(
        "MULTIPOLYGON(((131.92 43.11, 131.93 43.11, 131.93 43.12, 131.92 43.11)),"
        "((131.94 43.11, 131.95 43.11, 131.95 43.12, 131.94 43.11)))"
    )
    assert multi is not None
    assert (multi["type"], len(multi["coordinates"])) == ("MultiPolygon", 2)


@pytest.mark.parametrize(
    "wkt", [None, 42, "", "POINT(131.9 43.1)", "LINESTRING(131.9 43.1, 131.91 43.11)", "POLYGON((oops))"]
)
def test_wkt_without_a_polygon(wkt: object) -> None:
    assert geometry.parse_wkt(wkt) is None


def test_external_geojson_is_kept_only_when_polygonal() -> None:
    assert geometry.polygonal_geojson(rectangle(100, 100)) is not None
    assert (
        geometry.polygonal_geojson({"type": "LineString", "coordinates": [[LNG, LAT], [LNG + 0.01, LAT]]})
        is None
    )
    assert geometry.polygonal_geojson({"type": "Polygon", "coordinates": "broken"}) is None
    assert geometry.polygonal_geojson(None) is None


def test_overlap_share_of_the_smaller_territory() -> None:
    big, small = rectangle(400, 400), rectangle(100, 100, lat=LAT + 100 * M_LAT, lng=LNG + 100 * M_LNG)
    assert geometry.overlap_share(big, small) == pytest.approx(1.0, abs=0.01)
    shifted = rectangle(400, 400, lng=LNG + 300 * M_LNG)
    assert geometry.overlap_share(big, shifted) == pytest.approx(0.25, abs=0.01)
    assert geometry.overlap_share(big, rectangle(100, 100, lat=LAT + 0.02)) == 0.0


def test_membership_prefers_the_smallest_containing_territory() -> None:
    district = geometry.parse_territory(rectangle(1000, 1000))
    square = geometry.parse_territory(rectangle(100, 100, lat=LAT + 300 * M_LAT, lng=LNG + 300 * M_LNG))
    candidates = [(1, district.geojson, district.area_m2), (2, square.geojson, square.area_m2)]
    inside_both = (LAT + 350 * M_LAT, LNG + 350 * M_LNG)
    assert geometry.smallest_containing(candidates, *inside_both) == 2
    assert geometry.smallest_containing(candidates, LAT + 800 * M_LAT, LNG + 800 * M_LNG) == 1
    assert geometry.smallest_containing(candidates, LAT - 0.001, LNG) is None
    assert geometry.smallest_containing([], LAT, LNG) is None


def test_duplicate_rule_allows_nested_locations() -> None:
    assert areas.is_duplicate(0.9, 10_000, 12_000)
    assert areas.is_duplicate(0.51, 10_000, 10_000)
    assert not areas.is_duplicate(0.5, 10_000, 10_000)
    assert not areas.is_duplicate(0.2, 10_000, 12_000)
    assert not areas.is_duplicate(1.0, 10_000, 1_000_000)


def _place(status: PlaceStatus, rating: float | None = None, category: int = 1) -> CountedPlace:
    return CountedPlace(category, status, rating)


def test_place_weight() -> None:
    assert areas.place_weight(PlaceStatus.VERIFIED, None) == 1.0
    assert areas.place_weight(PlaceStatus.PRELIMINARY, None) == 0.7
    assert areas.place_weight(PlaceStatus.UNVERIFIED, None) == 0.4
    assert areas.place_weight(PlaceStatus.NEEDS_REVIEW, None) == 0.2
    assert areas.place_weight(PlaceStatus.VERIFIED, 5.0) == 1.5
    assert areas.place_weight(PlaceStatus.VERIFIED, 1.0) == 0.5
    assert areas.place_weight(PlaceStatus.HIDDEN, 5.0) == 0.0


def test_interest_formula() -> None:
    assert areas.interest([], 0) == 0
    one = areas.interest([_place(PlaceStatus.VERIFIED)], 0)
    assert one == round(100 * (1 - math.exp(-1 / 5)))
    places = [
        _place(PlaceStatus.VERIFIED, 5.0, 1),
        _place(PlaceStatus.VERIFIED, None, 2),
        _place(PlaceStatus.PRELIMINARY, 4.0, 2),
    ]
    total = 1.5 + 1.0 + 0.7 * 1.25 + 0.3 * 1 + 0.5 * 2
    assert areas.interest(places, 2) == round(100 * (1 - math.exp(-total / 5)))
    assert areas.interest([], 3) == round(100 * (1 - math.exp(-1.5 / 5)))
    growing = [
        areas.interest([_place(PlaceStatus.VERIFIED, None, index) for index in range(count)], 0)
        for count in range(1, 30)
    ]
    assert growing == sorted(growing)
    assert growing[-1] <= 100


@pytest.mark.parametrize(
    ("value", "label"),
    [
        (0, "Пока мало отмечено"),
        (24, "Пока мало отмечено"),
        (25, "Есть что посмотреть"),
        (49, "Есть что посмотреть"),
        (50, "Интересное место"),
        (74, "Интересное место"),
        (75, "Очень интересно"),
        (100, "Очень интересно"),
    ],
)
def test_interest_labels(value: int, label: str) -> None:
    assert areas.interest_label(value) == label


def test_highlights_and_mean_rating() -> None:
    places = [
        _place(PlaceStatus.VERIFIED, 5.0, 7),
        _place(PlaceStatus.VERIFIED, 4.0, 7),
        _place(PlaceStatus.UNVERIFIED, None, 3),
    ]
    assert areas.highlights(places) == [{"category_id": 7, "count": 2}, {"category_id": 3, "count": 1}]
    assert areas.mean_rating(places) == 4.5
    assert areas.mean_rating([_place(PlaceStatus.VERIFIED)]) is None
    many = [_place(PlaceStatus.VERIFIED, None, category) for category in range(9)]
    assert len(areas.highlights(many)) == areas.MAX_HIGHLIGHTS


def test_territory_index_finds_the_smallest_containing_territory() -> None:
    district, square = rectangle(1000, 1000), rectangle(100, 100, LAT + 200 * M_LAT, LNG + 200 * M_LNG)
    index = geometry.TerritoryIndex(
        [(1, district, geometry.area_m2(district)), (2, square, geometry.area_m2(square))]
    )
    assert index.smallest_containing(LAT + 250 * M_LAT, LNG + 250 * M_LNG) == 2
    assert index.smallest_containing(LAT + 600 * M_LAT, LNG + 600 * M_LNG) == 1
    assert index.smallest_containing(LAT - 0.01, LNG) is None
    assert geometry.TerritoryIndex([]).smallest_containing(LAT, LNG) is None


def test_outline_is_assembled_from_way_pieces() -> None:
    corners = [(LNG, LAT), (LNG + 0.01, LAT), (LNG + 0.01, LAT + 0.01), (LNG, LAT + 0.01), (LNG, LAT)]
    outline = geometry.outline_from_rings([corners[:3], corners[2:]], [])
    assert outline is not None
    assert outline["type"] == "Polygon"
    lat, lng = geometry.label_point(outline)
    assert geometry.contains(outline, lat, lng)
    assert geometry.outline_from_rings([corners[:3]], []) is None, "an open line is no territory"
    assert geometry.outline_from_rings([[]], []) is None
