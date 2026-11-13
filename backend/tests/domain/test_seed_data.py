"""Consistency of the declarative seed data (no database involved)."""

import json

from app.domain import geometry
from app.domain.enums import PathMode, PathSource
from app.seed import areas, notes, routes
from app.seed.runner import ALL_PLACES, AREA_POLYGONS_FILE, ROUTE_PATHS_FILE
from app.seed.users import USERS

CITY = {"min_lat": 42.93, "max_lat": 43.24, "min_lng": 131.78, "max_lng": 132.02}


def _territories() -> dict[str, geometry.Territory]:
    outlines = json.loads(AREA_POLYGONS_FILE.read_text(encoding="utf-8"))["areas"]
    territories = {key: geometry.parse_territory(entry["geometry"]) for key, entry in outlines.items()}
    for spec in areas.AREAS:
        territories.setdefault(spec.key, geometry.circle_territory(*spec.fallback_circle))
    return territories


def test_place_keys_are_unique_and_inside_the_city() -> None:
    keys = [place.key for place in ALL_PLACES]
    assert len(keys) == len(set(keys))
    assert len(ALL_PLACES) >= 70
    for place in ALL_PLACES:
        assert CITY["min_lat"] <= place.lat <= CITY["max_lat"], place.key
        assert CITY["min_lng"] <= place.lng <= CITY["max_lng"], place.key


def test_seed_authors_and_voters_exist() -> None:
    usernames = {user.username for user in USERS}
    for place in ALL_PLACES:
        voters = f"{place.present} {place.unclear} {place.absent}".split()
        assert place.author in usernames, place.key
        assert set(voters) <= usernames, place.key
        assert place.author not in voters, place.key


def test_notes_on_objects_always_carry_the_object_name() -> None:
    assert len(notes.NOTES) >= 25
    threads = [note.object_id for note in notes.NOTES if note.object_id]
    assert len(threads) > len(set(threads))
    for note in notes.NOTES:
        assert 1 <= len(note.text) <= 500
        if note.object_id is not None:
            assert note.object_name, note.text


def test_area_outlines_are_valid_and_cover_their_fallback_centres() -> None:
    territories = _territories()
    assert len(areas.AREAS) >= 15
    assert {spec.key for spec in areas.AREAS} == set(territories)
    for spec in areas.AREAS:
        territory = territories[spec.key]
        lat, lng, _ = spec.fallback_circle
        assert territory.bbox.min_lat - 0.01 <= lat <= territory.bbox.max_lat + 0.01, spec.key
        assert territory.bbox.min_lng - 0.01 <= lng <= territory.bbox.max_lng + 0.01, spec.key
        assert geometry.contains(territory.geojson, territory.label_lat, territory.label_lng), spec.key


def test_popular_areas_contain_their_seeded_places() -> None:
    territories = _territories()
    candidates = [
        (index, territory.geojson, territory.area_m2) for index, territory in enumerate(territories.values())
    ]
    keys = list(territories)
    inside: dict[str, set[str]] = {key: set() for key in keys}
    for place in ALL_PLACES:
        index = geometry.smallest_containing(candidates, place.lat, place.lng)
        if index is not None:
            inside[keys[index]].add(place.key)
    assert {
        "rest_nagorny",
        "workout_nagorny",
        "playground_nagorny",
        "water_nagorny",
        "viewpoint_nagorny",
    } <= inside["nagorny_park"]
    assert {
        "sportivnaya_nab",
        "toilet_sport_nab",
        "wifi_sport_nab",
        "ferris_wheel",
        "fountain_sport_nab",
    } <= inside["sportivnaya_nab"]
    assert {
        "nab_tsesarevicha",
        "water_tsesarevich",
        "skatepark_tsesarevich",
        "playground_tsesarevich",
    } <= inside["nab_tsesarevicha"]
    assert {"toilet_dvfu", "aed_dvfu", "basketball_dvfu", "dvfu_campus"} <= inside["dvfu_campus"]
    assert {"park_minny", "table_tennis_minny"} <= inside["minny_gorodok"]
    assert "tokarevsky_mayak" in inside["tokarevskaya_koshka"]
    assert sum(1 for places in inside.values() if len(places) >= 4) >= 5


def test_every_roads_route_has_a_stored_path_matching_its_stops() -> None:
    stored = json.loads(ROUTE_PATHS_FILE.read_text(encoding="utf-8"))
    places = {place.key: place for place in ALL_PLACES}
    roads_routes = [route for route in routes.ROUTES if route.path_mode is PathMode.ROADS]
    assert set(stored) == {route.key for route in roads_routes}
    for route in roads_routes:
        entry = stored[route.key]
        points = [
            [
                stop.lng if stop.lng is not None else places[stop.place].lng,
                stop.lat if stop.lat is not None else places[stop.place].lat,
            ]
            for stop in route.stops
        ]
        assert entry["stops"] == points, route.key
        assert len(entry["path"]) > len(points), route.key
        assert len(entry["legs_m"]) == len(points) - 1, route.key
        assert entry["source"] == PathSource.OSM, route.key
