from collections.abc import Sequence
from itertools import pairwise
from typing import Any
from xml.etree import ElementTree as ET

import pytest
from httpx import AsyncClient

from app import routes_recompute
from app.domain import routing
from app.domain.enums import PathSource, UserRole
from app.domain.geo import LngLat
from app.domain.routing import RoutedPath, TravelMode
from app.services import routes
from app.services.route_planner import RoutePlanner
from tests.conftest import API, CENTER, Actor, FakeRoutingClient, World

POINTS = [{"lat": 43.1112, "lng": 131.8817}, {"lat": 43.1193, "lng": 131.8772}]
GPX_NS = {"gpx": "http://www.topografix.com/GPX/1/1"}


async def _places(world: World, author: Actor, count: int = 3) -> list[dict[str, Any]]:
    return [await world.create_place(author, "viewpoint") for _ in range(count)]


def _linked_stops(places: list[dict[str, Any]], stay_min: int = 10) -> list[dict[str, Any]]:
    return [
        {"place_id": place["id"], "note": f"Остановка {index}", "stay_min": stay_min}
        for index, place in enumerate(places, 1)
    ]


def _route_body(stops: list[dict[str, Any]], **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "title": "Прогулка по сопкам",
        "description": "Три видовые за вечер.",
        "kind": "walk",
        "stops": stops,
    }
    body.update(overrides)
    return body


def _custom_stop(index: int, **overrides: Any) -> dict[str, Any]:
    stop = {
        "title": f"Точка {index}",
        "lat": CENTER["lat"] + index * 0.002,
        "lng": CENTER["lng"] + index * 0.001,
    }
    stop.update(overrides)
    return stop


async def test_preview_uses_routing_and_caches(world: World, routing_client: FakeRoutingClient) -> None:
    user = await world.actor("user")
    body = {"kind": "walk", "points": POINTS}

    response = await user.post("/routes/preview", json=body)
    assert response.status_code == 200, response.text
    preview = response.json()
    assert (preview["source"], preview["travel_min"]) == ("osm", 20)
    assert preview["path"] == [[131.8817, 43.1112], [131.8772, 43.1193]]
    assert preview["distance_m"] == sum(preview["legs_m"])
    assert len(preview["legs_m"]) == 1
    assert routing_client.calls == [("foot", ((131.8817, 43.1112), (131.8772, 43.1193)))]

    await user.post("/routes/preview", json=body)
    await user.post("/routes/preview", json={**body, "kind": "excursion"})
    assert len(routing_client.calls) == 1

    await user.post("/routes/preview", json={**body, "kind": "car"})
    assert routing_client.calls[-1][0] == "car"
    await user.post("/routes/preview", json={**body, "kind": "bike"})
    assert routing_client.calls[-1][0] == "bike"


async def test_preview_direct_mode_and_fallback(world: World, routing_client: FakeRoutingClient) -> None:
    user = await world.actor("user")
    body = {"kind": "walk", "points": POINTS}

    direct = (await user.post("/routes/preview", json={**body, "path_mode": "direct"})).json()
    assert direct["source"] == "straight"
    assert routing_client.calls == []
    assert 950 < direct["distance_m"] < 1050
    assert direct["travel_min"] == 12

    routing_client.available = False
    fallback = (await user.post("/routes/preview", json=body)).json()
    assert (fallback["source"], fallback["path"]) == ("straight", direct["path"])
    routing_client.available = True
    assert (await user.post("/routes/preview", json=body)).json()["source"] == "osm"

    assert (
        await user.post("/routes/preview", json={"kind": "walk", "points": POINTS[:1]})
    ).status_code == 422
    too_many = [{"lat": 43.1 + index * 0.001, "lng": 131.88} for index in range(41)]
    assert (await user.post("/routes/preview", json={"kind": "walk", "points": too_many})).status_code == 422
    assert (await world.http.post(f"{API}/routes/preview", json=body)).status_code == 401


