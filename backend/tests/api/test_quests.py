"""Quests (SPEC §27): the editor, the game checked on the server, teams, the results board — and
above all that no response gives a player anything of a stage they have not passed yet."""

from datetime import timedelta
from typing import Any

from httpx import AsyncClient

from app.domain import quests as rules
from app.domain.enums import UserRole
from app.seed import quests as demo_quest
from app.seed import tourism
from tests.conftest import API, CENTER, Actor, World

STAGES: list[dict[str, Any]] = [
    {
        "title": "Старый маяк у моря",
        "lat": 43.11120,
        "lng": 131.88170,
        "riddle": "Начните там, где кончаются рельсы самой длинной дороги страны.",
        "condition": "arrival",
        "radius_m": 40,
        "reward": "Здесь кончается Транссиб: девять тысяч километров позади.",
        "hint": "Ищите паровоз на перроне.",
        "zone": "circle",
        "zone_radius_m": 300,
    },
    {
        "title": "Лавка травника",
        "lat": 43.11830,
        "lng": 131.88220,
        "riddle": "Во дворе-колодце спросите хозяйку о самом горьком чае.",
        "condition": "code",
        "answers": ["Полынь-17"],
        "check_arrival": True,
        "radius_m": 50,
        "reward": "Лавка держится в этом дворе с девяностых годов.",
        "hint": "Арка рядом с вывеской с драконом.",
    },
    {
        "title": "Скамейка капитана",
        "lat": 43.11527,
        "lng": 131.88559,
        "riddle": "Найдите скамейку, с которой видно сразу три купола.",
        "condition": "answer",
        "question": "Какого цвета эта скамейка?",
        "answers": ["Зелёная", "изумрудная"],
        "reward": "Капитан Нечаев любил смотреть отсюда на парады.",
    },
]

SECRET_KEYS = ("title", "riddle", "question", "hint", "reward")


def _body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "title": "Тайны старого центра",
        "description": "Прогулка-загадка по центру на полтора часа.",
        "start_title": "У часов на привокзальной площади",
        "start_lat": 43.1110,
        "start_lng": 131.8800,
        "duration_min": 90,
        "visibility": "public",
        "stages": STAGES,
    }
    body.update(overrides)
    return body


