from datetime import timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import event

from app.domain.enums import UserRole
from tests.conftest import API, CENTER, World


async def test_newcomer_place_is_premoderated(world: World, client: AsyncClient) -> None:
    newcomer = await world.actor("newcomer")
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    place = await world.create_place(newcomer)
    assert place["status"] == "pending"
    assert place["can_edit"] is True

    assert (await client.get(f"{API}/places/{place['id']}")).status_code == 404
    assert (await client.get(f"{API}/places")).json() == []
    assert [item["id"] for item in (await newcomer.get("/places")).json()] == [place["id"]]
    assert (await moderator.get(f"/places/{place['id']}")).status_code == 200

    queue = (await moderator.get("/moderation/queue")).json()
    assert len(queue) == 1
    assert queue[0]["target_id"] == place["id"]
    assert queue[0]["triggers"] == ["premoderation"]
    assert queue[0]["author"]["level"] == "newcomer"


async def test_resident_publishes_as_unverified_and_expert_as_preliminary(
    world: World, client: AsyncClient
) -> None:
    resident = await world.actor("resident", reputation=18)
    expert = await world.actor("expert", reputation=210)
    by_resident = await world.create_place(resident)
    by_expert = await world.create_place(expert)
    assert by_resident["status"] == "unverified"
    assert by_expert["status"] == "preliminary"
    assert by_resident["trust_score"] < by_expert["trust_score"]
    listed = (await client.get(f"{API}/places")).json()
    assert {item["id"] for item in listed} == {by_resident["id"], by_expert["id"]}


