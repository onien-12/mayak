"""The judge after the rules: real misses of the rules, a fake LLM, no network."""

import asyncio
import json
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from sqlalchemy import select

from app.services.experimental.external_reviews import client, judge, matcher, rules, twogis
from app.services.experimental.external_reviews.judge import Decision, OpenRouterJudge
from app.services.experimental.external_reviews.matcher import Subject
from app.services.experimental.external_reviews.models import (
    ExternalReviewSource,
    Outcome,
    ReviewMatchEvidence,
)
from app.services.experimental.external_reviews.parser import Organization
from app.services.experimental.external_reviews.resolver import (
    LLM_CHOICE,
    LLM_NONE,
    UNCONFIRMED,
    Resolver,
)
from app.services.experimental.external_reviews.service import ExternalReviewsService, Target
from tests.conftest import API, World
from tests.experimental.test_api import OCEANARIUM, FakePages, oceanarium, page
from tests.experimental.test_twogis import BRIDGE_ID, CONFIG, GEO_REVIEWS

LAT, LNG = 43.1, 131.9
RETRY = rules.RETRY_FAILED_AFTER + timedelta(minutes=1)


def search_url(title: str) -> str:
    return client.search_url(title, OCEANARIUM["lat"], OCEANARIUM["lng"])


def entry(title: str, north_m: float, reviews: int | None = None, kind: str | None = None) -> Organization:
    return Organization(title, title, LAT + north_m / 111_195, LNG, 4.5, None, reviews, (), kind)


def place(title: str, **options: Any) -> Subject:
    return Subject(title, LAT, LNG, **options)


class FakeJudge:
    """Picks the entry with the given title from the prompt it is shown; records every prompt."""

    def __init__(self, pick: str | None = None, *, answer: str | Exception | None = "pick") -> None:
        self.pick = pick
        self.answer = answer
        self.shown: list[list[str]] = []

    async def complete(self, system_prompt: str, user_prompt: str) -> str | None:
        assert system_prompt == judge.SYSTEM_PROMPT
        data = json.loads(user_prompt.removeprefix(judge.DATA_OPEN).removesuffix(judge.DATA_CLOSE))
        titles = [item["title"] for item in data["catalogue_entries"]]
        self.shown.append(titles)
        if isinstance(self.answer, Exception):
            raise self.answer
        if self.answer != "pick":
            return self.answer
        number = None if self.pick is None else titles.index(self.pick) + 1
        return json.dumps({"candidate": number, "reason": "Тест."})