async def test_long_routes_are_requested_in_chunks_and_stitched(
    world: World, routing_client: FakeRoutingClient
) -> None:
    user = await world.actor("user")
    points = [{"lat": 43.10 + index * 0.001, "lng": 131.88} for index in range(40)]

    preview = (await user.post("/routes/preview", json={"kind": "hike", "points": points})).json()
    assert [len(call[1]) for call in routing_client.calls] == [25, 16]
    assert routing_client.calls[1][1][0] == routing_client.calls[0][1][-1]
    assert (preview["source"], len(preview["legs_m"]), len(preview["path"])) == ("osm", 39, 40)
    assert preview["travel_min"] == 40

    routing_client.calls.clear()
    routing_client.available = False
    shifted = [{"lat": point["lat"], "lng": 131.89} for point in points]
    degraded = (await user.post("/routes/preview", json={"kind": "hike", "points": shifted})).json()
    assert len(routing_client.calls) == 1
    assert (degraded["source"], len(degraded["legs_m"])) == ("straight", 39)


async def test_providers_are_tried_in_order(world: World, routing_client: FakeRoutingClient) -> None:
    backup = FakeRoutingClient(PathSource.TWOGIS, max_points=10)
    world.app.state.route_planner = RoutePlanner([routing_client, backup])
    user = await world.actor("user")
    body = {"kind": "walk", "points": POINTS}

    assert (await user.post("/routes/preview", json=body)).json()["source"] == "osm"
    assert (len(routing_client.calls), len(backup.calls)) == (1, 0)

    routing_client.available = False
    preview = (await user.post("/routes/preview", json={**body, "kind": "bike"})).json()
    assert preview["source"] == "2gis"
    assert (len(routing_client.calls), len(backup.calls)) == (2, 1)

    backup.available = False
    assert (await user.post("/routes/preview", json={**body, "kind": "car"})).json()["source"] == "straight"
    assert (len(routing_client.calls), len(backup.calls)) == (3, 2)


async def test_create_route_from_places(
    world: World, client: AsyncClient, routing_client: FakeRoutingClient
) -> None:
    author = await world.actor("author", reputation=20)
    places = await _places(world, author)

    response = await author.post("/routes", json=_route_body(_linked_stops(places), tags=["Закат", "закат"]))
    assert response.status_code == 201, response.text
    route = response.json()
    assert (route["status"], route["visibility"], route["path_mode"]) == ("published", "public", "roads")
    assert route["path_source"] == "osm"
    assert (route["difficulty"], route["tips"], route["tags"]) == (None, None, ["закат"])
    assert route["distance_m"] == sum(stop["distance_from_prev_m"] or 0 for stop in route["stops"])
    assert (route["travel_min"], route["duration_min"], route["stops_count"]) == (20, 20 + 30, 3)
    first, second = route["stops"][:2]
    assert (first["position"], first["kind"], first["distance_from_prev_m"]) == (1, "poi", None)
    assert (first["title"], first["lat"], first["place"]["id"]) == (
        places[0]["title"],
        places[0]["lat"],
        places[0]["id"],
    )
    assert (first["note"], first["landmark"], first["photos"]) == ("Остановка 1", "", [])
    assert second["distance_from_prev_m"] > 0
    assert (route["can_edit"], route["is_saved"], route["my_rating"], route["saves_count"]) == (
        True,
        False,
        None,
        0,
    )
    assert len(routing_client.calls) == 1
    assert (await author.get("/auth/me")).json()["reputation"] == 25

    public = (await client.get(f"{API}/routes/{route['id']}")).json()
    assert public["can_edit"] is False
    listed = (await client.get(f"{API}/routes")).json()
    assert [item["id"] for item in listed] == [route["id"]]
    assert "stops" not in listed[0]
    assert len(routing_client.calls) == 1

    assert (await author.post("/routes", json=_route_body(_linked_stops(places[:1])))).status_code == 422
    unknown = await author.post("/routes", json=_route_body([*_linked_stops(places[:1]), {"place_id": 9999}]))
    assert unknown.status_code == 422
    assert unknown.json()["errors"][0]["field"] == "stops"


