"""OSM mapping table, normaliser, Overpass parsing and query generation (pure)."""

from typing import Any

import pytest

from app.domain.enums import AreaKind
from app.domain.geo import BBox
from app.services.osm import client, elements, mapping, normaliser
from app.services.osm.elements import OsmElement
from app.services.osm.normaliser import AreaDraft, PlaceDraft

LAT, LNG = 43.1155, 131.8855
M_LAT, M_LNG = 1 / 111_320, 1 / 81_200


def element(tags: dict[str, str], osm_type: str = "node", osm_id: int = 1, **extra: Any) -> OsmElement:
    return OsmElement(osm_type, osm_id, tags, LAT, LNG, **extra)


def square(side_m: float) -> list[dict[str, float]]:
    """A closed way geometry of a square with the south-west corner at (LAT, LNG)."""
    north, east = LAT + side_m * M_LAT, LNG + side_m * M_LNG
    corners = [(LAT, LNG), (LAT, east), (north, east), (north, LNG), (LAT, LNG)]
    return [{"lat": lat, "lon": lng} for lat, lng in corners]


@pytest.mark.parametrize(
    ("tags", "category", "title"),
    [
        ({"amenity": "toilets"}, "toilet", "Общественный туалет"),
        ({"amenity": "fountain", "drinking_water": "yes"}, "drinking_water", "Питьевой фонтанчик"),
        ({"amenity": "fountain"}, "architecture", "Фонтан"),
        ({"leisure": "pitch", "sport": "basketball"}, "basketball", "Баскетбольная площадка"),
        ({"leisure": "pitch", "sport": "volleyball;soccer"}, "football", "Футбольное поле"),
        ({"leisure": "pitch", "sport": "tennis"}, "sports_ground", "Спортивная площадка"),
        ({"leisure": "playground"}, "playground", "Детская площадка"),
        ({"tourism": "viewpoint", "name": "Видовая на Орлинке"}, "viewpoint", "Видовая на Орлинке"),
        (
            {"historic": "memorial", "name": "Памятник", "name:ru": "Памятник морякам"},
            "historic",
            "Памятник морякам",
        ),
    ],
)
def test_mapping_table_gives_category_and_russian_title(
    tags: dict[str, str], category: str, title: str
) -> None:
    draft = normaliser.normalise(element(tags))
    assert isinstance(draft, PlaceDraft)
    assert (draft.category, draft.title) == (category, title)


@pytest.mark.parametrize(
    "tags",
    [
        {"amenity": "bench"},
        {"historic": "memorial"},
        {"tourism": "attraction"},
        {"tourism": "artwork", "name": "AB"},
        {"amenity": "shelter", "shelter_type": "public_transport"},
        {"leisure": "playground", "access": "private"},
        {"natural": "beach"},
    ],
)
def test_benches_closed_and_unnamed_generic_objects_are_skipped(tags: dict[str, str]) -> None:
    assert normaliser.normalise(element(tags)) is None


def test_tags_become_category_attributes() -> None:
    draft = normaliser.to_place(
        element(
            {
                "amenity": "toilets",
                "fee": "no",
                "wheelchair": "yes",
                "opening_hours": "24/7",
                "changing_table": "no",
                "addr:street": "Светланская улица",
                "addr:housenumber": "1",
                "description": "Во дворе,\x00 вход с торца",
            }
        )
    )
    assert draft is not None
    assert draft.attributes == {
        "free": True,
        "accessible": True,
        "hours": "круглосуточно",
        "changing_table": False,
    }
    assert draft.address == "Светланская улица, 1"
    assert draft.description == "Во дворе, вход с торца"
    assert draft.external_id == "osm:node/1"
    assert draft.url == "https://www.openstreetmap.org/node/1"
    pitch = normaliser.to_place(
        element(
            {"leisure": "pitch", "sport": "tennis", "lit": "yes", "surface": "artificial_turf", "fee": "yes"}
        )
    )
    assert pitch is not None
    assert pitch.attributes == {"free": False, "lighting": True, "surface": "turf", "sport": "tennis"}
    shelter = normaliser.to_place(element({"amenity": "shelter", "opening_hours": "Mo-Fr 09:00-18:00"}))
    assert shelter is not None
    assert shelter.attributes == {"shelter": True, "hours": "Mo-Fr 09:00-18:00"}


