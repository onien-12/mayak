"""Interests (SPEC §23): profile endpoints, rule tags, signals, recommendations, personal interest."""

from datetime import datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import event, select, update

from app.domain import interests as rules
from app.domain.enums import PlaceStatus
from app.models import Place, UserInterest
from app.services.interests import tags as interest_tags
from tests.conftest import API, Actor, World

TRUSTED = 60
M_LAT = 1 / 111_320


def spot(index: int, north_m: float = 0.0) -> dict[str, float]:
    """Points 200 m apart east-west, so the "3 places within 150 m" limit never interferes."""
    return {"lat": 43.10 + north_m * M_LAT, "lng": 131.95 + index * 0.0025}


async def place_topics(world: World, place_id: int) -> list[str]:
    response = await world.http.get(f"{API}/places/{place_id}")
    assert response.status_code == 200, response.text
    return response.json()["topics"]


async def affinity(world: World, actor: Actor) -> dict[str, float]:
    async with world.session() as session:
        rows = await session.scalars(select(UserInterest).where(UserInterest.user_id == actor.id))
        return {row.topic.value: round(row.affinity, 4) for row in rows if row.affinity}


async def set_status(world: World, place_id: int, status: PlaceStatus) -> None:
    async with world.session() as session:
        await session.execute(update(Place).where(Place.id == place_id).values(status=status))
        await session.commit()


