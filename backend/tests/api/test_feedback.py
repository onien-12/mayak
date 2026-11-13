from httpx import AsyncClient

from app.domain.enums import UserRole
from tests.conftest import API, World


async def test_review_upsert_updates_rating(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    alice = await world.actor("alice", reputation=15)
    bob = await world.actor("bob", reputation=15)
    place = await world.create_place(author)
    path = f"/places/{place['id']}/reviews"

    first = await alice.post(path, json={"rating": 5, "text": "Чисто и бесплатно."})
    assert first.status_code == 200, first.text
    assert first.json()["author"]["username"] == "alice"
    await bob.post(path, json={"rating": 2, "text": ""})

    card = (await client.get(f"{API}/places/{place['id']}")).json()
    assert (card["rating_avg"], card["rating_count"]) == (3.5, 2)

    changed = await alice.post(path, json={"rating": 3, "text": "Стало хуже."})
    assert changed.json()["id"] == first.json()["id"]
    reviews = (await client.get(f"{API}{path}")).json()
    assert [(item["author"]["username"], item["rating"]) for item in reviews] == [("alice", 3), ("bob", 2)]

    detail = (await alice.get(f"/places/{place['id']}")).json()
    assert (detail["rating_avg"], detail["rating_count"], detail["my_rating"]) == (2.5, 2, 3)
    assert (await alice.get("/auth/me")).json()["reputation"] == 16


async def test_review_rules(world: World) -> None:
    author = await world.actor("author", reputation=20)
    reviewer = await world.actor("reviewer", reputation=15)
    toilet = await world.create_place(author)
    event = await world.create_place(author, "culture", event=world.event_window())
    issue = await world.create_place(author, "roads")

    for place in (event, issue):
        response = await reviewer.post(f"/places/{place['id']}/reviews", json={"rating": 5, "text": "ок"})
        assert response.status_code == 400

    out_of_range = await reviewer.post(f"/places/{toilet['id']}/reviews", json={"rating": 6, "text": "ок"})
    assert out_of_range.status_code == 422

    flagged = await reviewer.post(
        f"/places/{toilet['id']}/reviews", json={"rating": 1, "text": "ПОЛНЫЙ ОТСТОЙ НЕ ХОДИТЕ СЮДА НИКОГДА"}
    )
    assert flagged.status_code == 422
    assert flagged.json()["code"] == "content_flagged"
    assert "заглавными" in flagged.json()["detail"]
    assert (
        await world.http.post(f"{API}/places/{toilet['id']}/reviews", json={"rating": 5})
    ).status_code == 401


async def test_newcomer_reviews_are_limited_per_day(world: World) -> None:
    author = await world.actor("author", reputation=210)
    newcomer = await world.actor("newcomer")
    places = [await world.create_place(author) for _ in range(6)]
    statuses = [
        (
            await newcomer.post(f"/places/{place['id']}/reviews", json={"rating": 4, "text": "Нормально"})
        ).status_code
        for place in places
    ]
    assert statuses == [200] * 5 + [429]


async def test_comments(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    guest = await world.actor("guest")
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    place = await world.create_place(author)
    path = f"/places/{place['id']}/comments"

    created = await guest.post(path, json={"text": "  Работает до девяти.  "})
    assert created.status_code == 201
    comment = created.json()
    assert (comment["text"], comment["can_delete"]) == ("Работает до девяти.", True)
    await author.post(path, json={"text": "Спасибо, поправил."})

    public = (await client.get(f"{API}{path}")).json()
    assert [item["text"] for item in public] == ["Работает до девяти.", "Спасибо, поправил."]
    assert [item["can_delete"] for item in public] == [False, False]
    assert [item["can_delete"] for item in (await guest.get(path)).json()] == [True, False]
    assert (await client.get(f"{API}/places/{place['id']}")).json()["comments_count"] == 2

    notifications = (await author.get("/notifications")).json()
    assert [item["kind"] for item in notifications] == ["comment"]
    assert notifications[0]["link"] == f"/?place={place['id']}"

    assert (await guest.post(path, json={"text": ""})).status_code == 422
    assert (await guest.post(path, json={"text": "жми https://bit.ly/x"})).status_code == 422

    assert (await author.delete(f"/comments/{comment['id']}")).status_code == 403
    assert (await moderator.delete(f"/comments/{comment['id']}")).status_code == 204
    assert (await guest.delete(f"/comments/{comment['id']}")).status_code == 404
    assert (await client.get(f"{API}/places/{place['id']}")).json()["comments_count"] == 1
