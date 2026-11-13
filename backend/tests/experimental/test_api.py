"""External reviews through HTTP: flag, cache, limits, refusals, data minimisation."""

import asyncio
import time
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import func, select

from app.core.clock import utcnow
from app.models import ExternalRatingCache, Place
from app.services.experimental.external_reviews import client, rules, warmup
from app.services.experimental.external_reviews.client import SourceRefusedError, SourceUnavailableError
from app.services.experimental.external_reviews.config import ReviewsSettings
from app.services.experimental.external_reviews.models import ExternalReview, ExternalReviewSource, Outcome
from app.services.experimental.external_reviews.service import ExternalReviewsService
from tests.conftest import API, World

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "yandex"
OCEANARIUM = {"lat": 43.01421, "lng": 131.9302}
TITLE = "Приморский океанариум"
REVIEWER_DATA = (
    "Иван Тестовый",
    "Мария Пример",
    "test-public-id",
    "get-yapic",
    "Знаток города",
    "avatarUrl",
    "professionLevel",
)


def page(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


class FakePages:
    """Serves saved pages by URL; anything unknown is a captcha. Records every request."""

    def __init__(self, delay_s: float = 0.0) -> None:
        self.pages: dict[str, str | Exception] = {}
        self.requests: list[tuple[str, float]] = []
        self.delay_s = delay_s

    def serve_oceanarium(self) -> None:
        self.pages[client.search_url(TITLE, OCEANARIUM["lat"], OCEANARIUM["lng"])] = page("search.html")
        self.pages[client.reviews_url("211680110089")] = page("reviews.html")

    async def get(self, url: str) -> str:
        self.requests.append((url, time.monotonic()))
        await asyncio.sleep(self.delay_s)
        answer = self.pages.get(url, page("captcha.html"))
        if isinstance(answer, Exception):
            raise answer
        return answer


def enable(app: Any, pages: FakePages, **options: Any) -> None:
    app.state.settings = app.state.settings.model_copy(update={"external_reviews_enabled": True})
    app.state.external_reviews = ExternalReviewsService(
        app.state.database.session_factory, pages, **{"request_interval_s": 0.01, **options}
    )


def unread_pages(directory: Path) -> list[str]:
    return [file.read_text(encoding="utf-8") for file in sorted(directory.iterdir())]


async def oceanarium(world: World, **overrides: Any) -> dict[str, Any]:
    author = await world.actor(f"author{world._counter}", reputation=20)
    return await world.create_place(author, "culture_space", **{"title": TITLE, **OCEANARIUM, **overrides})


async def test_disabled_by_default_and_answers_without_touching_anything(world: World, app: Any) -> None:
    assert app.state.settings.external_reviews_enabled is False
    for path in ("/places/999/external-reviews", "/areas/999/external-reviews"):
        response = await world.http.get(f"{API}{path}")
        assert response.status_code == 200
        assert response.json() == {"enabled": False, "sources": []}


async def test_reviews_are_fetched_once_cached_and_carry_no_personal_data(world: World, app: Any) -> None:
    pages = FakePages()
    pages.serve_oceanarium()
    enable(app, pages)
    place = await oceanarium(world)

    body = (await world.http.get(f"{API}/places/{place['id']}/external-reviews")).json()
    assert body["enabled"] is True
    [source] = body["sources"]
    assert (source["source"], source["label"], source["url"]) == (
        "yandex",
        "Яндекс Карты",
        "https://yandex.ru/maps/org/211680110089/",
    )
    assert (source["rating"], source["ratings_count"], source["reviews_count"]) == (5.0, 37615, 13577)
    assert [review["rating"] for review in source["reviews"]] == [5, 4, None]
    assert all(set(review) == {"rating", "text", "published_at"} for review in source["reviews"])
    assert max(len(review["text"]) for review in source["reviews"]) == 600
    assert len(source["photos"]) == 2
    assert len(pages.requests) == 2

    again = (await world.http.get(f"{API}/places/{place['id']}/external-reviews")).json()
    assert again == body
    assert len(pages.requests) == 2, "served from the cache"

    async with world.session() as session:
        rows = [
            *await session.scalars(select(ExternalReviewSource)),
            *await session.scalars(select(ExternalReview)),
        ]
    stored = repr([vars(row) for row in rows])
    assert not any(marker in stored for marker in REVIEWER_DATA)
    assert not any(marker in str(body) for marker in REVIEWER_DATA)


async def test_cache_expires_after_a_week(world: World, app: Any) -> None:
    pages = FakePages()
    pages.serve_oceanarium()
    enable(app, pages)
    place = await oceanarium(world)
    await world.http.get(f"{API}/places/{place['id']}/external-reviews")
    world.clock.shift(rules.CACHE_TTL + timedelta(minutes=1))
    await world.http.get(f"{API}/places/{place['id']}/external-reviews")
    assert len(pages.requests) == 4


async def test_no_match_is_cached_too(world: World, app: Any) -> None:
    pages = FakePages()
    pages.serve_oceanarium()
    enable(app, pages)
    place = await oceanarium(world, title="Нерпинарий", lat=OCEANARIUM["lat"])
    pages.pages[client.search_url("Нерпинарий", OCEANARIUM["lat"], OCEANARIUM["lng"])] = page("search.html")
    for _ in range(2):
        body = (await world.http.get(f"{API}/places/{place['id']}/external-reviews")).json()
        assert body["enabled"] is True
        assert body["sources"] == []
        assert {link["source"] for link in body["links"]} == {"yandex", "2gis", "google"}
    assert len(pages.requests) == 1
    async with world.session() as session:
        assert await session.scalar(select(ExternalReviewSource.outcome)) is Outcome.NO_MATCH


async def test_only_named_sights_and_facilities_and_areas(world: World, app: Any) -> None:
    pages = FakePages()
    enable(app, pages)
    author = await world.actor("author", reputation=20)
    anonymous = await world.create_place(author, "toilet", title="Общественный туалет")
    body = (await world.http.get(f"{API}/places/{anonymous['id']}/external-reviews")).json()
    assert body == {"enabled": True, "sources": []}
    assert pages.requests == []
    library = await world.create_place(author, "library", title="Библиотека имени Горького")
    await world.http.get(f"{API}/places/{library['id']}/external-reviews")
    assert len(pages.requests) == 1, "a named facility is looked up"
    assert (await world.http.get(f"{API}/places/999/external-reviews")).status_code == 404
    assert (await world.http.get(f"{API}/areas/999/external-reviews")).status_code == 404


async def test_a_captcha_ends_only_that_lookup_and_is_retried_in_an_hour(world: World, app: Any) -> None:
    pages = FakePages()
    enable(app, pages)
    first = await oceanarium(world)
    assert (await world.http.get(f"{API}/places/{first['id']}/external-reviews")).json()["sources"] == []
    assert len(pages.requests) == 1
    async with world.session() as session:
        assert await session.scalar(select(ExternalReviewSource.outcome)) is Outcome.BLOCKED

    pages.serve_oceanarium()
    second = await oceanarium(world, title="Океанариум на Русском")
    pages.pages[client.search_url("Океанариум на Русском", **OCEANARIUM)] = page("search.html")
    assert (await world.http.get(f"{API}/places/{second['id']}/external-reviews")).json()["sources"] == []
    assert len(pages.requests) == 2, "other targets are asked as usual"
    world.clock.shift(rules.RETRY_FAILED_AFTER - timedelta(minutes=1))
    assert (await world.http.get(f"{API}/places/{first['id']}/external-reviews")).json()["sources"] == []
    assert len(pages.requests) == 2, "the refused target waits for its retry"

    world.clock.shift(timedelta(minutes=2))
    body = (await world.http.get(f"{API}/places/{first['id']}/external-reviews")).json()
    assert len(body["sources"]) == 1
    assert len(pages.requests) == 4


@pytest.mark.parametrize(
    ("failure", "outcome"),
    [
        (SourceRefusedError("HTTP 302"), Outcome.BLOCKED),
        (SourceUnavailableError("ReadTimeout"), Outcome.FAILED),
        ("<html>stub</html>", Outcome.FAILED),
    ],
)
async def test_a_refusal_or_an_unreadable_answer_ends_only_that_lookup(
    world: World, app: Any, failure: Exception | str, outcome: Outcome
) -> None:
    pages = FakePages()
    enable(app, pages)
    place = await oceanarium(world)
    pages.pages[client.search_url(TITLE, OCEANARIUM["lat"], OCEANARIUM["lng"])] = failure
    assert (await world.http.get(f"{API}/places/{place['id']}/external-reviews")).json()["sources"] == []
    async with world.session() as session:
        assert await session.scalar(select(ExternalReviewSource.outcome)) is outcome
    pages.serve_oceanarium()
    other = await oceanarium(world, title="Океанариум на Русском")
    await world.http.get(f"{API}/places/{other['id']}/external-reviews")
    assert len(pages.requests) == 2, "the source stays on"


async def test_a_failed_lookup_is_retried_in_an_hour(world: World, app: Any, tmp_path: Path) -> None:
    pages = FakePages()
    enable(app, pages, failure_dump_dir=tmp_path / "unread")
    place = await oceanarium(world)
    path = f"{API}/places/{place['id']}/external-reviews"
    pages.pages[client.search_url(TITLE, OCEANARIUM["lat"], OCEANARIUM["lng"])] = "<html>stub</html>"
    assert (await world.http.get(path)).json()["sources"] == []
    assert unread_pages(tmp_path / "unread") == ["<html>stub</html>"]
    pages.serve_oceanarium()
    world.clock.shift(rules.RETRY_FAILED_AFTER - timedelta(minutes=1))
    assert (await world.http.get(path)).json()["sources"] == []
    assert len(pages.requests) == 1
    world.clock.shift(timedelta(minutes=2))
    assert len((await world.http.get(path)).json()["sources"]) == 1


async def test_failures_in_a_row_never_switch_the_source_off(world: World, app: Any) -> None:
    pages = FakePages()
    enable(app, pages, request_interval_s=0)
    titles = ["Океанариум на Русском", "Океанариум на Попова", "Океанариум на Змеинке"]
    for title in titles:
        place = await oceanarium(world, title=title)
        pages.pages[client.search_url(title, OCEANARIUM["lat"], OCEANARIUM["lng"])] = "<html>stub</html>"
        await world.http.get(f"{API}/places/{place['id']}/external-reviews")
    pages.serve_oceanarium()
    place = await oceanarium(world)
    assert len((await world.http.get(f"{API}/places/{place['id']}/external-reviews")).json()["sources"]) == 1
    assert len(pages.requests) == 5


async def test_the_daily_cap_is_a_setting(world: World, app: Any) -> None:
    pages = FakePages()
    pages.serve_oceanarium()
    enable(app, pages, daily_cap=3)
    first, second = await oceanarium(world), await oceanarium(world, title="Океанариум на Русском")
    assert len((await world.http.get(f"{API}/places/{first['id']}/external-reviews")).json()["sources"]) == 1
    await world.http.get(f"{API}/places/{second['id']}/external-reviews")
    assert len(pages.requests) == 2, "two more would exceed three a day"
    with pytest.raises(ValueError, match="positive"):
        ReviewsSettings(_env_file=None, daily_request_cap=0)
    assert ReviewsSettings(_env_file=None).daily_request_cap == rules.DAILY_REQUEST_CAP == 10_000


async def test_requests_are_spaced_and_capped_per_day(world: World, app: Any) -> None:
    pages = FakePages()
    pages.serve_oceanarium()
    enable(app, pages, request_interval_s=0.2)
    place = await oceanarium(world)
    await world.http.get(f"{API}/places/{place['id']}/external-reviews")
    (_, first_at), (_, second_at) = pages.requests
    assert second_at - first_at >= 0.2

    async with world.session() as session:
        session.add(
            ExternalReviewSource(
                outcome=Outcome.NO_MATCH, requests=rules.DAILY_REQUEST_CAP - 1, fetched_at=utcnow()
            )
        )
        await session.commit()
    other = await oceanarium(world, title="Океанариум на Русском")
    capped = await world.http.get(f"{API}/places/{other['id']}/external-reviews")
    assert capped.status_code == 200, capped.text
    assert capped.json()["sources"] == []
    assert len(pages.requests) == 2, "the daily cap leaves no room for another fetch"


async def test_a_slow_source_answers_empty_and_fills_the_cache_later(world: World, app: Any) -> None:
    pages = FakePages(delay_s=0.2)
    pages.serve_oceanarium()
    enable(app, pages, deadline_s=0.05)
    place = await oceanarium(world)
    first = (await world.http.get(f"{API}/places/{place['id']}/external-reviews")).json()
    assert first["sources"] == []
    assert first["pending"] is True
    await asyncio.sleep(0.6)
    ready = (await world.http.get(f"{API}/places/{place['id']}/external-reviews")).json()
    assert len(ready["sources"]) == 1
    assert not ready.get("pending", False)
    assert len(pages.requests) == 2


async def test_areas_are_looked_up_by_their_title(world: World, app: Any) -> None:
    pages = FakePages()
    enable(app, pages)
    moderator = await world.actor("moderator", reputation=60)
    area = await moderator.post(
        "/areas", json={"title": TITLE, "kind": "complex", **OCEANARIUM, "radius_m": 100}
    )
    assert area.status_code == 201, area.text
    label = area.json()
    pages.pages[client.search_url(TITLE, label["lat"], label["lng"])] = page("search.html")
    pages.pages[client.reviews_url("211680110089")] = page("reviews.html")
    body = (await world.http.get(f"{API}/areas/{label['id']}/external-reviews")).json()
    assert len(body["sources"]) == 1
    async with world.session() as session:
        assert await session.scalar(select(func.count()).select_from(ExternalReviewSource)) == 1


async def test_the_summary_row_reads_the_cache_and_never_asks(world: World, app: Any) -> None:
    pages = FakePages()
    pages.serve_oceanarium()
    enable(app, pages)
    place = await oceanarium(world)
    path = f"{API}/places/{place['id']}/external-reviews"
    cached = (await world.http.get(path, params={"cached_only": "true"})).json()
    assert cached["enabled"] is True
    assert cached["sources"] == []
    assert len(cached["links"]) == 3
    assert pages.requests == []
    full = (await world.http.get(path)).json()
    assert (await world.http.get(path, params={"cached_only": "true"})).json() == full
    assert len(pages.requests) == 2


async def test_warm_up_takes_areas_and_places_in_turns_and_stops_at_a_refusal(world: World, app: Any) -> None:
    pages = FakePages()
    pages.serve_oceanarium()
    first = await oceanarium(world)
    second = await oceanarium(world, title="Океанариум на Русском")
    moderator = await world.actor("moderator", reputation=60)
    area = (
        await moderator.post(
            "/areas",
            json={"title": "Мыс Эгершельд", "kind": "other", "lat": 43.2, "lng": 131.95, "radius_m": 200},
        )
    ).json()
    service = ExternalReviewsService(app.state.database.session_factory, pages, request_interval_s=0.01)
    async with world.session() as session:
        queue = await warmup.candidates(session, limit=10)
    assert [(target.area_id, target.place_id) for target in queue] == [
        (area["id"], None),
        (None, first["id"]),
        (None, second["id"]),
    ]
    outcomes = await warmup.run(service, queue)
    assert outcomes == {"blocked": 1}, "the unknown search page is a captcha: the run stops at once"
    assert len(pages.requests) == 1

    world.clock.shift(rules.RETRY_FAILED_AFTER + timedelta(minutes=1))
    async with world.session() as session:
        queue = await warmup.candidates(session, limit=10)
    assert [target.place_id for target in queue] == [None, first["id"], second["id"]]
    pages.pages[client.search_url("Мыс Эгершельд", area["lat"], area["lng"])] = page("search.html")
    pages.pages[client.search_url("Океанариум на Русском", OCEANARIUM["lat"], OCEANARIUM["lng"])] = page(
        "search.html"
    )
    assert await warmup.run(service, queue) == {"no_match": 2, "matched": 1}
    async with world.session() as session:
        assert await warmup.candidates(session, limit=10) == []


async def test_unverified_2gis_rating_cache_does_not_bypass_identity_checks(world: World, app: Any) -> None:
    pages = FakePages()
    enable(app, pages)
    place = await oceanarium(world)
    async with world.session() as session:
        row = await session.get(Place, place["id"])
        row.object_id = "70000001024450259"
        session.add(
            ExternalRatingCache(
                object_id=row.object_id,
                rating=4.9,
                count=3867,
                succeeded=True,
                fetched_at=utcnow(),
            )
        )
        await session.commit()
    path = f"{API}/places/{place['id']}/external-reviews"
    cached = (await world.http.get(path, params={"cached_only": "true"})).json()
    assert cached["sources"] == []
    assert [link["source"] for link in cached["links"]] == ["yandex", "2gis", "google"]
    assert pages.requests == []
    blocked = (await world.http.get(path)).json()
    assert blocked["sources"] == []
    assert len(pages.requests) == 1
    world.clock.shift(rules.CACHE_TTL + timedelta(minutes=1))
    assert (await world.http.get(path, params={"cached_only": "true"})).json()["sources"] == []


async def test_changed_yandex_review_structure_is_not_cached_as_success(world: World, app: Any) -> None:
    pages = FakePages()
    pages.serve_oceanarium()
    pages.pages[client.reviews_url("211680110089")] = (
        '<script type="application/json" class="state-view">{"different": []}</script>'
    )
    enable(app, pages)
    place = await oceanarium(world)
    answer = (await world.http.get(f"{API}/places/{place['id']}/external-reviews")).json()
    assert answer["sources"] == []
    async with world.session() as session:
        assert await session.scalar(select(ExternalReviewSource.outcome)) is Outcome.FAILED