async def test_custom_waypoints_via_points_and_direct_mode(
    world: World, routing_client: FakeRoutingClient
) -> None:
    hiker = await world.actor("hiker", reputation=20)
    place = await world.create_place(hiker, "viewpoint")
    uploaded = await hiker.post("/uploads", files={"file": ("a.png", world.png(), "image/png")})
    stops = [
        _custom_stop(
            0,
            kind="transport",
            title="Парковка",
            landmark="За шлагбаумом налево",
            photo_ids=[uploaded.json()["id"]],
        ),
        _custom_stop(1, kind="via", title=None),
        _custom_stop(2, kind="water", title="Родник", note="Воду кипятить", stay_min=5),
        _custom_stop(3, kind="via", title=None),
        {"place_id": place["id"], "kind": "viewpoint", "title": "Вершина", "stay_min": 30},
    ]
    body = _route_body(stops, kind="hike", path_mode="direct", difficulty="hard", tips="Возьмите воду")

    response = await hiker.post("/routes", json=body)
    assert response.status_code == 201, response.text
    route = response.json()
    assert routing_client.calls == []
    assert (route["path_mode"], route["path_source"], route["difficulty"]) == ("direct", "straight", "hard")
    assert route["tips"] == "Возьмите воду"
    assert (route["stops_count"], len(route["stops"]), len(route["path"])) == (3, 5, 5)
    assert [stop["kind"] for stop in route["stops"]] == ["transport", "via", "water", "via", "viewpoint"]
    assert route["stops"][0]["photos"][0]["id"] == uploaded.json()["id"]
    assert route["cover_url"] == uploaded.json()["url"]
    assert (route["stops"][4]["title"], route["stops"][4]["place"]["id"]) == ("Вершина", place["id"])
    assert route["stops"][2]["place"] is None

    distances = [stop["distance_from_prev_m"] for stop in route["stops"]]
    assert distances[0] is None
    assert distances[2] > distances[1] > 0
    assert route["distance_m"] == distances[2] + distances[4]
    assert route["duration_min"] == route["travel_min"] + 35

    incomplete = [{"kind": "poi", "lat": 43.1, "lng": 131.9}, _custom_stop(1)]
    assert (await hiker.post("/routes", json=_route_body(incomplete))).status_code == 422
    only_via = [_custom_stop(0), _custom_stop(1, kind="via"), _custom_stop(2, kind="via")]
    assert (await hiker.post("/routes", json=_route_body(only_via))).status_code == 422
    stolen_photo = [_custom_stop(0, photo_ids=[uploaded.json()["id"]]), _custom_stop(1)]
    assert (await hiker.post("/routes", json=_route_body(stolen_photo))).status_code == 422