# Misses of the rules observed on live catalogue answers (SPEC §20): our object, what the
# catalogue returned (title, metres from our pin, reviews, catalogue type), what the judge is shown
# and the right answer.
CASES = [
    pytest.param(
        place("Токаревский маяк"),
        [entry("Маяк Токаревского", 2, kind="building"), entry("улица Токаревский Маяк", 751)],
        ["Маяк Токаревского"],
        "Маяк Токаревского",
        id="word-order",
    ),
    pytest.param(
        place("Железнодорожный вокзал"),
        [
            entry("Вокзал Владивосток", 104, 993),
            entry("Бизнес-зал, Железнодорожный вокзал Владивосток", 33),
            entry("Вокзал Владивосток, служба экспресс-доставки", 5),
            entry("Ж/д касса, Вокзал Владивосток", 37),
        ],
        None,
        "Вокзал Владивосток",
        id="station-not-its-lounge",
    ),
    pytest.param(
        place("Приморский океанариум"),
        [
            entry("Приморский океанариум, экспозиционный корпус", 6, 3867),
            entry("Приморский океанариум, дельфинарий", 46, 189),
            entry("Приморский океанариум, касса", 181, 208),
        ],
        None,
        "Приморский океанариум, экспозиционный корпус",
        id="main-building",
    ),
    pytest.param(
        place("Спортивная набережная", area_radius_m=247),
        [entry("Набережная Спортивной гавани", 255, 1496, "adm_div"), entry("Порт Авеню, ресторан", 650)],
        ["Набережная Спортивной гавани"],
        "Набережная Спортивной гавани",
        id="area",
    ),
    pytest.param(
        place("Колесо обозрения на Спортивной набережной"),
        [
            entry("Аттракцион Колесо обозрения", 75, kind="attraction"),
            entry("Карусель, парк аттракционов", 106),
        ],
        None,
        "Аттракцион Колесо обозрения",
        id="attraction",
    ),
    pytest.param(
        place("Ворошиловская батарея", area_radius_m=200),
        [
            entry("Береговая батарея №981 им. товарища Ворошилова, мемориальный комплекс", 28, 43),
            entry("Береговая батарея №981 им. товарища Ворошилова, касса", 127, 55),
        ],
        None,
        "Береговая батарея №981 им. товарища Ворошилова, мемориальный комплекс",
        id="full-name",
    ),
    pytest.param(
        place("Смотровая Нагорного парка", parent_title="Нагорный парк"),
        [
            entry("Смотровая площадка Нагорного парка", 152, 170, "attraction"),
            entry("Нагорный парк", 49, 1847),
        ],
        None,
        "Смотровая площадка Нагорного парка",
        id="inside-a-park",
    ),
    pytest.param(
        place("Миллионка", area_radius_m=205),
        [entry("Миллионка, ресторан", 159, 1091), entry("Миллионка, отели в центре", 175)],
        None,
        None,
        id="businesses-named-after-a-quarter",
    ),
    pytest.param(
        place("Николаевские триумфальные ворота"),
        [entry("Николаевские Триумфальные ворота", 75, kind="building")],
        None,
        "Николаевские Триумфальные ворота",
        id="beyond-fifty-metres",
    ),
    pytest.param(
        place("Фуникулёр"),
        [entry("Нижняя станция фуникулера", 178), entry("на Фуникулере", 330)],
        None,
        "Нижняя станция фуникулера",
        id="station-not-a-cafe",
    ),
]


@pytest.mark.parametrize(("subject", "found", "shown", "answer"), CASES)
async def test_the_judge_settles_what_the_rules_abstain_on(
    subject: Subject, found: list[Organization], shown: list[str] | None, answer: str | None
) -> None:
    assert matcher.match(subject, found) is None, "a miss of the rules"
    fake = FakeJudge(answer)
    verdict = await Resolver(fake).resolve(subject, found)
    assert fake.shown == [shown or [item.title for item in found]], "only entries within the bound"
    assert verdict.organization == next((item for item in found if item.title == answer), None)
    assert verdict.method == (LLM_NONE if answer is None else LLM_CHOICE)


@pytest.mark.parametrize(("subject", "found", "shown", "answer"), CASES)
async def test_without_a_judge_the_rules_alone_decide(
    subject: Subject, found: list[Organization], shown: list[str] | None, answer: str | None
) -> None:
    verdict = await Resolver().resolve(subject, found)
    assert (verdict.organization, verdict.method) == (None, UNCONFIRMED)


async def test_a_match_of_the_rules_never_reaches_the_judge() -> None:
    fake = FakeJudge()
    found = [entry("Приморский океанариум", 10)]
    verdict = await Resolver(fake).resolve(place("Приморский океанариум"), found)
    assert (verdict.organization, verdict.method) == (found[0], "exact_name_nearby")
    assert fake.shown == []


@pytest.mark.parametrize(
    "answer",
    [
        RuntimeError("boom"),
        None,
        "not json",
        '{"reason": "no candidate key"}',
        '{"candidate": 3, "reason": "out of range"}',
        '{"candidate": 0, "reason": "numbered from one"}',
        '{"candidate": true, "reason": "not a number"}',
        '{"candidate": "1", "reason": "a string"}',
    ],
)
async def test_any_failure_of_the_judge_is_an_abstention(answer: Exception | str | None) -> None:
    found = [entry("Маяк Токаревского", 2), entry("Токаревская кошка", 300)]
    verdict = await Resolver(FakeJudge(answer=answer)).resolve(place("Токаревский маяк"), found)
    assert (verdict.organization, verdict.method) == (None, UNCONFIRMED)