async def test_place_detail_shape(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    created = await world.create_place(
        author,
        attributes={"free": "true", "price": "30", "condition": "good", "bogus": "dropped"},
        tags=["Центр", " #Бесплатно ", "центр"],
        tips="Совет",
        address="ул. Светланская, 1",
    )
    detail = (await client.get(f"{API}/places/{created['id']}")).json()
    assert detail["attributes"] == {"free": True, "price": 30, "condition": "good"}
    assert detail["tags"] == ["центр", "бесплатно"]
    assert detail["category"]["slug"] == "toilet"
    assert detail["author"]["username"] == "author"
    assert detail["verification"] == {"present": 0, "absent": 0, "unclear": 0, "my_vote": None}
    assert detail["event"] is None
    assert detail["issue"] is None
    assert (detail["is_favorite"], detail["can_edit"], detail["can_appeal"]) == (False, False, False)
    assert detail["is_stale"] is False
    assert detail["last_confirmed_at"] is None
    assert detail["created_at"].endswith("Z")
    history = (await client.get(f"{API}/places/{created['id']}/history")).json()
    assert [entry["kind"] for entry in history] == ["created"]
    assert history[0]["actor"]["id"] == author.id


async def test_create_validation(world: World) -> None:
    author = await world.actor("author", reputation=20)
    event_category = await world.category_id("culture")

    wrong_layer = await author.post("/places", json=await world.place_payload(category_id=event_category))
    assert wrong_layer.status_code == 422
    assert wrong_layer.json()["errors"][0]["field"] == "category_id"

    bad_attribute = await author.post(
        "/places", json=await world.place_payload(attributes={"price": "дорого"})
    )
    assert bad_attribute.status_code == 422
    assert bad_attribute.json()["errors"][0]["field"] == "attributes.price"

    short_title = await author.post("/places", json=await world.place_payload(title="ab"))
    assert short_title.status_code == 422
    assert short_title.json()["errors"][0]["field"] == "title"

    assert (await world.http.post(f"{API}/places", json=await world.place_payload())).status_code == 401


async def test_filters(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=210)
    toilet = await world.create_place(
        author, title="Туалет у Маяка", attributes={"free": True, "accessible": True}, tags=["бесплатно"]
    )
    paid = await world.create_place(
        author, title="Платный туалет", attributes={"free": False}, lat=43.0731, lng=131.8431
    )
    viewpoint = await world.create_place(
        author, "viewpoint", title="Видовая на сопке", description="Вид на мост"
    )

    async def ids(**params: Any) -> set[int]:
        response = await client.get(f"{API}/places", params=params)
        assert response.status_code == 200, response.text
        return {item["id"] for item in response.json()}

    everything = {toilet["id"], paid["id"], viewpoint["id"]}
    assert await ids() == everything
    assert await ids(bbox="131.80,43.05,131.86,43.09") == {paid["id"]}
    assert await ids(layers="tourism") == {viewpoint["id"]}
    assert await ids(layers="tourism,infrastructure") == everything
    assert await ids(categories=str(toilet["category_id"])) == {toilet["id"], paid["id"]}
    assert await ids(q="МАЯКА") == {toilet["id"]}
    assert await ids(q="мост") == {viewpoint["id"]}
    assert await ids(tags="бесплатно") == {toilet["id"]}
    assert await ids(attrs="free:true,accessible:true") == {toilet["id"]}
    assert await ids(attrs="free:false") == {paid["id"]}
    assert await ids(author_id=author.id) == everything
    assert await ids(author_id=author.id + 100) == set()
    assert await ids(min_status="verified") == set()
    assert await ids(min_status="preliminary") == everything
    assert len((await client.get(f"{API}/places", params={"limit": 2})).json()) == 2

    assert (await client.get(f"{API}/places", params={"bbox": "1,2,3"})).status_code == 422
    assert (await client.get(f"{API}/places", params={"layers": "sea"})).status_code == 422
    assert (await client.get(f"{API}/places", params={"attrs": "free"})).status_code == 422


async def test_place_list_uses_a_constant_number_of_queries(
    world: World, client: AsyncClient, app: Any
) -> None:
    author = await world.actor("author", reputation=210)
    for slug in ("toilet", "viewpoint", "roads") * 8:
        await world.create_place(author, slug)
    await world.create_place(author, "culture", event=world.event_window())

    statements: list[str] = []

    def record(_conn: Any, _cursor: Any, statement: str, *_: Any) -> None:
        statements.append(statement)

    engine = app.state.database.engine.sync_engine
    event.listen(engine, "before_cursor_execute", record)
    try:
        response = await client.get(f"{API}/places")
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert len(response.json()) == 25
    assert len(statements) <= 2, statements


async def test_creation_limits(world: World) -> None:
    newcomer = await world.actor("newcomer")
    await world.create_place(newcomer)

    too_fast = await newcomer.post("/places", json=await world.place_payload())
    assert too_fast.status_code == 429
    assert "Слишком часто" in too_fast.json()["detail"]

    await world.create_place(newcomer)
    await world.create_place(newcomer)
    world.clock.shift(timedelta(seconds=30))
    over_daily = await newcomer.post("/places", json=await world.place_payload())
    assert over_daily.status_code == 429
    assert "дневной лимит" in over_daily.json()["detail"]
    assert (await newcomer.get("/auth/me")).json()["permissions"]["places_left_today"] == 0

    world.clock.shift(timedelta(hours=24))
    assert (await newcomer.post("/places", json=await world.place_payload())).status_code == 201


async def test_at_most_three_places_nearby_per_day(world: World) -> None:
    author = await world.actor("author", reputation=60)
    for index in range(3):
        await world.create_place(author, lat=CENTER["lat"] + index * 0.0002, lng=CENTER["lng"])
    world.clock.shift(timedelta(seconds=30))
    crowded = await author.post(
        "/places", json=await world.place_payload(lat=CENTER["lat"], lng=CENTER["lng"])
    )
    assert crowded.status_code == 429
    assert "рядом" in crowded.json()["detail"]


async def test_flagged_text_goes_to_moderation(world: World) -> None:
    resident = await world.actor("resident", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    place = await world.create_place(
        resident, title="ЛУЧШИЕ ТУРЫ В КИТАЙ ТОЛЬКО У НАС", description="Запись: https://bit.ly/tours"
    )
    assert place["status"] == "pending"
    case = (await moderator.get("/moderation/queue")).json()[0]
    assert case["triggers"] == ["auto_text"]
    detail = (await moderator.get(f"/moderation/cases/{case['id']}")).json()
    assert detail["flags"] == ["Ссылка через сервис сокращения", "Текст набран заглавными буквами"]


async def test_duplicate_title_nearby_is_flagged(world: World) -> None:
    first = await world.actor("first", reputation=20)
    second = await world.actor("second", reputation=20)
    original = await world.create_place(first, title="Фонтанчик в сквере")
    copy = await world.create_place(
        second, title="фонтанчик  В СКВЕРЕ", lat=original["lat"], lng=original["lng"]
    )
    assert copy["status"] == "pending"


async def test_update_by_author_writes_history(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    stranger = await world.actor("stranger", reputation=20)
    place = await world.create_place(author, attributes={"free": True})

    forbidden = await stranger.patch(f"/places/{place['id']}", json={"title": "Чужая правка"})
    assert forbidden.status_code == 403

    response = await author.patch(
        f"/places/{place['id']}",
        json={
            "title": "Новое название",
            "address": "ул. Алеутская, 2",
            "attributes": {"free": False, "price": 50},
        },
    )
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["title"] == "Новое название"
    assert updated["attributes"] == {"free": False, "price": 50}
    assert updated["description"] == place["description"]

    history = (await client.get(f"{API}/places/{place['id']}/history")).json()
    assert history[0]["kind"] == "edited"
    assert history[0]["message"] == "Изменено: название, адрес, характеристики"
    assert (await client.get(f"{API}/places", params={"q": "новое"})).json()[0]["id"] == place["id"]

    unchanged = await author.patch(f"/places/{place['id']}", json={"title": "Новое название"})
    assert unchanged.status_code == 200
    assert len((await client.get(f"{API}/places/{place['id']}/history")).json()) == len(history)


async def test_delete_archives_the_place(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    stranger = await world.actor("stranger", reputation=20)
    place = await world.create_place(author)

    assert (await stranger.delete(f"/places/{place['id']}")).status_code == 403
    assert (await author.delete(f"/places/{place['id']}")).status_code == 204
    assert (await client.get(f"{API}/places")).json() == []
    archived = (await client.get(f"{API}/places/{place['id']}")).json()
    assert archived["status"] == "archived"
    assert archived["can_edit"] is False
    assert (await author.patch(f"/places/{place['id']}", json={"title": "Поздно"})).status_code == 409
    assert (await client.get(f"{API}/places/999999")).status_code == 404


async def test_favorites(world: World) -> None:
    author = await world.actor("author", reputation=20)
    fan = await world.actor("fan")
    place = await world.create_place(author)

    assert (await fan.put(f"/places/{place['id']}/favorite")).status_code == 204
    assert (await fan.put(f"/places/{place['id']}/favorite")).status_code == 204
    assert (await fan.get(f"/places/{place['id']}")).json()["is_favorite"] is True
    favorites = (await fan.get("/me/favorites")).json()
    assert [item["id"] for item in favorites["places"]] == [place["id"]]
    assert favorites["routes"] == []

    assert (await fan.delete(f"/places/{place['id']}/favorite")).status_code == 204
    assert (await fan.get("/me/favorites")).json()["places"] == []
    assert (await world.http.put(f"{API}/places/{place['id']}/favorite")).status_code == 401
