from typing import Any

from httpx import AsyncClient

from app.domain.enums import UserRole
from tests.conftest import API, Actor, World


async def _reputation(actor: Actor) -> int:
    return (await actor.get("/auth/me")).json()["reputation"]


async def _complain(reporter: Actor, place_id: int, reason: str = "inaccurate", **extra: Any) -> Any:
    body = {"target_type": "place", "target_id": place_id, "reason": reason, **extra}
    return await reporter.post("/complaints", json=body)


async def _resolve(moderator: Actor, case_id: int, action: str, reason: str = "Проверено на месте.") -> Any:
    return await moderator.post(
        f"/moderation/cases/{case_id}/resolve", json={"action": action, "reason": reason}
    )


async def test_moderation_is_for_staff_only(world: World, client: AsyncClient) -> None:
    user = await world.actor("user", reputation=500)
    for path in ("/moderation/queue", "/moderation/summary", "/moderation/log", "/moderation/cases/1"):
        assert (await client.get(f"{API}{path}")).status_code == 401
        assert (await user.get(path)).status_code == 403
    assert (await _resolve(user, 1, "approve")).status_code == 403
    admin = await world.actor("admin", role=UserRole.ADMIN)
    assert (await admin.get("/moderation/queue")).json() == []
    assert (await admin.get("/moderation/cases/1")).status_code == 404


async def test_complaint_rules(world: World) -> None:
    author = await world.actor("author", reputation=20)
    reporter = await world.actor("reporter", reputation=15)
    place = await world.create_place(author)

    created = await _complain(reporter, place["id"], "outdated", comment="Закрыто с лета.")
    assert created.status_code == 201
    assert isinstance(created.json()["id"], int)
    assert (await _complain(reporter, place["id"], "spam")).status_code == 409
    assert (await _complain(author, place["id"])).status_code == 400
    assert (await _complain(reporter, place["id"] + 99)).status_code == 404
    impassable = await _complain(reporter, place["id"], "impassable")
    assert impassable.status_code == 400
    assert (await world.http.post(f"{API}/complaints", json={})).status_code == 401
    assert (await reporter.get(f"/places/{place['id']}")).json()["status"] == "unverified"


async def test_newcomer_complaints_are_limited_per_day(world: World) -> None:
    author = await world.actor("author", reputation=210)
    newcomer = await world.actor("newcomer")
    places = [await world.create_place(author) for _ in range(6)]
    statuses = [(await _complain(newcomer, place["id"])).status_code for place in places]
    assert statuses == [201] * 5 + [429]