async def _quest(author: Actor, **overrides: Any) -> dict[str, Any]:
    response = await author.post("/quests", json=_body(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def _strings_and_numbers(value: Any) -> tuple[list[str], list[float]]:
    """Every string and number anywhere in a JSON document."""
    strings: list[str] = []
    numbers: list[float] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for key, item in node.items():
                strings.append(str(key))
                walk(item)
        elif isinstance(node, list):
            for item in node:
                walk(item)
        elif isinstance(node, str):
            strings.append(node)
        elif isinstance(node, bool) or node is None:
            return
        elif isinstance(node, int | float):
            numbers.append(float(node))

    walk(value)
    return strings, numbers


def _secrets(
    stage: dict[str, Any], *, keys: tuple[str, ...] = SECRET_KEYS, answers: bool = True
) -> list[str]:
    texts = [stage[key] for key in keys if stage.get(key)]
    if answers:
        texts += list(stage.get("answers", []))
    return texts


def assert_no_leak(document: Any, stages: list[dict[str, Any]], *, allowed: tuple[str, ...] = ()) -> None:
    """None of the stages' texts, codes, answers or coordinates appear anywhere in `document`.
    Coordinates are matched to 1e-6 degrees (about 10 cm)."""
    strings, numbers = _strings_and_numbers(document)
    for stage in stages:
        for secret in _secrets(stage):
            if secret in allowed:
                continue
            assert not any(secret.casefold() in text.casefold() for text in strings), secret
        for coordinate in (stage["lat"], stage["lng"]):
            assert not any(abs(number - coordinate) < 1e-6 for number in numbers), coordinate


async def _start(player: Actor, quest_id: int, **body: Any) -> dict[str, Any]:
    response = await player.post(f"/quests/{quest_id}/runs", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def _check(player: Actor, run_id: int, stage: int, **body: Any) -> Any:
    return await player.post(f"/quest-runs/{run_id}/check", json={"stage": stage, **body})


async def _there(player: Actor, run_id: int, stage: int, index: int, **body: Any) -> dict[str, Any]:
    spot = STAGES[index]
    response = await _check(player, run_id, stage, lat=spot["lat"], lng=spot["lng"], accuracy=10, **body)
    assert response.status_code == 200, response.text
    return response.json()


async def _published_quest(world: World) -> tuple[Actor, dict[str, Any]]:
    author = await world.actor("author", reputation=60)
    quest = await _quest(author)
    assert quest["status"] == "published"
    return author, quest


async def test_author_sees_everything_and_quests_never_show_up_as_routes(
    world: World, client: AsyncClient
) -> None:
    author, quest = await _published_quest(world)
    other = await world.actor("other", reputation=20)
    quest_id = quest["id"]

    assert [stage["title"] for stage in quest["stages"]] == [stage["title"] for stage in STAGES]
    assert quest["stages"][1]["answers"] == ["Полынь-17"]
    assert quest["stages"][0]["check_arrival"] is True
    center = quest["stages"][0]["zone_center"]
    assert center is not None
    assert center != {"lat": STAGES[0]["lat"], "lng": STAGES[0]["lng"]}

    # A quest is a route underneath, but no route endpoint lists or opens it.
    for viewer in (author, other):
        assert (await viewer.get("/routes")).json() == []
        assert (await viewer.get("/routes", params={"q": "тайны"})).json() == []
        assert (await viewer.get(f"/routes/{quest_id}")).status_code == 404
        assert (await viewer.get(f"/routes/{quest_id}/gpx")).status_code == 404
        assert (await viewer.get(f"/routes/{quest_id}/reviews")).status_code == 404
    assert (await author.get("/me/routes")).json() == []
    assert (await author.patch(f"/routes/{quest_id}", json={"title": "Взлом"})).status_code == 404
    assert (await author.delete(f"/routes/{quest_id}")).status_code == 404
    assert (await other.put(f"/routes/{quest_id}/save")).status_code == 404
    profile = (await client.get(f"{API}/users/{author.id}")).json()
    assert profile["stats"]["routes"] == 0
    assert (await client.get(f"{API}/stats")).json()["totals"]["routes"] == 0

    # Others cannot open the editor.
    assert (await other.get(f"/quests/{quest_id}/edit")).status_code == 403
    assert (await client.get(f"{API}/quests/{quest_id}/edit")).status_code == 401


async def test_catalog_and_card_never_carry_a_stage(world: World, client: AsyncClient) -> None:
    _, quest = await _published_quest(world)
    other = await world.actor("other", reputation=20)

    for response in (
        await client.get(f"{API}/quests"),
        await client.get(f"{API}/quests", params={"q": "тайны", "sort": "popular"}),
        await client.get(f"{API}/quests", params={"sort": "rating"}),
        await client.get(f"{API}/quests/{quest['id']}"),
        await client.get(f"{API}/quests/{quest['id']}/results"),
        await client.get(f"{API}/quests/{quest['id']}/reviews"),
        await other.get("/quests"),
        await other.get(f"/quests/{quest['id']}"),
        await client.get(f"{API}/routes"),
        await client.get(f"{API}/stats"),
        await client.get(f"{API}/users/{quest['author']['id']}"),
        await client.get(f"{API}/users/{quest['author']['id']}/routes"),
        await other.get("/me/favorites"),
        await other.get("/me/routes"),
    ):
        assert response.status_code == 200, response.text
        assert_no_leak(response.json(), STAGES)

    card = (await client.get(f"{API}/quests")).json()[0]
    assert (card["stages_count"], card["duration_min"], card["finished_count"]) == (3, 90, 0)
    assert card["start"] == {"title": "У часов на привокзальной площади", "lat": 43.111, "lng": 131.88}
    detail = (await client.get(f"{API}/quests/{quest['id']}")).json()
    assert (detail["my_run"], detail["can_edit"], detail["screening_hold"]) == (None, False, None)


async def test_a_run_shows_only_the_current_riddle_and_checks_everything_on_the_server(world: World) -> None:
    _, quest = await _published_quest(world)
    player = await world.actor("player", reputation=20)
    quest_id = quest["id"]

    run = await _start(player, quest_id)
    assert (run["stage_number"], run["stages_total"], run["passed"]) == (1, 3, [])
    current = run["current"]
    assert current["riddle"] == STAGES[0]["riddle"]
    assert (current["condition"], current["has_hint"], current["hint"]) == ("arrival", True, None)
    assert current["zone"]["radius_m"] == 300
    zone = current["zone"]
    assert rules.is_on_site(zone["lat"], zone["lng"], 0, STAGES[0]["lat"], STAGES[0]["lng"], 300)
    assert_no_leak(run, STAGES, allowed=(STAGES[0]["riddle"],))
    assert (await player.get(f"/quests/{quest_id}")).json()["my_run"]["id"] == run["id"]

    # Far away: not passed, and nothing says how far.
    response = await _check(player, run["id"], 1, lat=CENTER["lat"], lng=CENTER["lng"], accuracy=5)
    body = response.json()
    assert (response.status_code, body["passed"]) == (200, False)
    assert body["message"].startswith("Вы ещё не на месте")
    assert body["run"]["current"]["tries_left"] == rules.MAX_WRONG_TRIES - 1
    assert_no_leak(body, STAGES, allowed=(STAGES[0]["riddle"],))
    # No position at all is not a try.
    assert (await _check(player, run["id"], 1)).status_code == 400

    body = await _there(player, run["id"], 1, 0)
    assert (body["passed"], body["message"]) == (True, "Этап пройден!")
    run = body["run"]
    assert [stage["title"] for stage in run["passed"]] == [STAGES[0]["title"]]
    assert run["passed"][0]["reward"] == STAGES[0]["reward"]
    assert run["current"]["riddle"] == STAGES[1]["riddle"]
    assert (run["current"]["condition"], run["current"]["check_arrival"]) == ("code", True)
    assert run["current"]["tries_left"] == rules.MAX_WRONG_TRIES
    assert_no_leak(run, STAGES[1:], allowed=(STAGES[1]["riddle"],))
    assert_no_leak(
        (await player.get(f"/quest-runs/{run['id']}")).json(), STAGES[1:], allowed=(STAGES[1]["riddle"],)
    )
    # Answering the stage just passed (a stale screen) is not a try.
    stale = await _there(player, run["id"], 1, 0)
    assert (stale["passed"], stale["run"]["stage_number"]) == (True, 2)

    # A code stage that also needs the player on site: a right code from afar is not looked at.
    response = await _check(player, run["id"], 2, lat=CENTER["lat"], lng=CENTER["lng"], answer="Полынь-17")
    assert response.json()["passed"] is False
    assert response.json()["message"].startswith("Вы ещё не на месте")
    wrong = await _there(player, run["id"], 2, 1, answer="полынь 17")
    assert (wrong["passed"], wrong["message"]) == (False, "Код не подошёл. Осталось попыток: 3.")
    right = await _there(player, run["id"], 2, 1, answer="  ПОЛЫНЬ-17 ")
    assert right["passed"] is True

    # An answer stage: case, «ё» and spaces do not matter; it needs no position.
    run = right["run"]
    assert run["current"]["question"] == STAGES[2]["question"]
    assert run["current"]["check_arrival"] is False
    assert_no_leak(run, STAGES[2:], allowed=(STAGES[2]["riddle"], STAGES[2]["question"]))
    last = await _check(player, run["id"], 3, answer="  ЗЕЛЕНАЯ ")
    assert (last.json()["passed"], last.json()["message"]) == (True, "Квест пройден!")
    finished = last.json()["run"]
    assert (finished["finished"], finished["current"], finished["ranked"]) == (True, None, True)
    assert finished["result_s"] is not None
    assert (await _check(player, run["id"], 3, answer="зелёная")).status_code == 409


async def test_wrong_tries_pause_the_run(world: World) -> None:
    _, quest = await _published_quest(world)
    player = await world.actor("player", reputation=20)
    run = await _start(player, quest["id"])
    await _there(player, run["id"], 1, 0)

    for _ in range(rules.MAX_WRONG_TRIES - 1):
        assert (await _there(player, run["id"], 2, 1, answer="нет"))["passed"] is False
    paused = await _there(player, run["id"], 2, 1, answer="нет")
    assert paused["message"].endswith("пауза на минуту.")
    assert paused["run"]["current"]["locked_until"] is not None
    assert paused["run"]["current"]["tries_left"] == 0
    blocked = await _check(
        player, run["id"], 2, lat=STAGES[1]["lat"], lng=STAGES[1]["lng"], answer="Полынь-17"
    )
    assert blocked.status_code == 429
    world.clock.shift(rules.COOLDOWN + timedelta(seconds=1))
    assert (await _there(player, run["id"], 2, 1, answer="Полынь-17"))["passed"] is True


async def test_a_hint_costs_five_minutes(world: World) -> None:
    _, quest = await _published_quest(world)
    player = await world.actor("player", reputation=20)
    run = await _start(player, quest["id"])
    assert run["current"]["hint"] is None

    response = await player.post(f"/quest-runs/{run['id']}/hint", json={"stage": 1})
    assert response.status_code == 200, response.text
    hinted = response.json()
    assert hinted["current"]["hint"] == STAGES[0]["hint"]
    assert (hinted["hints_taken"], hinted["penalty_min"]) == (1, rules.HINT_PENALTY_MIN)
    # Asking again is free; the next stage's hint is still hidden.
    again = (await player.post(f"/quest-runs/{run['id']}/hint", json={"stage": 1})).json()
    assert again["hints_taken"] == 1
    assert_no_leak(again, STAGES[1:])

    run = (await _there(player, run["id"], 1, 0))["run"]
    assert run["passed"][0]["hint_used"] is True
    await _there(player, run["id"], 2, 1, answer="Полынь-17")
    finished = (await _check(player, run["id"], 3, answer="Изумрудная")).json()["run"]
    assert finished["result_s"] >= rules.HINT_PENALTY_MIN * 60


async def test_team_run_shares_progress_and_gives_each_riddle_to_one_member(world: World) -> None:
    author, quest = await _published_quest(world)
    captain = await world.actor("captain", reputation=20)
    mate = await world.actor("mate", reputation=20)
    stranger = await world.actor("stranger", reputation=20)

    run = await _start(captain, quest["id"], team=True, team_name="Чайки")
    code = run["join_code"]
    assert code
    assert len(code) == rules.JOIN_CODE_LENGTH
    assert (await mate.post("/quest-runs/join", json={"code": "nope00"})).status_code == 404
    assert (await author.post("/quest-runs/join", json={"code": code})).status_code == 403
    joined = await mate.post("/quest-runs/join", json={"code": code.lower()})
    assert joined.status_code == 200, joined.text
    run_id = run["id"]
    assert (await stranger.get(f"/quest-runs/{run_id}")).status_code == 404

    # The captain holds the first riddle; the mate is told who has it, and gets nothing of it.
    for_captain = (await captain.get(f"/quest-runs/{run_id}")).json()
    for_mate = (await mate.get(f"/quest-runs/{run_id}")).json()
    assert for_captain["current"]["riddle"] == STAGES[0]["riddle"]
    assert for_mate["current"]["riddle"] is None
    assert for_mate["current"]["riddle_holder"]["id"] == captain.id
    assert_no_leak(for_mate, STAGES)
    assert [member["user"]["id"] for member in for_mate["members"]] == [captain.id, mate.id]

    # Anyone may pass a stage; it opens for both, and the next riddle goes to the next member.
    await _there(mate, run_id, 1, 0)
    for_captain = (await captain.get(f"/quest-runs/{run_id}")).json()
    for_mate = (await mate.get(f"/quest-runs/{run_id}")).json()
    assert for_captain["stage_number"] == for_mate["stage_number"] == 2
    assert for_captain["passed"][0]["passed_by"]["id"] == mate.id
    assert (for_captain["current"]["riddle"], for_mate["current"]["riddle"]) == (None, STAGES[1]["riddle"])
    assert_no_leak(for_captain, STAGES[1:])
    # The captain's screen was still on stage 1: told it is done, not counted.
    stale = await _there(captain, run_id, 1, 0)
    assert (stale["passed"], stale["message"]) == (True, "Этот этап уже пройден — открыт следующий.")

    # Only the captain hands the riddle over.
    assert (await mate.post(f"/quest-runs/{run_id}/lead", json={"user_id": mate.id})).status_code == 403
    handed = await captain.post(f"/quest-runs/{run_id}/lead", json={"user_id": captain.id})
    assert handed.json()["current"]["riddle"] == STAGES[1]["riddle"]

    # The mate leaves: the riddle stays with the captain, the run goes on.
    assert (await mate.post(f"/quest-runs/{run_id}/leave")).status_code == 204
    assert (await mate.get(f"/quest-runs/{run_id}")).status_code == 404
    await _there(captain, run_id, 2, 1, answer="полынь-17")
    finished = (await _check(captain, run_id, 3, answer="зеленая")).json()["run"]
    assert finished["finished"] is True

    board = (await stranger.get(f"/quests/{quest['id']}/results")).json()
    assert [(row["rank"], row["name"], row["is_team"]) for row in board] == [(1, "Чайки", True)]
    assert board[0]["is_mine"] is False


async def test_results_board_ranks_by_time_with_penalty_and_skips_tests_and_replays(world: World) -> None:
    author, quest = await _published_quest(world)
    fast = await world.actor("fast", reputation=20)
    slow = await world.actor("slow", reputation=20)

    async def play(player: Actor, *, hint: bool = False) -> dict[str, Any]:
        run = await _start(player, quest["id"])
        if hint:
            await player.post(f"/quest-runs/{run['id']}/hint", json={"stage": 1})
        await _there(player, run["id"], 1, 0)
        await _there(player, run["id"], 2, 1, answer="Полынь-17")
        return (await _check(player, run["id"], 3, answer="зелёная")).json()["run"]

    await play(slow, hint=True)
    first = await play(fast)
    replay = await play(fast)
    assert (first["ranked"], replay["ranked"]) == (True, False)

    test = await _start(author, quest["id"], test=True)
    assert test["can_confirm_on_site"] is True
    passed = await _check(author, test["id"], 1, on_site=True)
    assert passed.json()["passed"] is True

    board = (await fast.get(f"/quests/{quest['id']}/results")).json()
    assert [row["name"] for row in board] == ["Fast", "Slow"]
    assert board[0]["is_mine"] is True
    assert board[1]["hints"] == 1
    card = (await fast.get(f"/quests/{quest['id']}")).json()
    assert (card["finished_count"], card["has_finished"], card["my_result"]["rank"]) == (2, True, 1)


async def test_who_may_play_and_rate(world: World) -> None:
    author, quest = await _published_quest(world)
    player = await world.actor("player", reputation=20)
    quest_id = quest["id"]

    assert (await author.post(f"/quests/{quest_id}/runs", json={})).status_code == 403
    assert (await player.post(f"/quests/{quest_id}/runs", json={"test": True})).status_code == 403
    run = await _start(player, quest_id)
    assert (await player.post(f"/quests/{quest_id}/runs", json={})).status_code == 409
    # On-site confirmation by a button is for the author's test run only.
    assert (await _check(player, run["id"], 1, on_site=True)).status_code == 400

    review = {"rating": 5, "text": "Отличные загадки!"}
    assert (await player.post(f"/quests/{quest_id}/reviews", json=review)).status_code == 409
    assert (await author.post(f"/quests/{quest_id}/reviews", json=review)).status_code == 403
    await _there(player, run["id"], 1, 0)
    await _there(player, run["id"], 2, 1, answer="Полынь-17")
    await _check(player, run["id"], 3, answer="зелёная")
    response = await player.post(f"/quests/{quest_id}/reviews", json=review)
    assert response.status_code == 200, response.text
    reviews = (await author.get(f"/quests/{quest_id}/reviews")).json()
    assert [item["rating"] for item in reviews] == [5]
    detail = (await player.get(f"/quests/{quest_id}")).json()
    assert (detail["rating_avg"], detail["my_rating"]) == (5.0, 5)

    # A complaint goes through the ordinary mechanism, by the quest's id.
    complaint = await player.post(
        "/complaints", json={"target_type": "route", "target_id": quest_id, "reason": "inaccurate"}
    )
    assert complaint.status_code == 201, complaint.text

    # Anonymous visitors see the card but must sign in to play.
    anonymous = await world.http.post(f"{API}/quests/{quest_id}/runs", json={})
    assert anonymous.status_code == 401


async def test_private_draft_is_tested_by_the_author_then_published(
    world: World, client: AsyncClient
) -> None:
    author = await world.actor("author", reputation=60)
    player = await world.actor("player", reputation=20)
    draft = await _quest(author, visibility="private")
    quest_id = draft["id"]
    assert (await client.get(f"{API}/quests")).json() == []
    assert (await player.get(f"/quests/{quest_id}")).status_code == 404
    assert [card["id"] for card in (await author.get("/me/quests")).json()] == [quest_id]

    test = await _start(author, quest_id, test=True)
    run_id = test["id"]
    await _check(author, run_id, 1, on_site=True)
    await _check(author, run_id, 2, on_site=True, answer="Полынь-17")
    done = (await _check(author, run_id, 3, answer="зелёная")).json()["run"]
    assert (done["finished"], done["ranked"]) == (True, False)

    published = await author.patch(f"/quests/{quest_id}", json={"visibility": "public"})
    assert published.status_code == 200, published.text
    assert published.json()["status"] == "published"
    listed = (await client.get(f"{API}/quests")).json()
    assert [card["id"] for card in listed] == [quest_id]
    assert listed[0]["finished_count"] == 0
    assert (await client.get(f"{API}/quests/{quest_id}/results")).json() == []

    # Editing the stages keeps the editor in step.
    stages = [*STAGES[:2], {**STAGES[2], "answers": ["синяя"]}]
    edited = await author.patch(f"/quests/{quest_id}", json={"stages": stages})
    assert edited.json()["stages"][2]["answers"] == ["синяя"]
    assert (await author.delete(f"/quests/{quest_id}")).status_code == 204
    assert (await client.get(f"{API}/quests/{quest_id}")).status_code == 404


async def test_validation_messages_are_plain(world: World) -> None:
    author = await world.actor("author", reputation=60)
    code_without_code = {**STAGES[1], "answers": []}
    response = await author.post("/quests", json=_body(stages=[STAGES[0], code_without_code]))
    assert response.status_code == 422
    assert {"field": "stages.1", "message": "Укажите код, который игрок получит на месте"} in response.json()[
        "errors"
    ]
    question_missing = {**STAGES[2], "question": ""}
    response = await author.post("/quests", json=_body(stages=[STAGES[0], question_missing]))
    assert response.json()["errors"][0]["message"] == "Напишите вопрос, на который игрок ответит на месте"
    response = await author.post("/quests", json=_body(stages=[STAGES[0]]))
    assert response.status_code == 422
    too_close = {**STAGES[0], "radius_m": 5}
    response = await author.post("/quests", json=_body(stages=[too_close, STAGES[1]]))
    assert response.json()["errors"][0]["field"] == "stages.0.radius_m"


async def test_newcomer_quest_is_on_probation_and_the_hold_names_the_quest(
    world: World, client: AsyncClient
) -> None:
    newcomer = await world.actor("newcomer")
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    fake = world.enable_ai()
    fake.will_say("suspicious", 0.4, "off_topic")
    quest = await _quest(newcomer)
    assert quest["status"] == "published"  # the author sees it as published during the window
    assert (await client.get(f"{API}/quests")).json() == []
    await world.ai_done()

    # The model was shown every stage, codes and stories included.
    submission = fake.calls[-1][1][0]["text"]
    assert '"kind": "quest"' in submission
    assert "Полынь-17" in submission
    assert STAGES[2]["reward"] in submission

    held = (await newcomer.get(f"/quests/{quest['id']}")).json()
    assert held["status"] == "pending"
    assert held["screening_hold"] == {"reasons": ["Нужна ручная проверка модератора"]}
    assert (await client.get(f"{API}/quests/{quest['id']}")).status_code == 404
    notice = (await newcomer.get("/notifications")).json()[0]
    assert notice["title"] == "Квест «Тайны старого центра» не прошёл автоматическую проверку"
    assert notice["link"] == f"/quests/{quest['id']}"

    queue = (await moderator.get("/moderation/queue")).json()
    case = next(item for item in queue if item["target_id"] == quest["id"])
    detail = (await moderator.get(f"/moderation/cases/{case['id']}")).json()
    assert [stage["title"] for stage in detail["quest"]["stages"]] == [stage["title"] for stage in STAGES]
    resolved = await moderator.post(
        f"/moderation/cases/{case['id']}/resolve", json={"action": "approve", "reason": "Нормальный квест"}
    )
    assert resolved.status_code == 200, resolved.text
    assert [card["id"] for card in (await client.get(f"{API}/quests")).json()] == [quest["id"]]
    approval = (await newcomer.get("/notifications")).json()[0]
    assert approval["link"] == f"/quests/{quest['id']}"


async def test_stage_photo_belongs_to_the_riddle_holder(world: World) -> None:
    author = await world.actor("author", reputation=60)
    upload = await author.post("/uploads", files={"file": ("p.png", world.png(), "image/png")})
    photo_id = upload.json()["id"]
    stages = [{**STAGES[0], "photo_id": photo_id}, STAGES[1]]
    quest = await _quest(author, stages=stages, cover_photo_id=None)
    assert quest["stages"][0]["photo"]["id"] == photo_id
    captain = await world.actor("captain", reputation=20)
    mate = await world.actor("mate", reputation=20)
    run = await _start(captain, quest["id"], team=True, team_name="Ласточки")
    await mate.post("/quest-runs/join", json={"code": run["join_code"]})
    assert (await captain.get(f"/quest-runs/{run['id']}")).json()["current"]["photo"]["id"] == photo_id
    assert (await mate.get(f"/quest-runs/{run['id']}")).json()["current"]["photo"] is None
    # Someone else's upload cannot be attached.
    stranger_photo = (
        await mate.post("/uploads", files={"file": ("p.png", world.png(color="red"), "image/png")})
    ).json()["id"]
    response = await author.post("/quests", json=_body(cover_photo_id=stranger_photo))
    assert response.status_code == 422


async def test_an_edit_mid_run_never_shows_a_stage_the_player_did_not_pass(world: World) -> None:
    author, quest = await _published_quest(world)
    player = await world.actor("player", reputation=20)
    run = await _start(player, quest["id"])
    await _there(player, run["id"], 1, 0)
    ids = [stage["id"] for stage in quest["stages"]]

    # The author moves the last stage to the front, keeping the stages' ids.
    reordered = [{**STAGES[2], "id": ids[2]}, {**STAGES[0], "id": ids[0]}, {**STAGES[1], "id": ids[1]}]
    edited = await author.patch(f"/quests/{quest['id']}", json={"stages": reordered})
    assert [stage["id"] for stage in edited.json()["stages"]] == [ids[2], ids[0], ids[1]]

    state = (await player.get(f"/quest-runs/{run['id']}")).json()
    assert [stage["title"] for stage in state["passed"]] == [STAGES[0]["title"]]
    assert (state["stage_number"], state["current"]["position"]) == (2, 1)
    assert state["current"]["riddle"] == STAGES[2]["riddle"]
    assert_no_leak(state, [STAGES[1], STAGES[2]], allowed=(STAGES[2]["riddle"], STAGES[2]["question"]))

    # Stages rewritten from scratch (no ids): the run starts over, and still sees nothing ahead.
    fresh = [{**stage, "title": f"{stage['title']} (новое)"} for stage in STAGES]
    await author.patch(f"/quests/{quest['id']}", json={"stages": fresh})
    state = (await player.get(f"/quest-runs/{run['id']}")).json()
    assert (state["passed"], state["stage_number"]) == ([], 1)
    assert_no_leak(state, [{**stage, "riddle": ""} for stage in fresh[1:]])


async def test_the_demo_quest_is_added_once_to_a_database_with_the_seed_places(
    world: World, client: AsyncClient
) -> None:
    async with world.session() as session:
        assert await demo_quest.apply_demo_quest(session, world.clock_now()) is None  # nothing seeded
    keys = {stage.place for stage in demo_quest.STAGES} | {demo_quest.START_PLACE}
    specs = [spec for spec in tourism.PLACES if spec.key in keys]
    assert len(specs) == len(keys)
    await world.actor(demo_quest.AUTHOR, reputation=200)
    residents = [await world.actor(f"resident{index}", reputation=60) for index in range(len(specs))]
    for resident, spec in zip(residents, specs, strict=True):
        await world.create_place(resident, spec.category, title=spec.title, lat=spec.lat, lng=spec.lng)

    async with world.session() as session:
        quest_id = await demo_quest.apply_demo_quest(session, world.clock_now())
        assert quest_id is not None
        assert await demo_quest.apply_demo_quest(session, world.clock_now()) is None
        await session.commit()

    cards = (await client.get(f"{API}/quests")).json()
    assert [(card["id"], card["stages_count"], card["status"]) for card in cards] == [
        (quest_id, 6, "published")
    ]
    nina = await world.actor("nina-reader")  # any visitor: the card tells nothing of the stages
    assert_no_leak(
        (await nina.get(f"/quests/{quest_id}")).json(),
        [
            {"title": spec.title, "lat": spec.lat, "lng": spec.lng}
            for spec in specs
            if spec.key != demo_quest.START_PLACE
        ],
    )