def test_large_named_polygons_become_areas_small_ones_stay_places() -> None:
    raw = {
        "elements": [
            {
                "type": "way",
                "id": 10,
                "tags": {"leisure": "park", "name": "Сквер Тестовый", "wikidata": "Q1", "ignored": "x"},
                "geometry": square(80),
            },
            {
                "type": "way",
                "id": 11,
                "tags": {"natural": "beach", "name": "Маленький пляж"},
                "bounds": {"minlat": LAT, "minlon": LNG, "maxlat": LAT + 0.0002, "maxlon": LNG + 0.0002},
                "geometry": square(20),
            },
            {"type": "node", "id": 12, "lat": LAT, "lon": LNG, "tags": {"amenity": "toilets"}},
            {"type": "node", "id": 12, "lat": LAT, "lon": LNG, "tags": {"amenity": "toilets"}},
            {"type": "node", "id": "bad", "lat": LAT, "lon": LNG},
            {"type": "node", "id": 13, "lat": "43", "lon": LNG},
            "мусор",
        ]
    }
    parsed = elements.parse_overpass(raw)
    assert [item.key for item in parsed] == ["node/12", "way/10", "way/11"]
    park, beach = parsed[1], parsed[2]
    assert park.tags == {"leisure": "park", "name": "Сквер Тестовый", "wikidata": "Q1"}
    assert park.outline is not None
    assert beach.outline is None, "20 × 20 m is below the 3 000 m² of a territory"
    area = normaliser.normalise(park)
    assert isinstance(area, AreaDraft)
    assert (area.kind, area.title, area.external_id) == (AreaKind.PARK, "Сквер Тестовый", "osm:way/10")
    small = normaliser.normalise(beach)
    assert isinstance(small, PlaceDraft)
    assert small.category == "nature"
    assert LAT < small.lat < LAT + 20 * M_LAT, "a point inside the small polygon"
    assert LNG < small.lng < LNG + 20 * M_LNG
    assert elements.from_rows([elements.to_row(item) for item in parsed]) == parsed


def test_multipolygon_relation_is_assembled_with_holes() -> None:
    outer = square(200)
    half = len(outer) // 2
    hole_side = 50 * M_LAT
    hole = [
        {"lat": LAT + hole_side, "lon": LNG + 50 * M_LNG},
        {"lat": LAT + hole_side, "lon": LNG + 100 * M_LNG},
        {"lat": LAT + 2 * hole_side, "lon": LNG + 100 * M_LNG},
        {"lat": LAT + hole_side, "lon": LNG + 50 * M_LNG},
    ]
    relation = {
        "type": "relation",
        "id": 7,
        "tags": {"place": "island", "name": "Остров Тестовый"},
        "bounds": {"minlat": LAT, "minlon": LNG, "maxlat": LAT + 0.002, "maxlon": LNG + 0.002},
        "members": [
            {"type": "way", "role": "outer", "geometry": outer[: half + 1]},
            {"type": "way", "role": "outer", "geometry": outer[half:]},
            {"type": "way", "role": "inner", "geometry": hole},
        ],
    }
    [island] = elements.parse_overpass({"elements": [relation]})
    assert island.outline is not None
    assert island.outline["type"] == "Polygon"
    assert len(island.outline["coordinates"]) == 2, "outer ring and the hole"
    draft = normaliser.normalise(island)
    assert isinstance(draft, AreaDraft)
    assert draft.kind is AreaKind.ISLAND


def test_overpass_query_is_generated_from_the_table() -> None:
    query = client.build_query(BBox(min_lng=131.8, min_lat=42.95, max_lng=132.05, max_lat=43.25))
    assert query.startswith("[out:json][timeout:180][bbox:42.95,131.8,43.25,132.05];")
    assert 'nwr[leisure~"^(fitness_station|pitch|playground)$"];' in query
    assert "nwr[historic][name];" in query
    assert 'nwr[tourism~"^(artwork|attraction)$"][name];' in query
    assert 'wr[leisure~"^(garden|park)$"][name];' in query
    assert query.endswith(".objects out tags center qt;\n.territories out geom qt;")
    assert {"name", "fee", "wikidata", "sport", "shelter_type"} <= mapping.used_tags()