async def test_private_routes_are_personal_and_unmoderated(world: World, client: AsyncClient) -> None:
    newcomer = await world.actor("newcomer")
    stranger = await world.actor("stranger", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    stops = [_custom_stop(0), _custom_stop(1)]

    private = (
        await newcomer.post(
            "/routes", json=_route_body(stops, visibility="private", title="СЕКРЕТНЫЙ ПЛАН НА ВЫХОДНЫЕ")
        )
    ).json()
    assert (private["visibility"], private["status"]) == ("private", "published")
    path = f"/routes/{private['id']}"
    assert (await moderator.get("/moderation/queue")).json() == []
    assert (await newcomer.get("/auth/me")).json()["reputation"] == 0

    assert (await client.get(f"{API}{path}")).status_code == 404
    assert (await stranger.get(path)).status_code == 404
    assert (await client.get(f"{API}{path}/gpx")).status_code == 404
    assert (await moderator.get(path)).status_code == 200
    assert (await client.get(f"{API}/routes")).json() == []
    assert (await client.get(f"{API}/users/{newcomer.id}/routes")).json() == []
    assert [item["id"] for item in (await newcomer.get("/me/routes")).json()] == [private["id"]]
    assert (await client.get(f"{API}/me/routes")).status_code == 401

    assert (await newcomer.put(f"{path}/save")).status_code == 409
    complaint = {"target_type": "route", "target_id": private["id"], "reason": "spam"}
    assert (await stranger.post("/complaints", json=complaint)).status_code == 404

    published = (
        await newcomer.patch(path, json={"visibility": "public", "title": "План на выходные"})
    ).json()
    # Published at once; with no model to check it, a newcomer's route then waits for a moderator.
    assert (published["visibility"], published["status"]) == ("public", "published")
    queue = (await moderator.get("/moderation/queue")).json()
    assert [(case["target_type"], case["triggers"]) for case in queue] == [("route", ["auto_ai"])]

    hidden_again = (await newcomer.patch(path, json={"visibility": "private"})).json()
    assert (hidden_again["visibility"], hidden_again["status"]) == ("private", "published")
    assert (await moderator.get("/moderation/queue")).json() == []


async def test_newcomer_public_route_waits_for_a_moderator_when_the_check_did_not_happen(
    world: World, client: AsyncClient
) -> None:
    newcomer = await world.actor("newcomer")
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)

    route = (await newcomer.post("/routes", json=_route_body([_custom_stop(0), _custom_stop(1)]))).json()
    assert route["status"] == "published"
    assert (await client.get(f"{API}/routes")).json() == []
    assert (await client.get(f"{API}/routes/{route['id']}")).status_code == 404
    assert (await newcomer.get("/routes")).json() == []
    assert [item["status"] for item in (await newcomer.get("/me/routes")).json()] == ["pending"]

    case = (await moderator.get("/moderation/queue", params={"target_type": "route"})).json()[0]
    assert (case["target_id"], case["layer"], case["triggers"]) == (route["id"], None, ["auto_ai"])
    detail = (await moderator.get(f"/moderation/cases/{case['id']}")).json()
    assert detail["route"]["id"] == route["id"]
    assert (detail["place"], detail["history"], detail["ai_review"]) == (None, [], None)

    resolved = await moderator.post(
        f"/moderation/cases/{case['id']}/resolve", json={"action": "approve", "reason": "Хороший маршрут"}
    )
    assert resolved.json()["route"]["status"] == "published"
    assert len((await client.get(f"{API}/routes")).json()) == 1
    assert (await newcomer.get("/auth/me")).json()["reputation"] == 5


async def test_update_and_delete_route(
    world: World, client: AsyncClient, routing_client: FakeRoutingClient
) -> None:
    author = await world.actor("author", reputation=20)
    stranger = await world.actor("stranger", reputation=20)
    places = await _places(world, author, 4)
    route = (await author.post("/routes", json=_route_body(_linked_stops(places[:3])))).json()
    path = f"/routes/{route['id']}"

    assert (await stranger.patch(path, json={"title": "Чужое"})).status_code == 403
    renamed = (
        await author.patch(path, json={"title": "Вечерние сопки", "difficulty": "medium", "tags": ["сопки"]})
    ).json()
    assert (renamed["title"], renamed["difficulty"], renamed["tags"]) == (
        "Вечерние сопки",
        "medium",
        ["сопки"],
    )
    assert len(routing_client.calls) == 1

    new_stops = [{"place_id": places[3]["id"], "stay_min": 5}, {"place_id": places[0]["id"], "stay_min": 5}]
    replanned = (await author.patch(path, json={"stops": new_stops, "kind": "bike"})).json()
    assert [stop["place"]["id"] for stop in replanned["stops"]] == [places[3]["id"], places[0]["id"]]
    assert (replanned["kind"], replanned["stops_count"], replanned["duration_min"]) == ("bike", 2, 20 + 10)
    assert routing_client.calls[-1][0] == "bike"

    direct = (await author.patch(path, json={"path_mode": "direct"})).json()
    assert (direct["path_mode"], len(direct["path"])) == ("direct", 2)

    assert (await client.get(f"{API}/routes", params={"q": "вечерние"})).json()[0]["id"] == route["id"]
    assert (await client.get(f"{API}/routes", params={"q": "сопки"})).json()[0]["id"] == route["id"]
    assert (await client.get(f"{API}/routes", params={"kind": "walk,car"})).json() == []
    assert len((await client.get(f"{API}/routes", params={"kind": "bike"})).json()) == 1
    assert len((await client.get(f"{API}/routes", params={"difficulty": "medium,hard"})).json()) == 1
    assert (await client.get(f"{API}/routes", params={"difficulty": "easy"})).json() == []
    assert (await client.get(f"{API}/routes", params={"difficulty": "extreme"})).status_code == 422

    assert (await stranger.delete(path)).status_code == 403
    assert (await author.delete(path)).status_code == 204
    assert (await client.get(f"{API}{path}")).status_code == 404
    assert (await client.get(f"{API}/users/{author.id}/routes")).json() == []