async def test_nothing_within_the_bound_is_settled_without_asking() -> None:
    fake = FakeJudge("Маяк Токаревского")
    verdict = await Resolver(fake).resolve(place("Токаревский маяк"), [entry("Маяк Токаревского", 401)])
    assert (verdict.organization, verdict.method) == (None, LLM_NONE)
    assert fake.shown == []


async def test_the_parent_is_vetoed_even_when_the_judge_picks_it() -> None:
    subject = place("Смотровая Нагорного парка", parent_title="Нагорный парк")
    found = [entry("Нагорный парк", 49, 1847), entry("Смотровая площадка", 2000)]
    verdict = await Resolver(FakeJudge("Нагорный парк")).resolve(subject, found)
    assert (verdict.organization, verdict.method) == (None, LLM_NONE)


def test_a_pick_outside_the_bound_or_with_conflicting_records_is_never_offered() -> None:
    subject = place("Токаревский маяк")
    near, far = entry("Маяк Токаревского", 2), entry("Маяк", 401)
    conflicting = [entry("Токаревская кошка", 10), entry("Токаревская кошка", 20)]
    assert matcher.judgeable(subject, [near, far, *conflicting]) == [near]
    assert not matcher.may_accept_judgement(subject, far)
    assert matcher.judgeable(place("Смотровая площадка"), [entry("Смотровая площадка", 1)]) == []


def test_prompt_carries_the_object_and_the_entries_only() -> None:
    subject = place("Миллионка", area_radius_m=205, kind="quarter", parent_title="Центр")
    prompt = judge.user_prompt(subject, [entry("Миллионка", 110, 47, "adm_div")])
    assert prompt.startswith(judge.DATA_OPEN)
    data = json.loads(prompt.removeprefix(judge.DATA_OPEN).removesuffix(judge.DATA_CLOSE))
    assert data == {
        "our_object": {
            "title": "Миллионка",
            "type": "area",
            "radius_m": 205,
            "kind": "quarter",
            "inside_area": "Центр",
        },
        "catalogue_entries": [
            {"number": 1, "title": "Миллионка", "distance_m": 110, "catalogue_type": "adm_div", "reviews": 47}
        ],
    }


def test_parse_decision() -> None:
    assert judge.parse_decision('{"candidate": 2, "reason": "ok"}', 2) == Decision(1, "ok")
    assert judge.parse_decision('{"candidate": null, "reason": "' + "x" * 500 + '"}', 2) == Decision(
        None, "x" * judge.MAX_REASON_LENGTH
    )
    assert judge.parse_decision("[1]", 2) is None


async def test_openrouter_judge_request_retry_and_failures() -> None:
    requests: list[httpx.Request] = []
    replies: list[Exception | httpx.Response] = [
        httpx.ConnectTimeout("slow"),
        httpx.Response(200, json={"choices": [{"message": {"content": '{"candidate": 1, "reason": "ok"}'}}]}),
    ]

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        reply = replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply

    client = OpenRouterJudge("test-key", "typesafe/jev-router", transport=httpx.MockTransport(respond))
    assert await client.complete("system", "user") == '{"candidate": 1, "reason": "ok"}'
    assert len(requests) == 2, "one retry after a transport error"
    body = json.loads(requests[0].content)
    assert body["model"] == "typesafe/jev-router"
    assert body["temperature"] == 0
    assert body["max_tokens"] == judge.MAX_TOKENS
    assert body["response_format"]["json_schema"]["strict"] is True
    assert requests[0].headers["authorization"] == "Bearer test-key"

    replies[:] = [httpx.Response(500), httpx.Response(200)]
    assert await client.complete("system", "user") is None
    assert len(requests) == 3, "an error status is not retried"
    replies[:] = [httpx.ConnectError("down"), httpx.ConnectError("down")]
    assert await client.complete("system", "user") is None


