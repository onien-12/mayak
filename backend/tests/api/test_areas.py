"""Areas: polygon territories that group the places inside them (SPEC §17)."""

import math
from datetime import datetime, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import update

from app.domain.enums import ExternalSourceId, UserRole
from app.models import Area, Place
from app.services.geometry_lookup import OSM_ATTRIBUTION, GeometryLookup
from tests.conftest import API, Actor, World

LAT, LNG = 43.118, 131.922
M_LAT = 1 / 111_320
M_LNG = 1 / (111_320 * math.cos(math.radians(LAT)))


def rectangle(width_m: float, height_m: float, north_m: float = 0, east_m: float = 0) -> dict[str, Any]:
    """A rectangle whose south-west corner is offset from (LAT, LNG) by the given metres."""
    south, west = LAT + north_m * M_LAT, LNG + east_m * M_LNG
    north, east = south + height_m * M_LAT, west + width_m * M_LNG
    return {
        "type": "Polygon",
        "coordinates": [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    }


def point(north_m: float, east_m: float) -> dict[str, float]:
    return {"lat": LAT + north_m * M_LAT, "lng": LNG + east_m * M_LNG}


def area_body(title: str = "Нагорный парк", **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "title": title,
        "kind": "park",
        "geometry": rectangle(300, 200),
        "description": "Парк на сопке.",
    }
    body.update(overrides)
    return body


async def create_area(actor: Actor, **overrides: Any) -> dict[str, Any]:
    response = await actor.post("/areas", json=area_body(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


async def test_create_area_permissions_and_shape(world: World, client: AsyncClient) -> None:
    trusted = await world.actor("trusted", reputation=60)
    resident = await world.actor("resident", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)

    assert (await resident.post("/areas", json=area_body())).status_code == 403
    assert (await client.post(f"{API}/areas", json=area_body())).status_code == 401

    area = await create_area(trusted, object_id="70030076150000001")
    assert (area["title"], area["kind"], area["object_id"]) == ("Нагорный парк", "park", "70030076150000001")
    assert area["geometry"]["type"] == "Polygon"
    assert len(area["geometry"]["coordinates"][0]) == 5
    assert abs(area["lat"] - (LAT + 100 * M_LAT)) < 1e-5
    assert abs(area["lng"] - (LNG + 150 * M_LNG)) < 1e-5
    assert 175 <= area["radius_m"] <= 185
    assert (area["places_count"], area["interest"], area["rating_avg"], area["highlights"]) == (
        0,
        0,
        None,
        [],
    )
    assert (area["events_upcoming"], area["issues_open"], area["cover_url"], area["places"]) == (
        0,
        0,
        None,
        [],
    )
    assert (area["author"]["username"], area["can_edit"]) == ("trusted", True)

    public = (await client.get(f"{API}/areas/{area['id']}")).json()
    assert public["can_edit"] is False
    assert (await moderator.get(f"/areas/{area['id']}")).json()["can_edit"] is True
    assert (await client.get(f"{API}/areas/9999")).status_code == 404
    by_moderator = await create_area(
        moderator, title="Сквер у моря", geometry=rectangle(100, 100, north_m=2000)
    )
    assert by_moderator["author"]["role"] == "moderator"


async def test_area_geometry_validation_and_circle_fallback(world: World) -> None:
    trusted = await world.actor("trusted", reputation=60)

    circle = await create_area(trusted, geometry=None, lat=LAT, lng=LNG, radius_m=250)
    assert circle["geometry"]["type"] == "Polygon"
    assert len(circle["geometry"]["coordinates"][0]) == 49
    assert 248 <= circle["radius_m"] <= 252
    assert abs(circle["lat"] - LAT) < 1e-4

    async def rejected(**overrides: Any) -> dict[str, Any]:
        response = await trusted.post("/areas", json=area_body(title="Другая локация", **overrides))
        assert response.status_code == 422, response.text
        return response.json()

    assert "errors" in await rejected(geometry=None)
    assert "errors" in await rejected(geometry=None, lat=LAT, lng=LNG)
    assert "errors" in await rejected(geometry=None, lat=LAT, lng=LNG, radius_m=20)
    unclosed = rectangle(100, 100, north_m=3000)
    unclosed["coordinates"][0].pop()
    assert (await rejected(geometry=unclosed))["errors"][0] == {
        "field": "geometry",
        "message": "Контур территории должен быть замкнут и содержать не меньше трёх вершин.",
    }
    ring = rectangle(200, 200, north_m=3000)["coordinates"][0]
    bow_tie = {"type": "Polygon", "coordinates": [[ring[0], ring[2], ring[1], ring[3], ring[0]]]}
    assert "пересекать" in (await rejected(geometry=bow_tie))["errors"][0]["message"]
    assert "велика" in (await rejected(geometry=rectangle(7000, 5000, north_m=3000)))["errors"][0]["message"]
    assert (await rejected(geometry={"type": "LineString", "coordinates": ring}))["errors"][0][
        "field"
    ] == "geometry"
    assert (await trusted.post("/areas", json=area_body(title="ab"))).status_code == 422


async def test_duplicates_are_rejected_but_nested_areas_are_allowed(world: World) -> None:
    trusted = await world.actor("trusted", reputation=60)
    park = await create_area(trusted, object_id="obj-1")

    same_place = await trusted.post(
        "/areas", json=area_body(title="Нагорный", geometry=rectangle(280, 190, north_m=10, east_m=10))
    )
    assert same_place.status_code == 409
    assert "Нагорный парк" in same_place.json()["detail"]
    same_object = await trusted.post(
        "/areas",
        json=area_body(
            title="Совсем другое место", geometry=rectangle(100, 100, north_m=5000), object_id="obj-1"
        ),
    )
    assert same_object.status_code == 409

    neighbour = await create_area(trusted, title="Соседний сквер", geometry=rectangle(300, 200, east_m=250))
    nested = await create_area(
        trusted, title="Беседка и поляна", geometry=rectangle(60, 60, north_m=50, east_m=50)
    )
    assert {park["id"], neighbour["id"], nested["id"]} == {1, 2, 3}

    moved = await trusted.patch(
        f"/areas/{neighbour['id']}", json={"geometry": rectangle(300, 200, east_m=20)}
    )
    assert moved.status_code == 409
    renamed = await trusted.patch(
        f"/areas/{park['id']}", json={"title": "Нагорный парк культуры", "geometry": rectangle(300, 200)}
    )
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Нагорный парк культуры"


async def test_places_are_attached_automatically_and_can_be_overridden(
    world: World, client: AsyncClient
) -> None:
    trusted = await world.actor("trusted", reputation=60)
    author = await world.actor("author", reputation=20)
    outside_before = await world.create_place(author, **point(20, 250))
    assert outside_before["area"] is None

    park = await create_area(trusted)
    nested = await create_area(
        trusted, title="Детская зона", geometry=rectangle(60, 60, north_m=50, east_m=50)
    )
    other = await create_area(trusted, title="Дальний сквер", geometry=rectangle(100, 100, north_m=3000))

    attached = (await client.get(f"{API}/places/{outside_before['id']}")).json()
    assert attached["area"] == {"id": park["id"], "title": "Нагорный парк"}

    in_park = await world.create_place(author, "viewpoint", **point(150, 200))
    in_nested = await world.create_place(author, **point(70, 70))
    elsewhere = await world.create_place(author, **point(-500, 0))
    assert in_park["area"]["id"] == park["id"]
    assert in_nested["area"] == {"id": nested["id"], "title": "Детская зона"}
    assert elsewhere["area"] is None

    second_author = await world.actor("second", reputation=20)
    explicit = await world.create_place(second_author, area_id=other["id"], **point(160, 210))
    opted_out = await world.create_place(second_author, area_id=None, **point(170, 220))
    assert (explicit["area"]["id"], opted_out["area"]) == (other["id"], None)
    unknown = await author.post("/places", json=await world.place_payload(area_id=9999))
    assert unknown.status_code == 422
    assert unknown.json()["errors"][0]["field"] == "area_id"

    in_area = (await client.get(f"{API}/places", params={"area_id": park["id"]})).json()
    assert {place["id"] for place in in_area} == {outside_before["id"], in_park["id"]}

    moved = await author.patch(f"/places/{elsewhere['id']}", json=point(120, 120))
    assert moved.json()["area"]["id"] == park["id"]
    detached = await author.patch(f"/places/{in_park['id']}", json={"area_id": None})
    assert detached.json()["area"] is None
    still_none = await author.patch(f"/places/{in_park['id']}", json=point(140, 140))
    assert still_none.json()["area"] is None
    repinned = await second_author.patch(f"/places/{opted_out['id']}", json={"area_id": park["id"]})
    assert repinned.json()["area"]["id"] == park["id"]

    grown = await trusted.patch(
        f"/areas/{other['id']}", json={"geometry": rectangle(100, 100, north_m=-550, east_m=-50)}
    )
    assert grown.status_code == 200
    assert (await client.get(f"{API}/places/{explicit['id']}")).json()["area"]["id"] == other["id"]


async def test_area_summary_follows_its_places(world: World, client: AsyncClient) -> None:
    trusted = await world.actor("trusted", reputation=60)
    author = await world.actor("author", reputation=20)
    voters = [await world.actor(f"expert{index}", reputation=200) for index in range(3)]
    park = await create_area(trusted)

    async def summary() -> dict[str, Any]:
        return (await client.get(f"{API}/areas/{park['id']}")).json()

    viewpoint = await world.create_place(author, "viewpoint", **point(100, 100))
    after_first = await summary()
    assert (after_first["places_count"], after_first["interest"]) == (
        1,
        round(100 * (1 - math.exp(-0.4 / 5))),
    )
    assert after_first["highlights"] == [{"category_id": viewpoint["category_id"], "count": 1}]

    await world.vote(voters[0], viewpoint["id"])
    preliminary = (await summary())["interest"]
    for voter in voters[1:]:
        await world.vote(voter, viewpoint["id"])
    verified = await summary()
    assert after_first["interest"] < preliminary < verified["interest"]
    assert verified["interest"] == round(100 * (1 - math.exp(-1.0 / 5)))

    await voters[0].post(f"/places/{viewpoint['id']}/reviews", json={"rating": 5, "text": "Красота"})
    rated = await summary()
    assert (rated["rating_avg"], rated["interest"]) == (5.0, round(100 * (1 - math.exp(-1.5 / 5))))

    photo = (await author.post("/uploads", files={"file": ("a.png", world.png(), "image/png")})).json()
    await author.post(f"/places/{viewpoint['id']}/photos", json={"photo_ids": [photo["id"]]})
    toilet = await world.create_place(author, **point(50, 50))
    organizer = await world.actor("organizer", reputation=20)
    event = await world.create_place(organizer, "culture", event=world.event_window(), **point(60, 60))
    issue = await world.create_place(organizer, "roads", **point(70, 70))
    full = await summary()
    assert (full["places_count"], full["events_upcoming"], full["issues_open"]) == (2, 1, 1)
    assert full["cover_url"] == photo["url"]
    assert [item["count"] for item in full["highlights"]] == [1, 1]
    assert full["interest"] == round(100 * (1 - math.exp(-(1.5 + 0.4 + 0.3 + 0.5) / 5)))
    assert full["places"][0]["id"] == viewpoint["id"]
    assert {place["id"] for place in full["places"]} == {
        viewpoint["id"],
        toilet["id"],
        event["id"],
        issue["id"],
    }

    await author.delete(f"/places/{toilet['id']}")
    await organizer.patch(f"/places/{event['id']}", json={"event": {"is_cancelled": True}})
    reduced = await summary()
    assert (reduced["places_count"], reduced["events_upcoming"]) == (1, 0)
    assert {place["id"] for place in reduced["places"]} == {viewpoint["id"], issue["id"]}


async def test_area_names_the_nearest_residents_event(world: World, client: AsyncClient) -> None:
    trusted = await world.actor("trusted", reputation=60)
    organizer = await world.actor("organizer", reputation=20)
    park = await create_area(trusted)

    async def card() -> dict[str, Any]:
        detail = (await client.get(f"{API}/areas/{park['id']}")).json()
        listed = next(item for item in (await client.get(f"{API}/areas")).json() if item["id"] == park["id"])
        fields = ("community_events_upcoming", "next_community_event")
        assert {key: listed[key] for key in fields} == {key: detail[key] for key in fields}
        return detail

    empty = await card()
    assert (empty["community_events_upcoming"], empty["next_community_event"]) == (0, None)

    later = await world.create_place(organizer, "sport", event=world.event_window(72), **point(40, 40))
    soon = await world.create_place(
        organizer, "sport", title="Забег с собаками", event=world.event_window(24), **point(60, 60)
    )
    # Another author nearby: the "a few points close together" limit stays out of the way.
    other = await world.actor("other", reputation=20)
    imported = await world.create_place(other, "culture", event=world.event_window(12), **point(150, 250))
    cancelled = await world.create_place(other, "culture", event=world.event_window(6), **point(30, 260))
    await other.patch(f"/places/{cancelled['id']}", json={"event": {"is_cancelled": True}})
    async with world.session() as session:
        await session.execute(
            update(Place).where(Place.id == imported["id"]).values(external_source=ExternalSourceId.VL_RU)
        )
        await session.commit()

    found = await card()
    assert found["community_events_upcoming"] == 2
    nearest = found["next_community_event"]
    assert (nearest["id"], nearest["title"]) == (soon["id"], "Забег с собаками")
    assert datetime.fromisoformat(nearest["starts_at"]) == datetime.fromisoformat(soon["event"]["starts_at"])

    # Once it is over, the next one is named.
    world.clock.shift(timedelta(hours=27))
    after = await card()
    assert after["community_events_upcoming"] == 1
    assert after["next_community_event"]["id"] == later["id"]


async def test_small_imported_area_is_background_until_residents_add_something(
    world: World, client: AsyncClient
) -> None:
    trusted = await world.actor("trusted", reputation=60)
    resident = await world.actor("resident", reputation=20)
    square = await create_area(trusted, title="Сквер Тобольский")
    async with world.session() as session:
        await session.execute(
            update(Area).where(Area.id == square["id"]).values(external_source=ExternalSourceId.OSM)
        )
        await session.commit()

    async def bare() -> bool:
        detail = (await client.get(f"{API}/areas/{square['id']}")).json()
        listed = (await client.get(f"{API}/areas")).json()[0]
        assert listed["bare_background"] == detail["bare_background"]
        return detail["bare_background"]

    assert await bare()
    # The card still opens by a direct link; one residents' event inside brings the area back.
    event = await world.create_place(resident, "sport", event=world.event_window(24), **point(50, 50))
    assert not await bare()
    await resident.patch(f"/places/{event['id']}", json={"event": {"is_cancelled": True}})
    assert await bare()
    await world.create_place(resident, **point(80, 120))
    assert not await bare()


async def test_list_areas(world: World, client: AsyncClient) -> None:
    trusted = await world.actor("trusted", reputation=60)
    author = await world.actor("author", reputation=20)
    park = await create_area(trusted, object_id="obj-park")
    quay = await create_area(
        trusted, title="Набережная", kind="embankment", geometry=rectangle(600, 40, north_m=4000)
    )
    await world.create_place(author, "viewpoint", lat=quay["lat"], lng=quay["lng"])

    async def ids(**params: Any) -> list[int]:
        response = await client.get(f"{API}/areas", params=params)
        assert response.status_code == 200, response.text
        return [item["id"] for item in response.json()]

    assert await ids() == [quay["id"], park["id"]]
    assert await ids(kind="park") == [park["id"]]
    assert await ids(kind="park,embankment", limit=1) == [quay["id"]]
    assert await ids(q="НАГОРН") == [park["id"]]
    assert await ids(object_id="obj-park") == [park["id"]]
    around_park = f"{LNG - 0.001},{LAT - 0.001},{LNG + 0.001},{LAT + 0.001}"
    assert await ids(bbox=around_park) == [park["id"]]
    assert await ids(bbox="131.80,43.20,131.90,43.30") == []
    assert (await client.get(f"{API}/areas", params={"kind": "volcano"})).status_code == 422
    cards = (await client.get(f"{API}/areas")).json()
    assert "places" not in cards[0]
    assert cards[0]["geometry"]["type"] == "Polygon"


async def test_update_and_delete_area(world: World, client: AsyncClient) -> None:
    trusted = await world.actor("trusted", reputation=60)
    other = await world.actor("other", reputation=60)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    author = await world.actor("author", reputation=20)
    park = await create_area(trusted)
    place = await world.create_place(author, **point(100, 100))
    path = f"/areas/{park['id']}"

    assert (await other.patch(path, json={"title": "Чужое"})).status_code == 403
    updated = await trusted.patch(path, json={"kind": "square", "description": "Обновлённое описание"})
    assert (updated.json()["kind"], updated.json()["description"]) == ("square", "Обновлённое описание")
    shrunk = await moderator.patch(path, json={"geometry": rectangle(50, 50)})
    assert shrunk.json()["places"] == []
    assert (await client.get(f"{API}/places/{place['id']}")).json()["area"] is None
    restored = await moderator.patch(
        path, json={"lat": LAT + 100 * M_LAT, "lng": LNG + 100 * M_LNG, "radius_m": 150}
    )
    assert [item["id"] for item in restored.json()["places"]] == [place["id"]]

    assert (await trusted.delete(path)).status_code == 403
    assert (await moderator.delete(path)).status_code == 204
    assert (await client.get(f"{API}{path}")).status_code == 404
    assert (await client.get(f"{API}/places/{place['id']}")).json()["area"] is None
    assert (await client.get(f"{API}/areas")).json() == []


class FakePlaces:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.outlines: dict[str, tuple[str, str]] = {
            "park": (
                "Нагорный парк",
                "POLYGON((131.921 43.117, 131.924 43.117, 131.924 43.119, 131.921 43.119, 131.921 43.117))",
            ),
            "islands": (
                "Два острова",
                "MULTIPOLYGON(((131.92 43.11, 131.93 43.11, 131.93 43.12, 131.92 43.11)),"
                "((131.94 43.11, 131.95 43.11, 131.95 43.12, 131.94 43.11)))",
            ),
            "bus-stop": ("Остановка", "POINT(131.92 43.11)"),
        }

    async def object_outline(self, object_id: str) -> tuple[str, str] | None:
        self.calls.append(object_id)
        return self.outlines.get(object_id)


class FakeBoundaries:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def search(self, query: str) -> list[dict[str, Any]]:
        self.calls.append(query)
        return [
            {
                "display_name": "Нагорный парк, Первореченский район, Владивосток",
                "lat": str(LAT + 0.05),
                "lon": str(LNG),
                "geojson": rectangle(150, 100),
            },
            {
                "name": "Нагорный парк",
                "display_name": "Нагорный парк, Владивосток",
                "lat": str(LAT),
                "lon": str(LNG),
                "geojson": rectangle(120, 80),
            },
            {
                "display_name": "Нагорный парк (остановка)",
                "geojson": {"type": "Point", "coordinates": [LNG, LAT]},
            },
            {
                "display_name": "улица Нагорная",
                "geojson": {"type": "LineString", "coordinates": [[LNG, LAT], [LNG + 0.01, LAT]]},
            },
            {"display_name": "без геометрии"},
            "мусор",
        ]


async def test_geometry_lookup_with_faked_sources(world: World, app: Any) -> None:
    places, boundaries = FakePlaces(), FakeBoundaries()
    app.state.geometry_lookup = GeometryLookup(places, boundaries)
    trusted = await world.actor("trusted", reputation=60)
    resident = await world.actor("resident", reputation=20)

    assert (await world.http.get(f"{API}/areas/geometry-lookup", params={"q": "парк"})).status_code == 401
    assert (await resident.get("/areas/geometry-lookup", params={"q": "парк"})).status_code == 403
    assert (await trusted.get("/areas/geometry-lookup")).status_code == 422
    assert (
        await trusted.get("/areas/geometry-lookup", params={"q": "парк", "object_id": "park"})
    ).status_code == 422

    by_object = (await trusted.get("/areas/geometry-lookup", params={"object_id": "park"})).json()
    assert by_object == [
        {
            "title": "Нагорный парк",
            "source": "2gis",
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [131.921, 43.117],
                        [131.924, 43.117],
                        [131.924, 43.119],
                        [131.921, 43.119],
                        [131.921, 43.117],
                    ]
                ],
            },
            "attribution": None,
        }
    ]
    multi = (await trusted.get("/areas/geometry-lookup", params={"object_id": "islands"})).json()
    assert multi[0]["geometry"]["type"] == "MultiPolygon"
    assert (await trusted.get("/areas/geometry-lookup", params={"object_id": "bus-stop"})).json() == []
    assert (await trusted.get("/areas/geometry-lookup", params={"object_id": "unknown"})).json() == []
    await trusted.get("/areas/geometry-lookup", params={"object_id": "park"})
    assert places.calls == ["park", "islands", "bus-stop", "unknown"]

    params = {"q": "Нагорный парк", "lat": LAT, "lng": LNG}
    by_name = (await trusted.get("/areas/geometry-lookup", params=params)).json()
    assert [(item["title"], item["source"], item["attribution"]) for item in by_name] == [
        ("Нагорный парк", "osm", OSM_ATTRIBUTION),
        ("Нагорный парк", "osm", OSM_ATTRIBUTION),
    ]
    nearest_south_lat = by_name[0]["geometry"]["coordinates"][0][0][1]
    assert nearest_south_lat < LAT + 0.01, "the candidate closest to lat/lng comes first"
    await trusted.get("/areas/geometry-lookup", params=params)
    assert boundaries.calls == ["Нагорный парк"], "the answer is cached"

    created = await trusted.post("/areas", json=area_body(geometry=by_name[0]["geometry"]))
    assert created.status_code == 201
    assert created.json()["geometry"] == by_name[0]["geometry"]