async def test_gpx_export(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    stops = [
        _custom_stop(0, title="Старт <у> моста", note="Встречаемся здесь", landmark="Красная будка"),
        _custom_stop(1, kind="via", title=None),
        _custom_stop(2, title="Финиш"),
    ]
    route = (await author.post("/routes", json=_route_body(stops, path_mode="direct"))).json()

    response = await client.get(f"{API}/routes/{route['id']}/gpx")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/gpx+xml")
    assert response.headers["content-disposition"] == f'attachment; filename="mayak-route-{route["id"]}.gpx"'
    root = ET.fromstring(response.text)
    waypoints = root.findall("gpx:wpt", GPX_NS)
    assert [point.find("gpx:name", GPX_NS).text for point in waypoints] == ["Старт <у> моста", "Финиш"]
    assert waypoints[0].find("gpx:desc", GPX_NS).text == "Встречаемся здесь\nКрасная будка"
    assert len(root.findall("gpx:trk/gpx:trkseg/gpx:trkpt", GPX_NS)) == 3
    assert (await client.get(f"{API}/routes/9999/gpx")).status_code == 404


async def test_save_review_and_sort(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    fan = await world.actor("fan", reputation=15)
    stops = [_custom_stop(0), _custom_stop(1)]
    first = (await author.post("/routes", json=_route_body(stops, title="Первый маршрут"))).json()
    second = (await author.post("/routes", json=_route_body(stops, title="Второй маршрут"))).json()

    assert (await fan.put(f"/routes/{first['id']}/save")).status_code == 204
    assert (await fan.put(f"/routes/{first['id']}/save")).status_code == 204
    saved = (await fan.get(f"/routes/{first['id']}")).json()
    assert (saved["is_saved"], saved["saves_count"]) == (True, 1)
    assert [item["id"] for item in (await fan.get("/me/favorites")).json()["routes"]] == [first["id"]]

    own_review = await author.post(
        f"/routes/{first['id']}/reviews", json={"rating": 5, "text": "Сам себя хвалю"}
    )
    assert own_review.status_code == 403
    review = await fan.post(f"/routes/{second['id']}/reviews", json={"rating": 4, "text": "Красиво"})
    assert review.status_code == 200
    await fan.post(f"/routes/{second['id']}/reviews", json={"rating": 5, "text": "Очень красиво"})
    reviews = (await client.get(f"{API}/routes/{second['id']}/reviews")).json()
    assert [(item["rating"], item["text"]) for item in reviews] == [(5, "Очень красиво")]
    rated = (await fan.get(f"/routes/{second['id']}")).json()
    assert (rated["rating_avg"], rated["rating_count"], rated["my_rating"]) == (5.0, 1, 5)

    async def order(sort: str) -> list[int]:
        return [item["id"] for item in (await client.get(f"{API}/routes", params={"sort": sort})).json()]

    assert await order("new") == [second["id"], first["id"]]
    assert await order("popular") == [first["id"], second["id"]]
    assert await order("rating") == [second["id"], first["id"]]
    assert [
        item["id"] for item in (await client.get(f"{API}/users/{author.id}/routes")).json()
    ] == await order("new")

    assert (await fan.delete(f"/routes/{first['id']}/save")).status_code == 204
    assert (await fan.get("/me/favorites")).json()["routes"] == []


async def test_impassable_complaints_send_route_to_review(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    hikers = [await world.actor(f"expert{index}", reputation=200) for index in range(2)]
    route = (await author.post("/routes", json=_route_body([_custom_stop(0), _custom_stop(1)]))).json()

    for hiker in hikers:
        body = {
            "target_type": "route",
            "target_id": route["id"],
            "reason": "impassable",
            "comment": "Тропу размыло",
        }
        assert (await hiker.post("/complaints", json=body)).status_code == 201
    assert (await client.get(f"{API}/routes/{route['id']}")).json()["status"] == "needs_review"

    case = (await moderator.get("/moderation/queue")).json()[0]
    assert (case["target_type"], case["complaints_count"], case["triggers"]) == ("route", 2, ["complaints"])
    hidden = await moderator.post(
        f"/moderation/cases/{case['id']}/resolve", json={"action": "hide", "reason": "Маршрут непроходим"}
    )
    assert hidden.json()["route"]["status"] == "hidden"
    assert (await client.get(f"{API}/routes/{route['id']}")).status_code == 404
    assert [item["status"] for item in (await author.get("/me/routes")).json()] == ["hidden"]
    assert (await author.get("/auth/me")).json()["reputation"] == 20 + 5 - 15
    assert (await hikers[0].get("/auth/me")).json()["reputation"] == 203


class DetourClient(FakeRoutingClient):
    """Routes every leg around a point 0.001° to the east of its middle."""

    async def route(self, travel: TravelMode, points: Sequence[LngLat]) -> RoutedPath | None:
        self.calls.append((travel, tuple(points)))
        if not self.available:
            return None
        path = [
            vertex
            for start, end in pairwise(points)
            for vertex in (start, ((start[0] + end[0]) / 2 + 0.001, (start[1] + end[1]) / 2))
        ]
        path.append(points[-1])
        return RoutedPath(path, routing.path_legs_m(path, points), duration_s=1800)


async def _recompute(world: World, provider: FakeRoutingClient) -> routes.RecomputeReport:
    async with world.app.state.database.session_factory() as session:
        return await routes.recompute_paths(session, RoutePlanner([provider]))


async def test_recompute_cli_redraws_roads_routes(
    world: World, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    author = await world.actor("author", reputation=20)
    places = await _places(world, author)
    roads = (await author.post("/routes", json=_route_body(_linked_stops(places)))).json()
    direct = (
        await author.post("/routes", json=_route_body(_linked_stops(places), path_mode="direct"))
    ).json()
    detour = DetourClient()
    monkeypatch.setattr(routes_recompute, "get_settings", lambda: world.app.state.settings)
    monkeypatch.setattr(routes_recompute, "build_planner", lambda _settings: RoutePlanner([detour]))

    await routes_recompute._main()
    assert "пересчитано 1, без изменений 0" in capsys.readouterr().out
    assert len(detour.calls) == 1
    redrawn = (await author.get(f"/routes/{roads['id']}")).json()
    assert (len(redrawn["path"]), redrawn["travel_min"], redrawn["duration_min"]) == (5, 30, 30 + 30)
    assert redrawn["distance_m"] > roads["distance_m"]
    assert redrawn["distance_m"] == sum(stop["distance_from_prev_m"] or 0 for stop in redrawn["stops"])
    assert redrawn["updated_at"] == roads["updated_at"]
    assert (await author.get(f"/routes/{direct['id']}")).json()["path"] == direct["path"]

    again = await _recompute(world, DetourClient())
    assert (again.updated, again.unchanged, again.kept_ids) == (0, 1, [])

    down = FakeRoutingClient()
    down.available = False
    kept = await _recompute(world, down)
    assert (kept.updated, kept.kept_ids) == (0, [roads["id"]])
    assert (await author.get(f"/routes/{roads['id']}")).json()["path"] == redrawn["path"]