async def test_complaints_reach_threshold_and_are_dismissed_on_approve(
    world: World, client: AsyncClient
) -> None:
    author = await world.actor("author", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    expert = await world.actor("expert", reputation=200)
    resident = await world.actor("resident", reputation=15)
    place = await world.create_place(author)

    await _complain(expert, place["id"], "spam", comment="Реклама")
    assert (await client.get(f"{API}/places/{place['id']}")).json()["status"] == "unverified"
    assert (await moderator.get("/moderation/queue")).json() == []

    await _complain(resident, place["id"], "inaccurate")
    assert (await client.get(f"{API}/places/{place['id']}")).json()["status"] == "needs_review"

    queue = (await moderator.get("/moderation/queue")).json()
    assert len(queue) == 1
    case = queue[0]
    assert (case["triggers"], case["complaints_count"], case["state"]) == (["complaints"], 2, "open")
    assert (case["target_type"], case["target_title"], case["layer"]) == (
        "place",
        place["title"],
        "infrastructure",
    )
    assert case["resolution"] is None
    assert 0 < case["risk"] <= 100
    summary = (await moderator.get("/moderation/summary")).json()
    assert (summary["open"], summary["resolved_today"]) == (1, 0)
    assert summary["by_trigger"]["complaints"] == 1
    assert summary["by_trigger"]["appeal"] == 0

    detail = (await moderator.get(f"/moderation/cases/{case['id']}")).json()
    assert detail["place"]["id"] == place["id"]
    assert detail["route"] is None
    assert [(item["reason"], item["author"]["username"]) for item in detail["complaints"]] == [
        ("spam", "expert"),
        ("inaccurate", "resident"),
    ]
    assert detail["history"][0]["new_status"] == "needs_review"

    assert (await _resolve(moderator, case["id"], "approve", "Жалобы не подтвердились")).status_code == 200
    resolved = (await moderator.get(f"/moderation/cases/{case['id']}")).json()
    assert resolved["state"] == "resolved"
    assert resolved["resolution"]["action"] == "approve"
    assert resolved["resolution"]["moderator"]["username"] == "moderator"
    assert resolved["place"]["status"] == "unverified"
    assert (await _resolve(moderator, case["id"], "hide")).status_code == 409

    assert await _reputation(expert) == 199
    assert await _reputation(resident) == 14
    assert await _reputation(author) == 20
    assert (await _complain(expert, place["id"], "spam")).status_code == 201
    assert (await moderator.get("/moderation/queue")).json() == []
    assert len((await moderator.get("/moderation/queue", params={"state": "resolved"})).json()) == 1

    log = (await moderator.get("/moderation/log")).json()
    assert [(entry["action"], entry["reason"], entry["target_id"]) for entry in log] == [
        ("approve", "Жалобы не подтвердились", place["id"])
    ]
    assert (await moderator.get("/moderation/summary")).json()["resolved_today"] == 1
    assert [item["kind"] for item in (await author.get("/notifications")).json()] == ["moderation"]


async def test_premoderation_approve_and_reject(world: World, client: AsyncClient) -> None:
    newcomer = await world.actor("newcomer")
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    good = await world.create_place(newcomer)
    bad = await world.create_place(newcomer)
    cases = {case["target_id"]: case["id"] for case in (await moderator.get("/moderation/queue")).json()}

    approved = (await _resolve(moderator, cases[good["id"]], "approve", "Всё верно")).json()
    assert approved["place"]["status"] == "unverified"
    assert (await client.get(f"{API}/places/{good['id']}")).status_code == 200
    assert await _reputation(newcomer) == 4

    rejected = (await _resolve(moderator, cases[bad["id"]], "reject", "Такой точки не существует")).json()
    assert rejected["place"]["status"] == "archived"
    assert await _reputation(newcomer) == 4 - 15
    own = (await newcomer.get(f"/places/{bad['id']}")).json()
    assert own["moderation_note"] == "Такой точки не существует"
    assert own["can_appeal"] is True
    assert (await client.get(f"{API}/places/{bad['id']}")).json()["moderation_note"] is None

    history = (await client.get(f"{API}/places/{good['id']}/history")).json()
    assert history[0]["kind"] == "moderation"
    assert (history[0]["old_status"], history[0]["new_status"]) == ("pending", "unverified")
    assert history[0]["actor"]["username"] == "moderator"
    assert len((await moderator.get("/moderation/log")).json()) == 2


async def test_request_changes_and_resubmit(world: World) -> None:
    newcomer = await world.actor("newcomer")
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    place = await world.create_place(newcomer)
    case_id = (await moderator.get("/moderation/queue")).json()[0]["id"]

    response = await _resolve(moderator, case_id, "request_changes", "Уточните адрес и режим работы")
    assert response.json()["place"]["status"] == "pending"
    own = (await newcomer.get(f"/places/{place['id']}")).json()
    assert own["moderation_note"] == "Уточните адрес и режим работы"
    assert own["can_appeal"] is False
    assert (await moderator.get("/moderation/queue")).json() == []
    assert await _reputation(newcomer) == 0

    edited = await newcomer.patch(f"/places/{place['id']}", json={"address": "ул. Светланская, 5"})
    assert edited.status_code == 200
    reopened = (await moderator.get("/moderation/queue")).json()
    assert [case["target_id"] for case in reopened] == [place["id"]]
    assert reopened[0]["id"] != case_id


async def test_hide_uphelds_complaints_then_appeal_and_restore(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=40)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    reporters = [await world.actor(f"expert{index}", reputation=200) for index in range(2)]
    place = await world.create_place(author)
    for reporter in reporters:
        await _complain(reporter, place["id"], "fraud")
    case_id = (await moderator.get("/moderation/queue")).json()[0]["id"]

    hidden = (await _resolve(moderator, case_id, "hide", "Вводит в заблуждение")).json()
    assert hidden["place"]["status"] == "hidden"
    assert await _reputation(author) == 25
    assert await _reputation(reporters[0]) == 203
    assert (await client.get(f"{API}/places/{place['id']}")).status_code == 404
    assert (await _complain(await world.actor("late", reputation=15), place["id"])).status_code == 404

    stranger_appeal = await reporters[0].post(
        f"/places/{place['id']}/appeal", json={"text": "Это не моя точка, но."}
    )
    assert stranger_appeal.status_code == 404
    too_short = await author.post(f"/places/{place['id']}/appeal", json={"text": "нет"})
    assert too_short.status_code == 422

    appeal = await author.post(
        f"/places/{place['id']}/appeal", json={"text": "Точка существует, прикладываю фото."}
    )
    assert appeal.status_code == 201
    appeal_case_id = appeal.json()["case_id"]
    assert appeal_case_id != case_id
    again = await author.post(f"/places/{place['id']}/appeal", json={"text": "Повторная апелляция по делу."})
    assert again.status_code == 409
    assert (await author.get(f"/places/{place['id']}")).json()["can_appeal"] is False

    queue = (await moderator.get("/moderation/queue", params={"trigger": "appeal"})).json()
    assert [case["id"] for case in queue] == [appeal_case_id]
    assert (await moderator.get("/moderation/queue", params={"trigger": "complaints"})).json() == []
    detail = (await moderator.get(f"/moderation/cases/{appeal_case_id}")).json()
    assert detail["appeal_text"] == "Точка существует, прикладываю фото."

    restored = (await _resolve(moderator, appeal_case_id, "restore", "Автор прав")).json()
    assert restored["place"]["status"] == "unverified"
    assert (await client.get(f"{API}/places/{place['id']}")).status_code == 200
    assert await _reputation(author) == 25
    kinds = [item["kind"] for item in (await author.get("/notifications")).json()]
    assert kinds == ["moderation", "moderation"]


async def test_restore_requires_hidden_or_archived(world: World) -> None:
    newcomer = await world.actor("newcomer")
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    await world.create_place(newcomer)
    case_id = (await moderator.get("/moderation/queue")).json()[0]["id"]
    response = await _resolve(moderator, case_id, "restore")
    assert response.status_code == 409
    assert (await moderator.get("/moderation/queue")).json()[0]["state"] == "open"
    assert (await _resolve(moderator, case_id, "approve", "х")).status_code == 422


async def test_approved_place_is_not_disputed_again_by_old_absent_votes(world: World) -> None:
    author = await world.actor("author", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    doubters = [await world.actor(f"expert{index}", reputation=200) for index in range(2)]
    supporter = await world.actor("supporter", reputation=15)
    place = await world.create_place(author, "viewpoint")
    for doubter in doubters:
        await world.vote(doubter, place["id"], "absent")
    case_id = (await moderator.get("/moderation/queue")).json()[0]["id"]

    approved = (await _resolve(moderator, case_id, "approve", "Проверили: объект на месте")).json()
    assert approved["place"]["status"] == "unverified"
    after_vote = await world.vote(supporter, place["id"], "present")
    assert after_vote["status"] == "preliminary"
    assert (await moderator.get("/moderation/queue")).json() == []


async def test_queue_filters_and_sorting(world: World) -> None:
    newcomer = await world.actor("newcomer")
    resident = await world.actor("resident", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    toilet = await world.create_place(newcomer)
    event = await world.create_place(newcomer, "culture", event=world.event_window())
    flagged = await world.create_place(resident, title="СРОЧНО КУПИТЕ БИЛЕТЫ ПРЯМО СЕЙЧАС")

    async def targets(**params: Any) -> list[int]:
        response = await moderator.get("/moderation/queue", params=params)
        assert response.status_code == 200, response.text
        return [case["target_id"] for case in response.json()]

    assert set(await targets()) == {toilet["id"], event["id"], flagged["id"]}
    assert await targets(layer="event") == [event["id"]]
    assert await targets(trigger="auto_text") == [flagged["id"]]
    assert await targets(target_type="route") == []
    assert await targets(sort="newest") == [flagged["id"], event["id"], toilet["id"]]
    assert await targets(sort="oldest") == [toilet["id"], event["id"], flagged["id"]]
    assert (await targets(sort="risk"))[0] == event["id"]
    assert await targets(sort="oldest", limit=1, offset=1) == [event["id"]]


async def test_a_clarification_vote_reaches_the_moderators(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    resident = await world.actor("resident", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    place = await world.create_place(author)
    votes = f"/places/{place['id']}/votes"

    # Without words nobody can act on it.
    for payload in ({"kind": "unclear"}, {"kind": "unclear", "comment": "  ?  "}):
        refused = await resident.post(votes, json=payload)
        assert refused.status_code == 422, refused.text
        assert refused.json()["errors"][0]["field"] == "comment"
    assert (await moderator.get("/moderation/queue")).json() == []

    text = "Вход со двора, а не с улицы, и по выходным закрыто."
    voted = await resident.post(votes, json={"kind": "unclear", "comment": text})
    assert voted.status_code == 200, voted.text
    # The place stays where it was: a question is not a reason to take it off the map.
    assert voted.json()["status"] == place["status"]
    assert (await client.get(f"{API}/places/{place['id']}")).status_code == 200

    queue = (await moderator.get("/moderation/queue")).json()
    assert [(case["target_id"], case["triggers"]) for case in queue] == [(place["id"], ["clarification"])]
    detail = (await moderator.get(f"/moderation/cases/{queue[0]['id']}")).json()
    assert [(item["text"], item["author"]["id"]) for item in detail["clarifications"]] == [
        (text, resident.id)
    ]

    # A second resident joins the same open case; the newest words come first.
    other = await world.actor("other", reputation=20)
    await other.post(votes, json={"kind": "unclear", "comment": "Название теперь другое."})
    queue = (await moderator.get("/moderation/queue")).json()
    assert len(queue) == 1
    detail = (await moderator.get(f"/moderation/cases/{queue[0]['id']}")).json()
    assert [item["text"] for item in detail["clarifications"]] == ["Название теперь другое.", text]

    # «Присутствует» and «Отсутствует» still need no words and open nothing.
    present = await world.actor("present", reputation=20)
    assert (await present.post(votes, json={"kind": "present"})).status_code == 200
    assert len((await moderator.get("/moderation/queue")).json()) == 1