async def test_the_judges_answer_is_bounded_in_time() -> None:
    async def slow(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(1)
        return httpx.Response(200)

    client = OpenRouterJudge("key", "model", transport=httpx.MockTransport(slow), deadline_s=0.05)
    assert await client.complete("system", "user") is None


async def test_2gis_judge_sees_organisations_and_map_objects_together() -> None:
    subject = Subject("Миллионка", LAT, LNG, area_radius_m=205)
    shift = 1 / 111_195

    def item(identifier: str, name: str, kind: str, north_m: float) -> dict[str, Any]:
        return {
            "id": identifier,
            "type": kind,
            "name": name,
            "point": {"lat": LAT + north_m * shift, "lon": LNG},
        }

    branches = [
        item("1", "Миллионка, ресторан", "branch", 159),
        item("2", "Миллионка, отели в центре", "branch", 175),
    ]
    # Two map objects of the very name make the rules abstain on the second search too.
    objects = [item("3", "Миллионка", "adm_div", 110), item("4", "Миллионка", "building", 130)]
    requests: list[str] = []

    async def get(url: str) -> str:
        requests.append(url)
        parts = urlsplit(url)
        if url == twogis.HOME_URL:
            return CONFIG
        if parts.path == "/3.0/items":
            geo = parse_qs(parts.query)["type"] == [twogis.GEO_SEARCH_TYPES]
            return json.dumps({"meta": {"code": 200}, "result": {"items": objects if geo else branches}})
        assert parts.path == "/3.0/geo/3/reviews"
        return json.dumps(GEO_REVIEWS).replace(BRIDGE_ID, "3")

    fake = FakeJudge("Миллионка")
    lookup = await twogis.TwoGisProvider().fetch(Target(subject), get, Resolver(fake))
    assert fake.shown == [["Миллионка, ресторан", "Миллионка, отели в центре", "Миллионка", "Миллионка"]]
    assert (lookup.verdict.method, lookup.found.organization.org_id) == (LLM_CHOICE, "3")
    assert len(requests) == 4


async def test_judge_choice_is_stored_as_evidence_and_unjudged_no_match_is_asked_again(
    world: World, app: Any
) -> None:
    pages = FakePages()
    pages.serve_oceanarium()
    title = "Океанариум на Эгершельде"
    pages.pages[search_url(title)] = page("search.html")
    factory = app.state.database.session_factory
    app.state.settings = app.state.settings.model_copy(update={"external_reviews_enabled": True})
    app.state.external_reviews = ExternalReviewsService(factory, pages, request_interval_s=0)
    place_row = await oceanarium(world, title=title)
    path = f"{API}/places/{place_row['id']}/external-reviews"
    assert (await world.http.get(path)).json()["sources"] == []
    async with world.session() as session:
        assert await session.scalar(select(ReviewMatchEvidence.method)) == UNCONFIRMED

    # With a judge, the rules' old "no match" is asked again, but only after the retry interval.
    fake = FakeJudge("Приморский океанариум")
    app.state.external_reviews = ExternalReviewsService(
        factory, pages, resolver=Resolver(fake), request_interval_s=0
    )
    assert (await world.http.get(path)).json()["sources"] == []
    assert len(pages.requests) == 1
    world.clock.shift(RETRY)
    body = (await world.http.get(path)).json()
    assert [source["source"] for source in body["sources"]] == ["yandex"]
    assert len(pages.requests) == 3
    async with world.session() as session:
        evidence = await session.scalar(select(ReviewMatchEvidence))
        assert (evidence.method, evidence.title) == (LLM_CHOICE, "Приморский океанариум")
        assert await session.scalar(select(ExternalReviewSource.outcome)) is Outcome.MATCHED

    # A judged "no match" is an answer for the whole cache lifetime.
    other = await oceanarium(world, title="Океанариум на Чуркине")
    pages.pages[search_url("Океанариум на Чуркине")] = page("search.html")
    app.state.external_reviews = ExternalReviewsService(
        factory, pages, resolver=Resolver(FakeJudge(None)), request_interval_s=0
    )
    other_path = f"{API}/places/{other['id']}/external-reviews"
    await world.http.get(other_path)
    world.clock.shift(RETRY)
    await world.http.get(other_path)
    assert len(pages.requests) == 4
