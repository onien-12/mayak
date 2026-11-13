"""Holds of the screening (SPEC §24.1): the author is told the item did not pass and why, nobody
else gets it from any endpoint, moderators see everything; and profanity masking (§24.5)."""

from typing import Any

from httpx import AsyncClient
from sqlalchemy import select

from app.domain.enums import AiTarget, ExternalSourceId, UserRole
from app.models import AuthorStanding, Category, ModerationLog, PlaceQuality, User
from app.schemas.place import PlaceInput
from app.services import place_quality, places
from app.services.places import ExternalRef
from tests.conftest import API, CENTER, Actor, World

NEAR = f"{CENTER['lat']},{CENTER['lng']}"


async def _ids(response: Any) -> list[int]:
    return [item["id"] for item in response.json()]


async def _standing(world: World, actor: Actor) -> int:
    async with world.session() as session:
        score = await session.scalar(select(AuthorStanding.score).where(AuthorStanding.user_id == actor.id))
    return 50 if score is None else score


async def _upload(world: World, actor: Actor, color: str = "teal") -> int:
    response = await actor.post(
        "/uploads", files={"file": ("p.png", world.png((64, 48), color), "image/png")}
    )
    return response.json()["id"]


async def _notices(actor: Actor) -> list[dict[str, Any]]:
    return (await actor.get("/notifications")).json()


async def test_a_held_place_is_pending_for_its_author_with_reasons_and_gone_for_everyone_else(
    world: World, client: AsyncClient
) -> None:
    author = await world.actor("author", reputation=20)
    other = await world.actor("other", reputation=60)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    area = await other.post(
        "/areas",
        json={
            "title": "Тестовый сквер",
            "kind": "square",
            "lat": CENTER["lat"] + 0.004,
            "lng": CENTER["lng"],
            "radius_m": 300,
        },
    )
    assert area.status_code == 201, area.text
    await other.post(
        "/me/subscriptions",
        json={
            "title": "Центр",
            "lat": CENTER["lat"],
            "lng": CENTER["lng"],
            "radius_m": 5000,
            "layers": ["tourism"],
        },
    )
    fake = world.enable_ai()
    fake.will_say("violation", 0.9, "ads", summary="Явная реклама магазина.")
    place = await world.create_place(author, "historic", title="Старый дом купца", tags=["история"])
    assert place["status"] == "unverified"
    await world.ai_done()
    place_id = place["id"]
    reputation = (await author.get("/auth/me")).json()["reputation"]

    # The author: pending, with the reasons in plain words and one notice.
    detail = (await author.get(f"/places/{place_id}")).json()
    assert (detail["status"], detail["moderation_note"], detail["can_appeal"]) == ("pending", None, False)
    assert detail["screening_hold"] == {"reasons": ["Текст: реклама"]}
    assert place_id in await _ids(await author.get("/places"))
    assert [card["status"] for card in (await author.get(f"/users/{author.id}/places")).json()] == ["pending"]
    assert (await author.get(f"/users/{author.id}")).json()["stats"]["places_total"] == 0
    history = (await author.get(f"/places/{place_id}/history")).json()
    assert [(entry["kind"], entry["old_status"], entry["new_status"]) for entry in history] == [
        ("status_changed", "unverified", "pending"),
        ("created", None, "unverified"),
    ]
    [notice] = await _notices(author)
    assert (notice["kind"], notice["title"], notice["link"]) == (
        "moderation",
        "Публикация «Старый дом купца» не прошла автоматическую проверку",
        f"/?place={place_id}",
    )
    assert notice["body"] == (
        "Что нашла проверка: Текст: реклама. Пока её видите только вы — модератор посмотрит и решит. "
        "Можно исправить её — модератор увидит новую версию."
    )
    assert (await author.get("/me/reputation")).json() == []
    assert (await author.put(f"/places/{place_id}/favorite")).status_code == 204
    collection = (await author.post("/collections", json={"title": "Мои места", "is_public": True})).json()
    await author.put(f"/collections/{collection['id']}/places/{place_id}")

    # Everybody else: nothing.
    for viewer in (other, None):

        def get(path: str, **kwargs: Any) -> Any:
            return viewer.get(path, **kwargs) if viewer else client.get(f"{API}{path}", **kwargs)  # noqa: B023

        assert (await get(f"/places/{place_id}")).status_code == 404
        assert (await get(f"/places/{place_id}/history")).status_code == 404
        assert (await get(f"/places/{place_id}/comments")).status_code == 404
        assert place_id not in await _ids(await get("/places"))
        assert place_id not in await _ids(await get("/places", params={"q": "купца"}))
        assert place_id not in await _ids(await get("/places", params={"near": NEAR, "radius_m": 1000}))
        assert place_id not in await _ids(await get(f"/users/{author.id}/places"))
        assert (await get(f"/users/{author.id}")).json()["stats"]["places_total"] == 0
        area_seen = (await get(f"/areas/{area.json()['id']}")).json()
        assert (area_seen["places"], area_seen["places_count"]) == ([], 0)
        assert (await get(f"/collections/{collection['id']}")).json()["items_count"] == 0
        stats = (await get("/stats")).json()
        assert stats["totals"]["places"] == 0
        assert sum(day["places"] for day in stats["activity"]) == 0
    assert await _notices(other) == []

    # Moderators: the truth and the full lines.
    staff_view = (await moderator.get(f"/places/{place_id}")).json()
    assert (staff_view["status"], staff_view["screening_hold"]) == (
        "pending",
        {"reasons": ["Текст: реклама"]},
    )
    case = (await moderator.get("/moderation/queue")).json()[0]
    assert (case["quiet"], case["triggers"]) == (True, ["auto_ai"])
    case_detail = (await moderator.get(f"/moderation/cases/{case['id']}")).json()
    assert case_detail["hold"]["reasons"] == ["Текст: нарушение (реклама), уверенность 0.90"]

    approved = await moderator.post(
        f"/moderation/cases/{case['id']}/resolve", json={"action": "approve", "reason": "Обычный дом"}
    )
    assert approved.status_code == 200
    assert (await client.get(f"{API}/places/{place_id}")).json()["status"] == "unverified"
    detail = (await author.get(f"/places/{place_id}")).json()
    assert (detail["status"], detail["screening_hold"]) == ("unverified", None)
    assert [(item["title"], item["body"]) for item in (await _notices(author))[:1]] == [
        ("Публикация одобрена модератором", "«Старый дом купца»: Обычный дом")
    ]
    assert len(await _notices(author)) == 2
    assert (await author.get("/auth/me")).json()["reputation"] == reputation
    history = (await author.get(f"/places/{place_id}/history")).json()
    assert [(entry["kind"], entry["old_status"], entry["new_status"]) for entry in history[:1]] == [
        ("moderation", "pending", "unverified")
    ]
    assert [item["kind"] for item in await _notices(other)] == ["territory"]
    assert await _standing(world, author) == 50
    log = (await moderator.get("/moderation/log")).json()
    assert [(entry["action"], entry["target_type"]) for entry in log] == [("approve", "place")]


