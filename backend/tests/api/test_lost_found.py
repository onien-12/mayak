"""«Потеряшки» (SPEC §26): posts, matching, search, responses with private contacts, screening."""

import json
from datetime import timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import func, select

from app.domain.enums import UserRole
from app.models import LostItem, LostMatch, Notification, User
from app.seed import lost_found as demo
from app.services.ai_moderation.client import ResponseFormat
from app.services.lost_found.judge import MATCH_JUDGEMENT, LostMatcher
from tests.conftest import API, CENTER, Actor, World

TODAY = "2026-11-11"
YESTERDAY = "2026-11-10"
SQUARE = {"lat": CENTER["lat"], "lng": CENTER["lng"]}
NEARBY = {"lat": CENTER["lat"] + 0.0017, "lng": CENTER["lng"]}  # ≈ 190 m north
PHONE = "+7 914 000-11-22"
TELEGRAM = "@owner_of_keys"


def _post(kind: str, title: str, category: str = "wallet", **extra: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "kind": kind,
        "category": category,
        "title": title,
        "happened_on": YESTERDAY if kind == "lost" else TODAY,
        **(SQUARE if kind == "lost" else NEARBY),
    }
    if kind == "lost":
        body["radius_m"] = 1000
    return {**body, **extra}


async def _create(actor: Actor, body: dict[str, Any]) -> dict[str, Any]:
    response = await actor.post("/lost", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def _matched(world: World) -> None:
    await world.app.state.lost_matcher.drain()


async def _notices(actor: Actor) -> list[dict[str, Any]]:
    return (await actor.get("/notifications")).json()


class FakeJudge:
    """Stands in for the model that judges shortlisted pairs."""

    def __init__(self, verdict: str = "same") -> None:
        self.verdict = verdict
        self.calls: list[tuple[str, list[dict[str, Any]]]] = []

    async def complete(
        self, system_prompt: str, user_content: list[dict[str, Any]], response_format: ResponseFormat
    ) -> str | None:
        assert response_format is MATCH_JUDGEMENT
        self.calls.append((system_prompt, user_content))
        data = json.loads(user_content[0]["text"].split("\n")[1])
        answers = [{"id": item["id"], "verdict": self.verdict} for item in data["candidates"]]
        return json.dumps({"candidates": answers})


def _use_judge(world: World, judge: FakeJudge | None) -> None:
    factory = world.app.state.database.session_factory
    world.app.state.lost_matcher = LostMatcher(judge, factory, wait_step_s=0.01, wait_steps=500)


async def test_publish_list_and_read(world: World, client: AsyncClient) -> None:
    finder = await world.actor("finder")
    owner = await world.actor("owner")
    assert (await client.post(f"{API}/lost", json=_post("found", "Ключи"))).status_code == 401

    found = await _create(
        finder,
        _post(
            "found", "  Связка ключей  ", "keys", radius_m=300, control_question="Что на брелоке?",
            description="У входа в сквер.",
        ),
    )  # fmt: skip
    assert (found["title"], found["radius_m"], found["control_question"]) == (
        "Связка ключей",
        None,
        "Что на брелоке?",
    )
    assert (found["state"], found["is_mine"], found["can_respond"], found["pending_responses"]) == (
        "active",
        True,
        False,
        0,
    )
    lost = await _create(owner, _post("lost", "Чёрный кошелёк", control_question="Не нужен"))
    assert (lost["radius_m"], lost["control_question"]) == (1000, None)

    listed = (await client.get(f"{API}/lost")).json()
    assert [item["id"] for item in listed] == [lost["id"], found["id"]]
    assert "control_question" not in listed[0]
    assert [item["id"] for item in (await client.get(f"{API}/lost", params={"kind": "found"})).json()] == [
        found["id"]
    ]
    by_category = await client.get(f"{API}/lost", params={"category": "keys,phone"})
    assert [item["id"] for item in by_category.json()] == [found["id"]]
    assert (await client.get(f"{API}/lost", params={"since": TODAY})).json()[0]["id"] == found["id"]
    assert (await client.get(f"{API}/lost", params={"bbox": "131.0,42.0,131.1,42.1"})).json() == []

    public = (await client.get(f"{API}/lost/{found['id']}")).json()
    assert (public["is_mine"], public["can_respond"], public["my_response"]) == (False, False, None)
    assert (await owner.get(f"/lost/{found['id']}")).json()["can_respond"] is True

    for invalid in (
        _post("lost", "Ключи", happened_on="2026-12-20"),
        _post("lost", "Ключи", radius_m=500),
        _post("lost", "Ключи", category="car"),
        _post("lost", "К"),
        _post("lost", "Ключи", photo_ids=[1, 2, 3, 4]),
    ):
        assert (await owner.post("/lost", json=invalid)).status_code == 422


async def test_matches_and_search(world: World, client: AsyncClient) -> None:
    owner = await world.actor("owner")
    finder = await world.actor("finder")
    stranger = await world.actor("stranger")
    lost = await _create(owner, _post("lost", "Чёрный кошелёк"))
    wallet = await _create(finder, _post("found", "Кошелек черный, кожаный"))
    keys = await _create(finder, _post("found", "Связка ключей", "keys"))
    far = await _create(finder, _post("found", "Кошелёк", lat=43.02, lng=131.89))
    await _matched(world)

    matches = (await client.get(f"{API}/lost/{lost['id']}/matches")).json()
    assert [(item["item"]["id"], item["reason"]) for item in matches] == [
        (wallet["id"], "Та же категория, 200 м от места, на следующий день, похожее описание")
    ]
    assert "score" not in json.dumps(matches)
    for viewer in (stranger, owner):
        assert (await viewer.get(f"/lost/{wallet['id']}/matches")).status_code == 403
    assert (await client.get(f"{API}/lost/{wallet['id']}/matches")).status_code == 403
    seeking = (await finder.get(f"/lost/{wallet['id']}/matches")).json()
    assert [item["item"]["id"] for item in seeking] == [lost["id"]]

    async def search(**params: Any) -> list[int]:
        response = await client.get(f"{API}/lost/search", params=params)
        assert response.status_code == 200, response.text
        return [item["item"]["id"] for item in response.json()]

    assert set(await search(q="кошелька")) == {wallet["id"], far["id"]}
    near = f"{CENTER['lat']},{CENTER['lng']}"
    assert await search(q="черный кошелёк", near=near, radius_m=1000, lost_on=YESTERDAY) == [wallet["id"]]
    assert await search(category="keys") == [keys["id"]]
    assert await search(q="зонт") == []
    assert set(await search()) == {wallet["id"], keys["id"], far["id"]}
    assert (await client.get(f"{API}/lost/search", params={"radius_m": 300})).status_code == 422


async def test_a_strong_pair_is_announced_once_without_a_model(world: World) -> None:
    owner = await world.actor("owner")
    finder = await world.actor("finder")
    lost = await _create(owner, _post("lost", "Чёрный кошелёк"))
    await _matched(world)
    assert await _notices(owner) == []

    found = await _create(finder, _post("found", "Кошелек черный"))
    await _matched(world)
    notices = await _notices(owner)
    assert [(item["kind"], item["title"], item["link"]) for item in notices] == [
        ("lost_found", "Возможно, вашу вещь нашли", f"/lost/{found['id']}")
    ]
    assert (
        notices[0]["body"]
        == "«Кошелек черный»: та же категория, 200 м от места, на следующий день, похожее описание."
    )
    assert await _notices(finder) == []

    await world.app.state.lost_matcher.sweep()
    assert len(await _notices(owner)) == 1
    async with world.session() as session:
        row = await session.scalar(select(LostMatch))
    assert row is not None
    assert (row.lost_id, row.found_id, row.verdict, row.notified_at is not None) == (
        lost["id"],
        found["id"],
        None,
        True,
    )


async def test_the_model_judges_a_pair_once_and_sees_no_place_or_person(world: World) -> None:
    judge = FakeJudge("same")
    _use_judge(world, judge)
    owner = await world.actor("owner")
    finder = await world.actor("finder")
    found = await _create(
        finder,
        _post("found", "Портмоне тёмное", description="Денег нет.", control_question="Какие карты внутри?"),
    )
    await _matched(world)
    lost = await _create(owner, _post("lost", "Чёрный кошелёк"))
    await _matched(world)

    assert len(judge.calls) == 1
    system_prompt, content = judge.calls[0]
    assert "портмоне" in system_prompt
    sent = content[0]["text"]
    assert "Портмоне тёмное" in sent
    assert "Чёрный кошелёк" in sent
    for private in ("Какие карты", "finder", "owner", str(CENTER["lat"])[:6], YESTERDAY):
        assert private not in sent
    notices = await _notices(finder)
    assert [(item["title"], item["link"]) for item in notices] == [
        ("Возможно, «Портмоне тёмное» ищут", f"/lost/{lost['id']}")
    ]
    assert notices[0]["body"].endswith("похоже по описанию.")
    matches = (await owner.get(f"/lost/{lost['id']}/matches")).json()
    assert [item["item"]["id"] for item in matches] == [found["id"]]

    await world.app.state.lost_matcher.sweep()
    assert len(judge.calls) == 1
    assert len(await _notices(finder)) == 1


async def test_a_pair_the_model_calls_different_is_not_shown_or_announced(world: World) -> None:
    _use_judge(world, FakeJudge("different"))
    owner = await world.actor("owner")
    finder = await world.actor("finder")
    await _create(finder, _post("found", "Портмоне тёмное"))
    await _matched(world)
    lost = await _create(owner, _post("lost", "Чёрный кошелёк"))
    await _matched(world)
    assert (await owner.get(f"/lost/{lost['id']}/matches")).json() == []
    assert await _notices(finder) == []


async def test_without_an_answer_the_rules_decide(world: World) -> None:
    judge = FakeJudge()

    async def broken(*_: Any) -> str | None:
        judge.calls.append(("", []))
        return "не JSON"

    judge.complete = broken  # type: ignore[method-assign]
    _use_judge(world, judge)
    owner = await world.actor("owner")
    finder = await world.actor("finder")
    await _create(owner, _post("lost", "Чёрный кошелёк"))
    await _matched(world)
    await _create(finder, _post("found", "Кошелек черный"))
    await _matched(world)
    assert await _notices(owner) == []
    await world.app.state.lost_matcher.sweep()
    assert len(judge.calls) == 2
    assert [item["title"] for item in await _notices(owner)] == ["Возможно, вашу вещь нашли"]


async def test_response_accept_and_contacts(world: World, client: AsyncClient) -> None:
    finder = await world.actor("finder")
    owner = await world.actor("owner")
    stranger = await world.actor("stranger")
    found = await _create(finder, _post("found", "Связка ключей", "keys", control_question="Что на брелоке?"))
    await _matched(world)
    path = f"/lost/{found['id']}/responses"

    assert (await finder.post(path, json={"message": "Моё", "contact": PHONE})).status_code == 400
    sent = await owner.post(path, json={"message": "На брелоке маленький жёлтый маяк.", "contact": PHONE})
    assert sent.status_code == 201, sent.text
    response = sent.json()
    assert (response["state"], response["contact"], response["owner_contact"]) == ("pending", PHONE, None)
    assert (await owner.post(path, json={"message": "Ещё раз", "contact": PHONE})).status_code == 409
    assert (await owner.get(f"/lost/{found['id']}")).json()["can_respond"] is False
    assert (await owner.get(f"/lost/{found['id']}")).json()["my_response"]["contact"] == PHONE

    # The finder reads the answer, not the phone; nobody else reads anything.
    notices = await _notices(finder)
    assert [(item["title"], item["link"]) for item in notices] == [
        ("Отклик на «Связка ключей»", f"/lost/{found['id']}")
    ]
    assert (await finder.get(f"/lost/{found['id']}")).json()["pending_responses"] == 1
    seen = (await finder.get(path)).json()
    assert [(item["message"], item["contact"], item["owner_contact"]) for item in seen] == [
        ("На брелоке маленький жёлтый маяк.", None, None)
    ]
    assert (await stranger.get(path)).status_code == 403
    assert (await client.get(f"{API}{path}")).status_code == 401
    accept = f"/lost/responses/{response['id']}/accept"
    assert (await owner.post(accept, json={"contact": TELEGRAM})).status_code == 403
    assert (await stranger.post(f"/lost/responses/{response['id']}/decline")).status_code == 403

    accepted = await finder.post(accept, json={"contact": TELEGRAM})
    assert accepted.status_code == 200, accepted.text
    assert (accepted.json()["contact"], accepted.json()["owner_contact"]) == (PHONE, TELEGRAM)
    assert (await finder.post(accept, json={"contact": TELEGRAM})).status_code == 409
    mine = (await owner.get(path)).json()
    assert [(item["state"], item["contact"], item["owner_contact"]) for item in mine] == [
        ("accepted", PHONE, TELEGRAM)
    ]
    assert [item["title"] for item in await _notices(owner)] == ["Автор «Связка ключей» принял ваш отклик"]

    closed = (await finder.post(f"/lost/{found['id']}/close")).json()
    assert closed["state"] == "returned"
    assert (await client.get(f"{API}/lost")).json() == []
    late = await stranger.post(path, json={"message": "Это моё", "contact": PHONE})
    assert late.status_code == 409
    assert (await stranger.post(f"/lost/{found['id']}/close")).status_code == 403


async def test_a_declined_response_tells_the_responder(world: World) -> None:
    owner = await world.actor("owner")
    finder = await world.actor("finder")
    lost = await _create(owner, _post("lost", "Рыжий кот", "pet"))
    response = (
        await finder.post(
            f"/lost/{lost['id']}/responses",
            json={"message": "Видел рыжего кота у остановки.", "contact": PHONE},
        )
    ).json()
    declined = (await owner.post(f"/lost/responses/{response['id']}/decline")).json()
    assert (declined["state"], declined["contact"], declined["owner_contact"]) == ("declined", None, None)
    mine = (await finder.get(f"/lost/{lost['id']}")).json()["my_response"]
    assert (mine["state"], mine["contact"], mine["owner_contact"]) == ("declined", PHONE, None)
    assert [item["title"] for item in await _notices(finder)] == ["Автор «Рыжий кот» отклонил ваш отклик"]


def _walk(value: Any, path: str = "$") -> list[tuple[str, Any]]:
    """Every (path, value) of a JSON document."""
    if isinstance(value, dict):
        return [entry for key, item in value.items() for entry in _walk(item, f"{path}.{key}")]
    if isinstance(value, list):
        return [entry for index, item in enumerate(value) for entry in _walk(item, f"{path}[{index}]")]
    return [(path, value)]


async def test_contacts_never_reach_anyone_but_the_two_people(world: World, client: AsyncClient) -> None:
    finder = await world.actor("finder")
    owner = await world.actor("owner")
    stranger = await world.actor("stranger")
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    found = await _create(finder, _post("found", "Связка ключей", "keys", control_question="Что на брелоке?"))
    lost = await _create(owner, _post("lost", "Ключи от квартиры", "keys"))
    await _matched(world)
    response = (
        await owner.post(f"/lost/{found['id']}/responses", json={"message": "Брелок-маяк.", "contact": PHONE})
    ).json()
    await finder.post(f"/lost/responses/{response['id']}/accept", json={"contact": TELEGRAM})
    await _matched(world)

    public_paths = [
        "/lost",
        "/lost?kind=found",
        f"/lost/{found['id']}",
        f"/lost/{lost['id']}",
        f"/lost/{lost['id']}/matches",
        "/lost/search?q=ключи",
        "/lost/search?category=keys",
        f"/users/{finder.id}",
        f"/users/{owner.id}",
    ]
    viewers: list[tuple[str, Any]] = [
        ("anonymous", lambda path: client.get(f"{API}{path}")),
        ("stranger", stranger.get),
        ("moderator", moderator.get),
    ]
    for name, get in viewers:
        paths = [*public_paths, "/notifications", "/lost/mine"] if name != "anonymous" else public_paths
        if name == "moderator":
            paths.append(f"/lost/{found['id']}/matches")
        for path in paths:
            reply = await get(path)
            assert reply.status_code == 200, (name, path, reply.text)
            document = reply.json()
            for where, value in _walk(document):
                assert where.rsplit(".", 1)[-1] not in ("contact", "owner_contact") or value is None, (
                    name,
                    where,
                )
                if isinstance(value, str):
                    assert PHONE not in value, (name, path, where)
                    assert TELEGRAM not in value, (name, path, where)
    # The two people see the contacts only where they should: the post and its responses.
    for actor in (finder, owner):
        for path in ("/lost", f"/lost/{lost['id']}/matches", "/notifications"):
            text = (await actor.get(path)).text
            assert PHONE not in text
            assert TELEGRAM not in text


async def test_screening_holds_personal_data_in_a_post(world: World, client: AsyncClient) -> None:
    fake = world.enable_ai()
    fake.will_say("violation", 0.95, "personal_data")
    author = await world.actor("author")
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    _use_judge(world, None)
    item = await _create(author, _post("found", "Паспорт Иванов Иван Иванович 01.02.1990", "documents"))
    await world.ai_done()
    await _matched(world)

    system_prompt, content = fake.calls[0]
    assert "Потеряшки" in system_prompt
    assert '"kind": "lost_item"' in content[0]["text"]
    assert (await client.get(f"{API}/lost")).json() == []
    assert (await client.get(f"{API}/lost/{item['id']}")).status_code == 404
    own = (await author.get(f"/lost/{item['id']}")).json()
    assert own["on_review"] is True
    assert [entry["on_review"] for entry in (await author.get("/lost")).json()] == [True]
    notices = await _notices(author)
    assert [(entry["title"], entry["link"]) for entry in notices] == [
        ("Объявление «Паспорт Иванов Иван Иванович 01.02.1990» не прошло автоматическую проверку",
         f"/lost/{item['id']}")
    ]  # fmt: skip
    assert "Текст: личные данные" in notices[0]["body"]

    held = (await moderator.get("/moderation/held")).json()
    assert [(entry["kind"], entry["target_id"], entry["object_name"]) for entry in held] == [
        ("lost_item", item["id"], None)
    ]
    released = await moderator.post(f"/moderation/held/{held[0]['id']}/release", json={"reason": "Можно"})
    assert released.status_code == 204, released.text
    assert [entry["id"] for entry in (await client.get(f"{API}/lost")).json()] == [item["id"]]
    assert (await _notices(author))[0]["title"] == "Ваше объявление проверено и опубликовано"


async def test_a_response_reaches_the_author_only_after_screening(world: World) -> None:
    finder = await world.actor("finder")
    owner = await world.actor("owner")
    found = await _create(finder, _post("found", "Связка ключей", "keys"))
    fake = world.enable_ai()
    fake.pause()
    response = (
        await owner.post(f"/lost/{found['id']}/responses", json={"message": "Брелок-маяк.", "contact": PHONE})
    ).json()
    assert (await finder.get(f"/lost/{found['id']}/responses")).json() == []
    assert (await finder.get(f"/lost/{found['id']}")).json()["pending_responses"] == 0
    assert await _notices(finder) == []
    assert (await finder.post(f"/lost/responses/{response['id']}/decline")).status_code == 404
    await world.ai_done()

    system_prompt, content = fake.calls[-1]
    assert "lost_response" in content[0]["text"]
    assert PHONE not in content[0]["text"]
    assert "PRIVATE message" in system_prompt
    assert [entry["id"] for entry in (await finder.get(f"/lost/{found['id']}/responses")).json()] == [
        response["id"]
    ]
    assert [entry["title"] for entry in await _notices(finder)] == ["Отклик на «Связка ключей»"]


async def test_photos_are_checked_as_things(world: World, client: AsyncClient) -> None:
    author = await world.actor("author")
    other = await world.actor("other")
    fake = world.enable_ai()
    photos = []
    for color in ("red", "blue"):
        uploaded = await author.post(
            "/uploads", files={"file": ("p.png", world.png((64, 48), color), "image/png")}
        )
        photos.append(uploaded.json()["id"])
    item = await _create(author, _post("found", "Рюкзак синий", "bag", photo_ids=photos))
    await world.ai_done()
    assert len(fake.photo_calls) == 2
    public = (await client.get(f"{API}/lost/{item['id']}")).json()
    assert [photo["id"] for photo in public["photos"]] == photos
    assert public["cover_url"] == public["photos"][0]["url"]
    assert (await client.get(f"{API}/lost")).json()[0]["photos_count"] == 2
    again = await author.post("/lost", json=_post("found", "Рюкзак", "bag", photo_ids=photos[:1]))
    assert again.status_code == 422
    stolen = await other.post("/lost", json=_post("found", "Рюкзак", "bag", photo_ids=photos[1:]))
    assert stolen.status_code == 422


async def test_lost_found_photo_prompt_is_used(world: World) -> None:
    author = await world.actor("author")
    fake = world.enable_ai()
    seen: list[str] = []
    original = fake.complete

    async def spy(
        system_prompt: str, user_content: list[dict[str, Any]], response_format: ResponseFormat
    ) -> Any:
        seen.append(system_prompt)
        return await original(system_prompt, user_content, response_format)

    fake.complete = spy  # type: ignore[method-assign]
    fake.photos_will_say(("violation", 0.9, ("personal_data",)))
    uploaded = await author.post("/uploads", files={"file": ("p.png", world.png(), "image/png")})
    item = await _create(author, _post("found", "Паспорт", "documents", photo_ids=[uploaded.json()["id"]]))
    await world.ai_done()
    assert any("never use it here" in prompt for prompt in seen)
    assert (await world.http.get(f"{API}/lost/{item['id']}")).status_code == 404


async def test_expiry_reports_and_moderators(world: World, client: AsyncClient) -> None:
    author = await world.actor("author")
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    reporters = [await world.actor(f"reporter{index}") for index in range(3)]
    item = await _create(author, _post("found", "Варежка", "clothes"))
    assert (await author.post(f"/lost/{item['id']}/report")).status_code == 400
    for reporter in reporters[:2]:
        assert (await reporter.post(f"/lost/{item['id']}/report")).status_code == 204
    assert (await reporters[0].post(f"/lost/{item['id']}/report")).status_code == 204
    assert len((await client.get(f"{API}/lost")).json()) == 1
    await reporters[2].post(f"/lost/{item['id']}/report")
    assert (await client.get(f"{API}/lost")).json() == []
    assert (await client.get(f"{API}/lost/{item['id']}")).status_code == 404
    seen = (await moderator.get(f"/lost/{item['id']}")).json()
    assert (seen["is_hidden"], seen["can_moderate"]) == (True, True)
    assert (await author.post(f"/lost/{item['id']}/unhide")).status_code == 403
    assert (await moderator.post(f"/lost/{item['id']}/unhide")).json()["is_hidden"] is False
    assert len((await client.get(f"{API}/lost")).json()) == 1
    assert (await moderator.post(f"/lost/{item['id']}/hide")).json()["is_hidden"] is True
    assert (await author.get(f"/lost/{item['id']}")).status_code == 404
    await moderator.post(f"/lost/{item['id']}/unhide")

    world.clock.shift(timedelta(days=30, hours=1))
    assert (await client.get(f"{API}/lost")).json() == []
    expired = (await client.get(f"{API}/lost/{item['id']}")).json()
    assert (expired["state"], expired["can_respond"]) == ("expired", False)
    assert [entry["state"] for entry in (await author.get("/lost/mine")).json()] == ["expired"]

    assert (await reporters[0].delete(f"/lost/{item['id']}")).status_code == 403
    assert (await author.delete(f"/lost/{item['id']}")).status_code == 204
    assert (await client.get(f"{API}/lost/{item['id']}")).status_code == 404


async def test_daily_limit(world: World) -> None:
    author = await world.actor("author")
    statuses = [
        (await author.post("/lost", json=_post("found", f"Вещь номер {index}", "other"))).status_code
        for index in range(6)
    ]
    assert statuses == [201] * 5 + [429]


async def test_demo_posts_are_added_once(world: World) -> None:
    async with world.session() as session:
        assert await demo.apply_lost_found(session, world.clock_now()) is None  # no demo users here
        for username in {spec.author for spec in demo.ITEMS}:
            session.add(
                User(
                    email=f"{username}@demo.test",
                    username=username,
                    display_name=username,
                    password_hash="x",
                    created_at=world.clock_now() - timedelta(days=100),
                )
            )
        await session.flush()
        assert await demo.apply_lost_found(session, world.clock_now()) == len(demo.ITEMS)
        assert await demo.apply_lost_found(session, world.clock_now()) is None
        await session.commit()
        count = await session.scalar(select(func.count()).select_from(LostItem))
    assert count == len(demo.ITEMS)
    _use_judge(world, None)
    await world.app.state.lost_matcher.sweep()
    await world.app.state.lost_matcher.sweep()
    async with world.session() as session:
        told = set(
            await session.execute(
                select(User.username, Notification.title).join(Notification, Notification.user_id == User.id)
            )
        )
    # Without a model only the pairs whose words agree are announced, each to its older post's author.
    assert told == {
        ("roma", "Возможно, «Связка ключей с брелоком» ищут"),
        ("vera", "Возможно, вашу вещь нашли"),
    }
    listed = (await world.http.get(f"{API}/lost")).json()
    assert all(entry["state"] == "active" for entry in listed)
    assert len(listed) == len(demo.ITEMS)
