from typing import Any

from httpx import AsyncClient

from app.domain import limits
from app.domain.enums import UserRole
from tests.conftest import API, CENTER, World

OBJECT = {"object_id": "70030076140455561", "object_name": "Железнодорожный вокзал, Алеутская, 2"}


def _note(
    text: str = "Вход со двора.", lat: float = CENTER["lat"], lng: float = CENTER["lng"], **extra: Any
) -> dict[str, Any]:
    return {"lat": lat, "lng": lng, "text": text, **extra}


async def test_notes_on_an_object_form_a_thread(world: World, client: AsyncClient) -> None:
    anna = await world.actor("anna")
    boris = await world.actor("boris")

    created = await anna.post("/notes", json=_note("  Камеры хранения в цоколе.  ", **OBJECT))
    assert created.status_code == 201, created.text
    note = created.json()
    assert note["text"] == "Камеры хранения в цоколе."
    assert (note["object_id"], note["object_name"]) == (OBJECT["object_id"], OBJECT["object_name"])
    assert (note["author"]["username"], note["can_delete"], note["reported_by_me"]) == ("anna", True, False)
    await boris.post("/notes", json=_note("Розетки на втором этаже.", lat=CENTER["lat"] + 0.0003, **OBJECT))
    await boris.post("/notes", json=_note("Тут лавочка с видом."))

    thread = (await client.get(f"{API}/notes", params={"object_id": OBJECT["object_id"]})).json()
    assert [item["text"] for item in thread] == ["Розетки на втором этаже.", "Камеры хранения в цоколе."]
    assert [item["can_delete"] for item in thread] == [False, False]
    assert (await client.get(f"{API}/notes", params={"object_id": "unknown"})).json() == []


async def test_notes_selectors(world: World, client: AsyncClient) -> None:
    author = await world.actor("author")
    here = (await author.post("/notes", json=_note("Здесь"))).json()
    close = (await author.post("/notes", json=_note("Рядом, 30 м", lat=CENTER["lat"] + 0.00027))).json()
    far = (await author.post("/notes", json=_note("Далеко", lat=CENTER["lat"] + 0.01))).json()

    async def ids(**params: Any) -> list[int]:
        response = await client.get(f"{API}/notes", params=params)
        assert response.status_code == 200, response.text
        return [item["id"] for item in response.json()]

    point = f"{CENTER['lat']},{CENTER['lng']}"
    assert await ids(near=point) == [close["id"], here["id"]]
    assert await ids(near=point, radius_m=10) == [here["id"]]
    assert await ids(bbox="131.80,43.00,132.00,43.20") == [far["id"], close["id"], here["id"]]
    assert await ids(bbox="131.80,43.00,132.00,43.20", limit=1) == [far["id"]]

    for params in ({}, {"near": point, "object_id": "x"}, {"near": "там"}, {"near": point, "radius_m": 301}):
        assert (await client.get(f"{API}/notes", params=params)).status_code == 422


async def test_note_validation_checks_and_limits(world: World) -> None:
    newcomer = await world.actor("newcomer")
    assert (await world.http.post(f"{API}/notes", json=_note())).status_code == 401
    assert (await newcomer.post("/notes", json=_note(""))).status_code == 422
    assert (await newcomer.post("/notes", json=_note("а" * 501))).status_code == 422
    flagged = await newcomer.post(
        "/notes", json=_note("КУПИТЕ ДЁШЕВО ТОЛЬКО СЕГОДНЯ СКИДКИ https://bit.ly/x")
    )
    assert flagged.status_code == 422
    assert flagged.json()["code"] == "content_flagged"

    statuses = [
        (await newcomer.post("/notes", json=_note(f"Заметка {index}"))).status_code
        for index in range(limits.NOTES_PER_DAY_NEWCOMER + 1)
    ]
    assert statuses == [201] * limits.NOTES_PER_DAY_NEWCOMER + [429]
    resident = await world.actor("resident", reputation=20)
    assert (await resident.post("/notes", json=_note())).status_code == 201


async def test_delete_note(world: World, client: AsyncClient) -> None:
    author = await world.actor("author")
    stranger = await world.actor("stranger")
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    first = (await author.post("/notes", json=_note("Первая"))).json()
    second = (await author.post("/notes", json=_note("Вторая"))).json()

    assert (await stranger.delete(f"/notes/{first['id']}")).status_code == 403
    assert (await author.delete(f"/notes/{first['id']}")).status_code == 204
    assert (await author.delete(f"/notes/{first['id']}")).status_code == 404
    assert (await moderator.delete(f"/notes/{second['id']}")).status_code == 204
    assert (
        await client.get(f"{API}/notes", params={"near": f"{CENTER['lat']},{CENTER['lng']}"})
    ).json() == []


async def test_three_distinct_reports_hide_a_note(world: World, client: AsyncClient) -> None:
    author = await world.actor("author")
    reporters = [await world.actor(f"reporter{index}") for index in range(3)]
    note = (await author.post("/notes", json=_note("Спорная заметка"))).json()
    path = f"/notes/{note['id']}/report"
    point = {"near": f"{CENTER['lat']},{CENTER['lng']}"}

    assert (await author.post(path)).status_code == 400
    assert (await world.http.post(f"{API}{path}")).status_code == 401
    assert (await reporters[0].post(path)).status_code == 204
    assert (await reporters[0].post(path)).status_code == 204
    assert (await reporters[1].post(path)).status_code == 204
    seen = (await reporters[0].get("/notes", params=point)).json()
    assert [item["reported_by_me"] for item in seen] == [True]
    assert (await client.get(f"{API}/notes", params=point)).json()[0]["reported_by_me"] is False

    assert (await reporters[2].post(path)).status_code == 204
    assert (await client.get(f"{API}/notes", params=point)).json() == []
    assert (await author.get("/notes", params=point)).json() == []
    assert (await reporters[0].post(path)).status_code == 404
    assert (await reporters[0].post("/notes/9999/report")).status_code == 404


async def test_places_near_a_point_are_sorted_by_distance(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=210)
    lat, lng = 43.1300, 131.9000
    here = await world.create_place(author, lat=lat, lng=lng)
    close = await world.create_place(author, "viewpoint", lat=lat + 0.0005, lng=lng)
    further = await world.create_place(author, "roads", lat=lat + 0.003, lng=lng)
    await world.create_place(author, lat=lat + 0.05, lng=lng)

    async def ids(**params: Any) -> list[int]:
        response = await client.get(f"{API}/places", params={"near": f"{lat},{lng}", **params})
        assert response.status_code == 200, response.text
        return [item["id"] for item in response.json()]

    assert await ids() == [here["id"], close["id"]]
    assert await ids(radius_m=20) == [here["id"]]
    assert await ids(radius_m=1000) == [here["id"], close["id"], further["id"]]
    assert await ids(radius_m=1000, layers="issue,tourism") == [close["id"], further["id"]]
    assert await ids(radius_m=1000, limit=1) == [here["id"]]
    assert (
        await client.get(f"{API}/places", params={"near": f"{lat},{lng}", "radius_m": 1001})
    ).status_code == 422
    assert (await client.get(f"{API}/places", params={"near": "43.13"})).status_code == 422