async def recommendations(http: AsyncClient | Actor, **params: Any) -> dict[str, Any]:
    if isinstance(http, Actor):
        response = await http.get("/recommendations", params=params)
    else:
        response = await http.get(f"{API}/recommendations", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def ids(result: dict[str, Any]) -> list[tuple[str, int]]:
    return [(item["type"], (item["area"] or item["place"])["id"]) for item in result["items"]]


async def test_topics_catalogue(client: AsyncClient) -> None:
    topics = (await client.get(f"{API}/interests/topics")).json()
    assert [topic["slug"] for topic in topics] == [info.slug.value for info in rules.CATALOGUE]
    assert topics[0] == {
        "slug": "sea",
        "label": "Море и берег",
        "description": "набережные, пляжи, бухты, маяки, острова, яхты",
    }


async def test_my_interests_flow_and_validation(world: World, client: AsyncClient) -> None:
    assert (await client.get(f"{API}/me/interests")).status_code == 401
    assert (await client.put(f"{API}/me/interests", json={"topics": ["sea"]})).status_code == 401
    user = await world.actor("user")
    assert (await user.get("/me/interests")).json() == {"topics": [], "noticed": [], "onboarded": False}

    saved = await user.put("/me/interests", json={"topics": ["history", "sea", "history"]})
    assert saved.status_code == 200, saved.text
    assert saved.json() == {"topics": ["sea", "history"], "noticed": [], "onboarded": True}

    unknown = await user.put("/me/interests", json={"topics": ["sea", "cats"]})
    assert unknown.status_code == 422
    assert unknown.json()["code"] == "validation_error"
    assert (await user.put("/me/interests", json={"topics": ["sea"] * 14})).status_code == 422

    skipped = await user.put("/me/interests", json={"topics": []})
    assert skipped.json() == {"topics": [], "noticed": [], "onboarded": True}


async def test_the_profile_is_private(world: World, client: AsyncClient) -> None:
    owner = await world.actor("owner")
    other = await world.actor("other")
    await owner.put("/me/interests", json={"topics": ["art"]})
    for body in (
        (await client.get(f"{API}/users/{owner.id}")).json(),
        (await other.get(f"/users/{owner.id}")).json(),
        (await owner.get("/auth/me")).json(),
    ):
        assert "interests" not in body
        assert "topics" not in body
    assert (await other.get("/me/interests")).json()["topics"] == []


async def test_rule_tags_on_create_and_edit(world: World) -> None:
    author = await world.actor("author", reputation=TRUSTED)
    fort = await world.create_place(
        author, "historic", title="Форт №7", description="Подземные ходы у моря.", **spot(0)
    )
    assert fort["topics"] == ["history", "sea", "unusual"]

    toilet = await world.create_place(author, "toilet", **spot(1))
    assert toilet["topics"] == []
    issue = await world.create_place(author, "roads", title="Яма у набережной", **spot(2))
    assert issue["topics"] == []

    edited = await author.patch(f"/places/{fort['id']}", json={"description": "Джазовый вечер в казарме."})
    assert edited.status_code == 200
    assert edited.json()["topics"] == ["history", "music"]
    assert await place_topics(world, fort["id"]) == ["history", "music"]


async def test_area_topics_from_kind_and_places_inside(world: World, client: AsyncClient) -> None:
    trusted = await world.actor("trusted", reputation=TRUSTED)
    area = (
        await trusted.post(
            "/areas",
            json={"title": "Пляж Шамора", "kind": "beach", **spot(0), "radius_m": 700},
        )
    ).json()
    assert area["topics"] == ["sea"]
    for index in (-1, 0, 1):
        await world.create_place(trusted, "playground", **spot(index, north_m=300))
    detail = (await client.get(f"{API}/areas/{area['id']}")).json()
    assert detail["topics"] == ["sea", "family"]


async def test_favorite_and_collection_signals(world: World) -> None:
    author = await world.actor("author", reputation=TRUSTED)
    fan = await world.actor("fan")
    first = await world.create_place(author, "historic", **spot(0))
    second = await world.create_place(author, "historic", **spot(1))

    assert (await fan.put(f"/places/{first['id']}/favorite")).status_code == 204
    assert (await fan.put(f"/places/{first['id']}/favorite")).status_code == 204
    assert await affinity(world, fan) == {"history": 0.8}
    assert (await fan.get("/me/interests")).json()["noticed"] == []

    collection = (await fan.post("/collections", json={"title": "Крепость"})).json()
    assert (await fan.put(f"/collections/{collection['id']}/places/{second['id']}")).status_code == 204
    assert await affinity(world, fan) == {"history": 1.6}
    assert (await fan.get("/me/interests")).json() == {
        "topics": [],
        "noticed": ["history"],
        "onboarded": False,
    }

    assert (await fan.delete(f"/collections/{collection['id']}/places/{second['id']}")).status_code == 204
    assert (await fan.delete(f"/collections/{collection['id']}/places/{second['id']}")).status_code == 204
    assert (await fan.delete(f"/places/{first['id']}/favorite")).status_code == 204
    assert (await fan.delete(f"/places/{first['id']}/favorite")).status_code == 204
    assert await affinity(world, fan) == {}


async def test_review_signal_moves_by_the_difference(world: World) -> None:
    author = await world.actor("author", reputation=TRUSTED)
    critic = await world.actor("critic")
    place = await world.create_place(author, "viewpoint", **spot(0))

    assert (
        await critic.post(f"/places/{place['id']}/reviews", json={"rating": 5, "text": ""})
    ).status_code == 200
    assert await affinity(world, critic) == {"views": 0.8}
    await critic.post(f"/places/{place['id']}/reviews", json={"rating": 1, "text": "Всё заросло."})
    assert await affinity(world, critic) == {"views": -0.48}
    await critic.post(f"/places/{place['id']}/reviews", json={"rating": 3, "text": ""})
    assert await affinity(world, critic) == {}


async def test_event_participation_signal(world: World) -> None:
    organizer = await world.actor("organizer", reputation=TRUSTED)
    guest = await world.actor("guest")
    concert = await world.create_place(
        organizer, "culture", title="Вечер в зале", event=world.event_window(), **spot(0)
    )
    path = f"/places/{concert['id']}/event/participation"
    assert (await guest.put(path)).status_code == 200
    assert (await guest.put(path)).status_code == 200
    assert await affinity(world, guest) == {"art": 0.64}
    assert (await guest.delete(path)).status_code == 200
    assert (await guest.delete(path)).status_code == 200
    assert await affinity(world, guest) == {}


async def test_search_signal_once_per_topic_per_day(world: World, client: AsyncClient) -> None:
    body = {"kind": "search", "q": "джаз в парке"}
    assert (await client.post(f"{API}/me/interests/signals", json=body)).status_code == 401
    user = await world.actor("user")
    assert (await user.post("/me/interests/signals", json=body)).status_code == 204
    assert await affinity(world, user) == {"music": 0.3, "nature": 0.3}
    assert (
        await user.post("/me/interests/signals", json={"kind": "search", "q": "джазовый клуб"})
    ).status_code == 204
    assert await affinity(world, user) == {"music": 0.3, "nature": 0.3}

    world.clock.shift(timedelta(hours=25))
    await user.post("/me/interests/signals", json={"kind": "search", "q": "джаз"})
    assert await affinity(world, user) == {"music": 0.6, "nature": 0.3}

    assert (await user.post("/me/interests/signals", json={"kind": "search", "q": "дж"})).status_code == 422
    assert (await user.post("/me/interests/signals", json={"kind": "click", "q": "джаз"})).status_code == 422
    assert (
        await user.post("/me/interests/signals", json={"kind": "search", "q": "x" * 101})
    ).status_code == 422
    assert (
        await user.post("/me/interests/signals", json={"kind": "search", "q": "абвгд"})
    ).status_code == 204


async def test_forget_noticed_keeps_chosen(world: World) -> None:
    author = await world.actor("author", reputation=TRUSTED)
    user = await world.actor("user")
    for index in range(2):
        place = await world.create_place(author, "historic", **spot(index))
        await user.put(f"/places/{place['id']}/favorite")
    await user.put("/me/interests", json={"topics": ["sea"]})
    assert (await user.get("/me/interests")).json() == {
        "topics": ["sea"],
        "noticed": ["history"],
        "onboarded": True,
    }

    forgotten = await user.delete("/me/interests/noticed")
    assert forgotten.status_code == 200
    assert forgotten.json() == {"topics": ["sea"], "noticed": [], "onboarded": True}
    assert await affinity(world, user) == {}


async def test_a_failed_signal_never_fails_the_action(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    author = await world.actor("author", reputation=TRUSTED)
    fan = await world.actor("fan")
    place = await world.create_place(author, "historic", **spot(0))

    async def broken(*_: Any, **__: Any) -> None:
        raise RuntimeError("tags are unavailable")

    monkeypatch.setattr(interest_tags, "for_target", broken)
    assert (await fan.put(f"/places/{place['id']}/favorite")).status_code == 204
    favourites = (await fan.get("/me/favorites")).json()
    assert [card["id"] for card in favourites["places"]] == [place["id"]]
    assert await affinity(world, fan) == {}


async def test_recommendations_without_a_profile(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=TRUSTED)
    await world.create_place(author, "historic", **spot(0))
    assert await recommendations(client) == {"personalized": False, "items": []}
    user = await world.actor("user")
    assert await recommendations(user) == {"personalized": False, "items": []}
    assert await recommendations(user, scope="events") == {"personalized": False, "items": []}
    assert (await client.get(f"{API}/recommendations", params={"topics": "cats"})).status_code == 422
    assert (await client.get(f"{API}/recommendations", params={"scope": "routes"})).status_code == 422
    assert (await client.get(f"{API}/recommendations", params={"limit": 31})).status_code == 422


async def test_recommendations_for_a_visitor_order_by_score(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=TRUSTED)
    fort = await world.create_place(author, "historic", title="Форт у моря", **spot(0))
    plain = await world.create_place(author, "historic", **spot(1))
    beach = await world.create_place(author, "nature", title="Бухта Лазурная", **spot(2))
    await world.create_place(author, "food", **spot(3))
    await world.create_place(author, "library", title="Библиотека истории", **spot(4))

    result = await recommendations(client, topics="history,sea")
    assert result["personalized"] is True
    assert ids(result) == [("place", fort["id"]), ("place", plain["id"]), ("place", beach["id"])]
    first = result["items"][0]
    assert first["topics"] == ["history", "sea"]
    assert first["area"] is None
    assert first["place"]["title"] == "Форт у моря"
    assert result["items"][2]["topics"] == ["sea"]
    scores = [item["score"] for item in result["items"]]
    assert scores == sorted(scores, reverse=True)
    assert all(0 < score <= 1 for score in scores)

    boxed = await recommendations(client, topics="history,sea", bbox="131.949,43.09,131.951,43.11")
    assert ids(boxed) == [("place", fort["id"])]
    assert len((await recommendations(client, topics="history,sea", limit=1))["items"]) == 1


async def test_recommendations_exclude_what_is_not_for_the_person(world: World) -> None:
    author = await world.actor("author", reputation=TRUSTED)
    viewer = await world.actor("viewer", reputation=TRUSTED)
    await viewer.put("/me/interests", json={"topics": ["history", "learning"]})
    shown = await world.create_place(author, "historic", **spot(0))
    await world.create_place(viewer, "historic", **spot(1))
    favourite = await world.create_place(author, "historic", **spot(2))
    disputed = await world.create_place(author, "historic", **spot(3))
    hidden = await world.create_place(author, "historic", **spot(4))
    await world.create_place(author, "library", **spot(5))
    await viewer.put(f"/places/{favourite['id']}/favorite")
    await set_status(world, disputed["id"], PlaceStatus.NEEDS_REVIEW)
    await set_status(world, hidden["id"], PlaceStatus.HIDDEN)

    assert ids(await recommendations(viewer)) == [("place", shown["id"])]


async def test_weak_matches_are_not_recommended(world: World) -> None:
    author = await world.actor("author", reputation=TRUSTED)
    user = await world.actor("user")
    await world.create_place(author, "culture_space", title="Джазовый клуб", **spot(0))
    await user.post("/me/interests/signals", json={"kind": "search", "q": "джаз"})
    assert await recommendations(user) == {"personalized": True, "items": []}


async def test_at_most_three_results_share_a_leading_topic(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=TRUSTED)
    for index in range(5):
        await world.create_place(author, "historic", **spot(index))
    bays = [
        await world.create_place(author, "viewpoint", title=title, **spot(5 + index))
        for index, title in enumerate(("Вид на бухту Улисс", "Бухта Патрокл"))
    ]
    result = await recommendations(client, topics="history,sea")
    leading = [item["topics"][0] for item in result["items"]]
    # The cap shapes the top of the list; the passed-over ones follow, so nothing is lost.
    assert leading == ["history", "history", "history", "sea", "sea", "history", "history"]
    assert {item["place"]["id"] for item in result["items"][3:5]} == {bay["id"] for bay in bays}


async def test_a_signed_in_profile_wins_over_the_topics_param(world: World) -> None:
    author = await world.actor("author", reputation=TRUSTED)
    viewer = await world.actor("viewer")
    history = await world.create_place(author, "historic", **spot(0))
    food = await world.create_place(author, "food", **spot(1))
    assert ids(await recommendations(viewer, topics="food")) == [("place", food["id"])]
    await viewer.put("/me/interests", json={"topics": ["history"]})
    assert ids(await recommendations(viewer, topics="food")) == [("place", history["id"])]


async def test_areas_are_recommended_with_their_personal_interest(world: World, client: AsyncClient) -> None:
    trusted = await world.actor("trusted", reputation=TRUSTED)
    area = (
        await trusted.post(
            "/areas", json={"title": "Пляж Шамора", "kind": "beach", **spot(0), "radius_m": 300}
        )
    ).json()
    # Nothing residents made inside yet: a bare location needs a clearly stronger match than one topic.
    assert (await recommendations(client, topics="sea"))["items"] == []
    await world.create_place(trusted, **spot(0))
    result = await recommendations(client, topics="sea")
    assert ids(result) == [("area", area["id"])]
    card = result["items"][0]["area"]
    assert card["personal_interest"] == {
        "value": rules.personal_interest(card["interest"], 0.48),
        "topics": ["sea"],
    }
    assert result["items"][0]["topics"] == ["sea"]
    assert result["items"][0]["place"] is None
    assert result["items"][0]["reason_event"] is None
    # The author of a location does not get it recommended.
    await trusted.put("/me/interests", json={"topics": ["sea"]})
    assert (await recommendations(trusted))["items"] == []


async def test_a_residents_event_raises_its_location_and_its_venue(world: World, client: AsyncClient) -> None:
    trusted = await world.actor("trusted", reputation=TRUSTED)
    organizer = await world.actor("organizer", reputation=TRUSTED)
    square = (
        await trusted.post(
            "/areas", json={"title": "Сквер Тобольский", "kind": "square", **spot(0), "radius_m": 150}
        )
    ).json()
    assert (await recommendations(client, topics="sport"))["items"] == []

    run = await world.create_place(
        organizer, "sport", title="Забег с собаками", event=world.event_window(24), **spot(0)
    )
    result = await recommendations(client, topics="sport")
    assert ids(result) == [("area", square["id"])]
    item = result["items"][0]
    assert item["topics"] == ["sport"]
    assert (item["reason_event"]["id"], item["reason_event"]["title"]) == (run["id"], "Забег с собаками")
    assert item["area"]["community_events_upcoming"] == 1
    assert item["area"]["next_community_event"]["id"] == run["id"]
    # The same event is no reason for a person who does not care for sport.
    assert (await recommendations(client, topics="history"))["items"] == []

    # A sight that is the venue of a residents' lecture is raised for those who like lectures.
    yard = await world.create_place(trusted, "unusual", title="Двор с аркой", **spot(4))
    lecture = await world.create_place(
        organizer,
        "education",
        title="Лекция о старых дворах",
        event={**world.event_window(48), "venue_place_id": yard["id"]},
        **spot(4, 30),
    )
    raised = await recommendations(client, topics="learning")
    assert ("place", yard["id"]) in ids(raised)
    venue = next(entry for entry in raised["items"] if entry["place"] and entry["place"]["id"] == yard["id"])
    assert venue["reason_event"]["id"] == lecture["id"]
    assert venue["topics"] == ["learning"]


async def test_events_scope(world: World, client: AsyncClient) -> None:
    organizer = await world.actor("organizer", reputation=TRUSTED)
    viewer = await world.actor("viewer")
    other = await world.actor("other")
    await viewer.put("/me/interests", json={"topics": ["art"]})

    open_event = await world.create_place(organizer, "culture", event=world.event_window(48), **spot(0))
    later = await world.create_place(organizer, "culture", event=world.event_window(24 * 10), **spot(1))
    full = await world.create_place(
        organizer, "culture", event={**world.event_window(48), "capacity": 1}, **spot(2)
    )
    cancelled = await world.create_place(organizer, "culture", event=world.event_window(48), **spot(3))
    joined = await world.create_place(organizer, "culture", event=world.event_window(48), **spot(4))
    soon_over = await world.create_place(organizer, "culture", event=world.event_window(1, 1), **spot(5))
    await world.create_place(organizer, "culture_space", **spot(6))
    await other.put(f"/places/{full['id']}/event/participation")
    await organizer.patch(f"/places/{cancelled['id']}", json={"event": {"is_cancelled": True}})
    await viewer.put(f"/places/{joined['id']}/event/participation")
    # Equal match and quality: the sooner event comes first.
    assert ids(await recommendations(viewer, scope="events")) == [
        ("place", soon_over["id"]),
        ("place", open_event["id"]),
        ("place", later["id"]),
    ]

    world.clock.shift(timedelta(hours=3))
    result = await recommendations(viewer, scope="events")
    assert {place_id for _, place_id in ids(result)} == {open_event["id"], later["id"]}
    assert all(item["place"]["event"] is not None for item in result["items"])
    before_later = datetime.fromisoformat(later["event"]["starts_at"]) - timedelta(days=1)
    in_window = await recommendations(viewer, scope="events", to=before_later.isoformat())
    assert ids(in_window) == [("place", open_event["id"])]
    anonymous = await recommendations(client, scope="events", topics="art")
    assert {place_id for _, place_id in ids(anonymous)} == {open_event["id"], later["id"], joined["id"]}


async def test_personal_interest_on_areas(world: World, client: AsyncClient) -> None:
    trusted = await world.actor("trusted", reputation=TRUSTED)
    viewer = await world.actor("viewer")
    area = (
        await trusted.post(
            "/areas", json={"title": "Пляж Шамора", "kind": "beach", **spot(0), "radius_m": 900}
        )
    ).json()
    await world.create_place(trusted, "viewpoint", **spot(1))
    interest = (await client.get(f"{API}/areas/{area['id']}")).json()["interest"]
    assert interest > 0

    anonymous = (await client.get(f"{API}/areas")).json()
    assert anonymous[0]["personal_interest"] is None
    assert (await client.get(f"{API}/areas/{area['id']}")).json()["personal_interest"] is None

    tags = {rules.Topic.SEA: 0.8, rules.Topic.VIEWS: 0.55}
    sea = (await client.get(f"{API}/areas", params={"topics": "sea"})).json()[0]["personal_interest"]
    expected = rules.personal_interest(interest, rules.match({rules.Topic.SEA: 0.6}, tags))
    assert sea == {"value": expected, "topics": ["sea"]}
    assert expected > interest
    assert (
        sea["value"]
        == (await client.get(f"{API}/areas/{area['id']}", params={"topics": "sea"})).json()[
            "personal_interest"
        ]["value"]
    )

    lectures = (await client.get(f"{API}/areas", params={"topics": "learning"})).json()[0]
    assert lectures["personal_interest"] == {"value": rules.personal_interest(interest, 0.0), "topics": []}
    assert lectures["interest"] == interest
    assert (await client.get(f"{API}/areas", params={"topics": "cats"})).status_code == 422

    await viewer.put("/me/interests", json={"topics": ["views"]})
    mine = (await viewer.get("/areas", params={"topics": "sea"})).json()[0]["personal_interest"]
    assert mine["topics"] == ["views"]
    assert (await viewer.get(f"/areas/{area['id']}")).json()["personal_interest"]["topics"] == ["views"]


async def test_lists_keep_a_fixed_number_of_queries(world: World, app: Any, client: AsyncClient) -> None:
    trusted = await world.actor("trusted", reputation=TRUSTED)
    statements: list[str] = []

    def record(*args: Any) -> None:
        statements.append(args[2])

    async def count(path: str, params: dict[str, str]) -> int:
        statements.clear()
        response = await client.get(f"{API}{path}", params=params)
        assert response.status_code == 200
        return len(statements)

    # Every beach gets a residents' place inside: an empty one would not be recommended at all.
    await trusted.post("/areas", json={"title": "Пляж 0", "kind": "beach", **spot(0, 2000), "radius_m": 60})
    await world.create_place(trusted, **spot(0, 2000))
    await world.create_place(trusted, "historic", **spot(0))
    engine = app.state.database.engine.sync_engine
    event.listen(engine, "before_cursor_execute", record)
    try:
        areas_one = await count("/areas", {"topics": "sea"})
        recs_one = await count("/recommendations", {"topics": "sea,history"})
        for index in range(1, 5):
            await trusted.post(
                "/areas",
                json={"title": f"Пляж {index}", "kind": "beach", **spot(index, 2000), "radius_m": 60},
            )
            await world.create_place(trusted, **spot(index, 2000))
            await world.create_place(trusted, "historic", **spot(index))
        areas_many = await count("/areas", {"topics": "sea"})
        recs_many = await count("/recommendations", {"topics": "sea,history"})
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert areas_many == areas_one
    assert recs_many == recs_one
    result = await recommendations(client, topics="sea,history")
    assert len(result["items"]) == 10