async def test_rejecting_a_held_place_is_an_ordinary_decision(world: World) -> None:
    author = await world.actor("author", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    fake = world.enable_ai()
    fake.will_say("violation", 0.95, "ads")
    place = await world.create_place(author)
    await world.ai_done()
    case = (await moderator.get("/moderation/queue")).json()[0]
    await moderator.post(
        f"/moderation/cases/{case['id']}/resolve", json={"action": "reject", "reason": "Реклама"}
    )

    detail = (await author.get(f"/places/{place['id']}")).json()
    assert (detail["status"], detail["moderation_note"], detail["can_appeal"], detail["screening_hold"]) == (
        "archived",
        "Реклама",
        True,
        None,
    )
    assert [item["title"] for item in await _notices(author)] == [
        "Публикация отклонена модератором",
        f"Публикация «{place['title']}» не прошла автоматическую проверку",
    ]
    assert (await author.get("/auth/me")).json()["reputation"] == 5
    history = (await author.get(f"/places/{place['id']}/history")).json()
    assert (history[0]["old_status"], history[0]["new_status"]) == ("pending", "archived")
    assert await _standing(world, author) == 50 - 8 - 15


async def test_an_edit_that_fails_the_check_is_told_once(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    place = await world.create_place(author)
    fake = world.enable_ai()
    fake.will_say("violation", 0.9, "spam")
    edited = await author.patch(f"/places/{place['id']}", json={"description": "Звоните, дёшево, быстро."})
    assert edited.json()["status"] == "unverified"
    await world.ai_done()
    assert (await client.get(f"{API}/places/{place['id']}")).status_code == 404
    detail = (await author.get(f"/places/{place['id']}")).json()
    assert (detail["status"], detail["screening_hold"]) == ("pending", {"reasons": ["Текст: спам"]})
    assert len(await _notices(author)) == 1

    fake.will_say("violation", 0.9, "ads")
    again = await author.patch(f"/places/{place['id']}", json={"description": "Купите у нас."})
    assert again.json()["status"] == "pending"
    await world.ai_done()
    assert (await client.get(f"{API}/places/{place['id']}")).status_code == 404
    detail = (await author.get(f"/places/{place['id']}")).json()
    assert detail["screening_hold"] == {"reasons": ["Текст: спам", "Текст: реклама"]}
    assert len(await _notices(author)) == 1


async def test_small_items_are_held_one_by_one(world: World, client: AsyncClient) -> None:
    owner = await world.actor("owner", reputation=20)
    troll = await world.actor("troll", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    place = await world.create_place(owner, photo_ids=[await _upload(world, owner, "navy")])
    cover = place["cover_url"]
    fake = world.enable_ai()
    fake.will_say("violation", 0.95, "offensive")
    fake.photos_will_say(("violation", 0.95, ("obscene",)))
    photo = await _upload(world, troll, "red")
    assert (await troll.post(f"/places/{place['id']}/photos", json={"photo_ids": [photo]})).status_code == 200
    comment = (
        await troll.post(f"/places/{place['id']}/comments", json={"text": "Плохой комментарий"})
    ).json()
    review = (
        await troll.post(f"/places/{place['id']}/reviews", json={"rating": 1, "text": "Плохой отзыв"})
    ).json()
    note = (await troll.post("/notes", json={**CENTER, "text": "Плохая заметка"})).json()
    await world.ai_done()

    # The troll still sees everything, marked as waiting for a moderator, and is told once per item.
    seen = (await troll.get(f"/places/{place['id']}")).json()
    assert [(item["id"], item["on_review"]) for item in seen["photos"]][-1] == (photo, True)
    assert (seen["comments_count"], seen["rating_count"], seen["rating_avg"]) == (1, 1, 1.0)
    comments = (await troll.get(f"/places/{place['id']}/comments")).json()
    assert [(item["id"], item["on_review"]) for item in comments] == [(comment["id"], True)]
    reviews = (await troll.get(f"/places/{place['id']}/reviews")).json()
    assert [(item["id"], item["on_review"]) for item in reviews] == [(review["id"], True)]
    notes = (await troll.get("/notes", params={"near": NEAR})).json()
    assert [(item["id"], item["on_review"]) for item in notes] == [(note["id"], True)]
    assert (await troll.get(f"/users/{troll.id}")).json()["stats"]["reviews"] == 1
    title = place["title"]
    notices = {item["title"]: item for item in await _notices(troll)}
    assert sorted(notices) == sorted(
        [
            f"Фото к «{title}» не прошло автоматическую проверку",
            f"Комментарий к «{title}» не прошёл автоматическую проверку",
            f"Отзыв к «{title}» не прошёл автоматическую проверку",
            "Заметка на карте не прошла автоматическую проверку",
        ]
    )
    comment_notice = notices[f"Комментарий к «{title}» не прошёл автоматическую проверку"]
    assert (comment_notice["body"], comment_notice["link"]) == (
        "Что нашла проверка: Текст: оскорбления. Пока его видите только вы — модератор посмотрит и решит.",
        f"/?place={place['id']}",
    )
    assert notices[f"Фото к «{title}» не прошло автоматическую проверку"]["body"].startswith(
        "Что нашла проверка: Фото 1: непристойное."
    )
    assert notices["Заметка на карте не прошла автоматическую проверку"]["link"] == (
        f"/?at={CENTER['lat']:.6f},{CENTER['lng']:.6f}"
    )

    # The place's author and everybody else see nothing of it; the place is untouched.
    for viewer in (owner, None):

        def get(path: str, **kwargs: Any) -> Any:
            return viewer.get(path, **kwargs) if viewer else client.get(f"{API}{path}", **kwargs)  # noqa: B023

        public = (await get(f"/places/{place['id']}")).json()
        assert (public["status"], public["cover_url"], public["screening_hold"]) == (
            "unverified",
            cover,
            None,
        )
        assert photo not in [item["id"] for item in public["photos"]]
        assert not any(item["on_review"] for item in public["photos"])
        assert (public["comments_count"], public["rating_count"]) == (0, 0)
        assert await _ids(await get(f"/places/{place['id']}/comments")) == []
        assert await _ids(await get(f"/places/{place['id']}/reviews")) == []
        assert note["id"] not in await _ids(await get("/notes", params={"near": NEAR}))
        assert (await get(f"/users/{troll.id}")).json()["stats"]["reviews"] == 0
        assert [entry["kind"] for entry in (await get(f"/places/{place['id']}/history")).json()] == [
            "created"
        ]
    assert (await owner.get("/notifications")).json() == []
    assert (await owner.post(f"/notes/{note['id']}/report")).status_code == 404

    held = (await moderator.get("/moderation/held")).json()
    assert {item["kind"] for item in held} == {"photo", "comment", "review", "note"}
    assert all(item["author"]["id"] == troll.id for item in held)
    assert (await moderator.get("/moderation/queue")).json() == []
    assert (await moderator.get("/moderation/summary")).json()["held_items"] == 4
    by_kind = {item["kind"]: item for item in held}
    assert by_kind["photo"]["place"] == {"id": place["id"], "title": place["title"]}
    assert by_kind["comment"]["text"] == "Плохой комментарий"
    assert by_kind["review"]["rating"] == 1
    assert by_kind["photo"]["ai_review"]["categories"] == ["obscene"]
    assert await _standing(world, troll) == 50 - 8 * 4

    reason = {"reason": "Проверено вручную"}
    assert (
        await moderator.post(f"/moderation/held/{by_kind['comment']['id']}/release", json=reason)
    ).status_code == 204
    assert (
        await moderator.post(f"/moderation/held/{by_kind['photo']['id']}/release", json=reason)
    ).status_code == 204
    assert (
        await moderator.post(f"/moderation/held/{by_kind['review']['id']}/remove", json=reason)
    ).status_code == 204
    assert (
        await moderator.post(f"/moderation/held/{by_kind['note']['id']}/remove", json=reason)
    ).status_code == 204
    assert (
        await moderator.post(f"/moderation/held/{by_kind['note']['id']}/remove", json=reason)
    ).status_code == 409

    public = (await client.get(f"{API}/places/{place['id']}")).json()
    assert (public["comments_count"], public["rating_count"]) == (1, 0)
    assert photo in [item["id"] for item in public["photos"]]
    assert await _ids(await client.get(f"{API}/places/{place['id']}/comments")) == [comment["id"]]
    assert [entry["kind"] for entry in (await client.get(f"{API}/places/{place['id']}/history")).json()] == [
        "photos_added",
        "created",
    ]
    assert [item["kind"] for item in (await owner.get("/notifications")).json()] == ["comment"]
    assert [item["title"] for item in await _notices(troll)][:4] == [
        "Ваша заметка удалена модератором",
        "Ваш отзыв удалён модератором",
        "Ваше фото проверено и опубликовано",
        "Ваш комментарий проверен и опубликован",
    ]
    assert len(await _notices(troll)) == 8
    comments = (await troll.get(f"/places/{place['id']}/comments")).json()
    assert [(item["id"], item["on_review"]) for item in comments] == [(comment["id"], False)]
    assert await _ids(await troll.get(f"/places/{place['id']}/reviews")) == []
    assert await _standing(world, troll) == 50 - 32 + 8 + 8 - 15 - 15
    async with world.session() as session:
        log = list(await session.scalars(select(ModerationLog).order_by(ModerationLog.id)))
    assert [(entry.action.value, entry.target_type) for entry in log] == [
        ("release", AiTarget.COMMENT),
        ("release", AiTarget.PHOTO),
        ("remove", AiTarget.REVIEW),
        ("remove", AiTarget.NOTE),
    ]
    assert (await moderator.get("/moderation/held")).json() == []


async def test_a_held_photo_on_an_imported_place_leaves_the_place_alone(
    world: World, client: AsyncClient
) -> None:
    async with world.session() as session:
        system = User(
            email="osm@example.com",
            username="osm",
            display_name="OpenStreetMap",
            password_hash="x",
            is_system=True,
            created_at=world.clock_now(),
        )
        session.add(system)
        category = await session.scalar(select(Category).where(Category.slug == "toilet"))
        payload = PlaceInput(
            layer="infrastructure", category_id=category.id, title="Общественный туалет", **CENTER
        )
        imported = await places.insert_place(
            session,
            system,
            category,
            payload,
            attributes={},
            status="preliminary",
            now=world.clock_now(),
            external=ExternalRef(ExternalSourceId.OSM, "osm:1", "https://www.openstreetmap.org/node/1"),
        )
        await session.commit()
        place_id = imported.id
    visitor = await world.actor("visitor", reputation=20)
    fake = world.enable_ai()
    fake.photos_will_say(("violation", 0.95, ("obscene",)))
    photo = await _upload(world, visitor)
    await visitor.post(f"/places/{place_id}/photos", json={"photo_ids": [photo]})
    await world.ai_done()
    assert len(fake.photo_calls) == 1
    public = (await client.get(f"{API}/places/{place_id}")).json()
    assert (public["status"], public["photos"], public["cover_url"]) == ("preliminary", [], None)
    mine = (await visitor.get(f"/places/{place_id}")).json()
    assert [(item["id"], item["on_review"]) for item in mine["photos"]] == [(photo, True)]
    assert (mine["status"], mine["screening_hold"]) == ("preliminary", None)
    [notice] = await _notices(visitor)
    assert notice["title"] == "Фото к «Общественный туалет» не прошло автоматическую проверку"


async def test_profanity_is_masked_for_everyone_but_the_author_and_moderators(
    world: World, client: AsyncClient
) -> None:
    author = await world.actor("author", reputation=20)
    commenter = await world.actor("commenter", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    place = await world.create_place(
        author, "roads", title="Яма, блядь, опять", description="Пиздец какая глубокая яма.", tags=["хуйня"]
    )
    assert place["status"] == "unverified"
    assert (await author.get(f"/places/{place['id']}")).json()["title"] == "Яма, блядь, опять"
    assert (await moderator.get(f"/places/{place['id']}")).json()[
        "description"
    ] == "Пиздец какая глубокая яма."
    public = (await client.get(f"{API}/places/{place['id']}")).json()
    assert (public["title"], public["description"], public["tags"]) == (
        "Яма, б***ь, опять",
        "П****ц какая глубокая яма.",
        ["х***я"],
    )
    found = (await client.get(f"{API}/places", params={"q": "блядь"})).json()
    assert [(item["id"], item["title"]) for item in found] == [(place["id"], "Яма, б***ь, опять")]

    comment = await commenter.post(f"/places/{place['id']}/comments", json={"text": "Да похуй всем"})
    assert comment.status_code == 201
    assert comment.json()["text"] == "Да похуй всем"
    assert [item["text"] for item in (await client.get(f"{API}/places/{place['id']}/comments")).json()] == [
        "Да п***й всем"
    ]
    toilet = await world.create_place(author)
    review = await commenter.post(
        f"/places/{toilet['id']}/reviews", json={"rating": 2, "text": "Сука, грязно"}
    )
    assert review.status_code == 200
    assert [item["text"] for item in (await client.get(f"{API}/places/{toilet['id']}/reviews")).json()] == [
        "С**а, грязно"
    ]
    notice = (await author.get("/notifications")).json()[-1]
    assert notice["body"] == "«Яма, б***ь, опять»: Да п***й всем"

    await commenter.patch("/users/me", json={"display_name": "Мудак Иванов"})
    assert (await commenter.get("/auth/me")).json()["display_name"] == "Мудак Иванов"
    assert (await client.get(f"{API}/users/{commenter.id}")).json()["display_name"] == "М***к Иванов"


async def test_a_route_stop_photo_holds_its_route(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    fake = world.enable_ai()
    photo = await _upload(world, author, "red")
    fake.photos_will_say(("violation", 0.9, ("advertising",)))
    stops = [
        {"title": "Старт", "lat": 43.11, "lng": 131.88, "photo_ids": [photo]},
        {"title": "Финиш", "lat": 43.12, "lng": 131.89},
    ]
    route = (await author.post("/routes", json={"title": "Прогулка", "kind": "walk", "stops": stops})).json()
    await world.ai_done()
    assert len(fake.photo_calls) == 1
    assert (await client.get(f"{API}/routes/{route['id']}")).status_code == 404
    mine = (await author.get(f"/routes/{route['id']}")).json()
    assert (mine["status"], mine["stops"][0]["photos"][0]["id"]) == ("pending", photo)
    assert (mine["screening_hold"], mine["stops"][0]["photos"][0]["on_review"]) == (
        {"reasons": ["Фото 1: реклама"]},
        True,
    )
    [notice] = await _notices(author)
    assert (notice["title"], notice["link"]) == (
        "Маршрут «Прогулка» не прошёл автоматическую проверку",
        f"/routes/{route['id']}",
    )
    case = (await moderator.get("/moderation/queue")).json()[0]
    detail = (await moderator.get(f"/moderation/cases/{case['id']}")).json()
    assert (case["triggers"], detail["photo_reviews"][0]["state"]) == (["auto_image"], "held")
    await moderator.post(
        f"/moderation/cases/{case['id']}/resolve", json={"action": "hide", "reason": "Реклама"}
    )
    hidden = (await author.get(f"/routes/{route['id']}")).json()
    assert (hidden["status"], hidden["screening_hold"], hidden["stops"][0]["photos"]) == ("hidden", None, [])
    assert (await _notices(author))[0]["title"] == "Публикация скрыта модератором"


async def test_an_event_series_is_decided_together(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    fake = world.enable_ai()
    fake.will_say("violation", 0.9, "ads")
    first = await world.create_place(
        author, "culture", event={**world.event_window(), "repeat": {"interval_days": 7, "count": 3}}
    )
    await world.ai_done()
    assert len(fake.calls) == 1
    occurrences = [item for item in (await author.get("/places")).json() if item["layer"] == "event"]
    assert len(occurrences) == 3
    for occurrence in occurrences:
        seen = (await author.get(f"/places/{occurrence['id']}")).json()
        assert (seen["status"], seen["screening_hold"]) == ("pending", {"reasons": ["Текст: реклама"]})
    assert len(await _notices(author)) == 1
    assert (await client.get(f"{API}/events")).json() == []
    assert (await author.get(f"/places/{first['id']}/event/participants")).status_code == 200
    complaint = await author.post(
        "/complaints", json={"target_type": "place", "target_id": first["id"], "reason": "spam"}
    )
    assert complaint.status_code == 400
    case = (await moderator.get("/moderation/queue")).json()[0]
    await moderator.post(
        f"/moderation/cases/{case['id']}/resolve", json={"action": "approve", "reason": "Обычное событие"}
    )
    assert len((await client.get(f"{API}/events")).json()) == 3


async def test_usefulness_breaks_trust_ties_and_is_read_in_one_query(world: World) -> None:
    author = await world.actor("author", reputation=20)
    first = await world.create_place(author)
    second = await world.create_place(author)
    async with world.session() as session:
        session.add_all(
            [
                PlaceQuality(place_id=first["id"], usefulness=90, model="m", updated_at=world.clock_now()),
                PlaceQuality(place_id=second["id"], usefulness=10, model="m", updated_at=world.clock_now()),
            ]
        )
        await session.commit()
        assert await place_quality.usefulness_for(session, [first["id"], second["id"], 999]) == {
            first["id"]: 90,
            second["id"]: 10,
        }
    top = (await world.http.get(f"{API}/places", params={"limit": 1})).json()
    assert [item["id"] for item in top] == [first["id"]]
    assert "usefulness" not in top[0]


async def test_a_held_item_stays_held_after_an_edit_and_own_lists_show_it_pending(
    world: World, client: AsyncClient
) -> None:
    author = await world.actor("author", reputation=200)
    fake = world.enable_ai()
    fake.will_say("violation", 0.9, "spam")
    place = await world.create_place(author)
    await world.ai_done()
    assert (await author.get(f"/places/{place['id']}")).json()["status"] == "pending"
    own = await author.get("/places", params={"min_status": "preliminary"})
    assert place["id"] not in [item["id"] for item in own.json()]
    assert place["id"] in await _ids(await author.get("/places"))

    fake.will_say("ok", 0.95)
    await author.patch(f"/places/{place['id']}", json={"description": "Теперь всё прилично."})
    await world.ai_done()
    assert (await client.get(f"{API}/places/{place['id']}")).status_code == 404
    assert len(fake.calls) == 2


async def test_withdrawing_a_held_comment_closes_its_case(world: World) -> None:
    owner = await world.actor("owner", reputation=20)
    troll = await world.actor("troll", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    place = await world.create_place(owner)
    fake = world.enable_ai()
    fake.will_say("violation", 0.9, "offensive")
    comment = (
        await troll.post(f"/places/{place['id']}/comments", json={"text": "Плохой комментарий"})
    ).json()
    note = (await troll.post("/notes", json={**CENTER, "text": "Плохая заметка"})).json()
    await world.ai_done()
    assert len((await moderator.get("/moderation/held")).json()) == 2
    assert (await troll.delete(f"/comments/{comment['id']}")).status_code == 204
    assert (await troll.delete(f"/notes/{note['id']}")).status_code == 204
    assert (await moderator.get("/moderation/held")).json() == []
    assert (await moderator.get("/moderation/summary")).json()["held_items"] == 0


async def test_gpx_and_notes_are_masked_too(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    stops = [
        {"title": "Старт у пиздатого вида", "lat": 43.11, "lng": 131.88},
        {"title": "Финиш", "lat": 43.12, "lng": 131.89},
    ]
    route = (
        await author.post("/routes", json={"title": "Охуенная прогулка", "kind": "walk", "stops": stops})
    ).json()
    public_gpx = (await client.get(f"{API}/routes/{route['id']}/gpx")).text
    assert "О******я прогулка" in public_gpx
    assert "п*******о" in public_gpx
    assert "Охуенная прогулка" in (await author.get(f"/routes/{route['id']}/gpx")).text
    await author.post("/notes", json={**CENTER, "text": "Вход со двора, блядь"})
    notes = (await client.get(f"{API}/notes", params={"near": NEAR})).json()
    assert [item["text"] for item in notes] == ["Вход со двора, б***ь"]


async def test_a_hold_caused_by_low_standing_says_nothing_about_it(world: World) -> None:
    author = await world.actor("author", reputation=20)
    async with world.session() as session:
        session.add(AuthorStanding(user_id=author.id, score=20, updated_at=world.clock_now()))
        await session.commit()
    fake = world.enable_ai()
    fake.will_say("suspicious", 0.3, "ads", summary="Похоже на рекламу, но не уверен.")
    place = await world.create_place(author)
    await world.ai_done()

    detail = (await author.get(f"/places/{place['id']}")).json()
    assert (detail["status"], detail["screening_hold"]) == (
        "pending",
        {"reasons": ["Нужна ручная проверка модератора"]},
    )
    [notice] = await _notices(author)
    assert notice["body"].startswith("Что нашла проверка: Нужна ручная проверка модератора. ")
    assert not any(word in notice["body"] for word in ("оценка", "уверенность", "рекламу"))


async def test_approving_a_held_place_of_a_newcomer_publishes_it(world: World) -> None:
    author = await world.actor("author")
    other = await world.actor("other", reputation=60)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    await other.post(
        "/me/subscriptions",
        json={"title": "Центр", **CENTER, "radius_m": 5000, "layers": ["infrastructure"]},
    )
    fake = world.enable_ai()
    fake.will_say("ok", 0.9, usefulness=5)
    place = await world.create_place(author, title="цук место")
    assert place["status"] == "unverified"
    await world.ai_done()
    detail = (await author.get(f"/places/{place['id']}")).json()
    assert detail["screening_hold"] == {"reasons": ["Текст: слишком мало сведений о месте"]}
    history = (await author.get(f"/places/{place['id']}/history")).json()
    assert [entry["kind"] for entry in history] == ["status_changed", "created"]

    case = (await moderator.get("/moderation/queue")).json()[0]
    assert set(case["triggers"]) == {"auto_ai"}
    await moderator.post(
        f"/moderation/cases/{case['id']}/resolve", json={"action": "approve", "reason": "Годится"}
    )
    detail = (await author.get(f"/places/{place['id']}")).json()
    assert (detail["status"], detail["screening_hold"]) == ("unverified", None)
    assert [item["title"] for item in await _notices(author)] == [
        "Публикация одобрена модератором",
        "Публикация «цук место» не прошла автоматическую проверку",
    ]
    # Nothing was waiting for pre-moderation: the approval returns the place, it is not a reward.
    assert (await author.get("/auth/me")).json()["reputation"] == 0
    assert [item["kind"] for item in await _notices(other)] == ["territory"]
    assert await _standing(world, author) == 50
