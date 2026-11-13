"""Identity regressions for the matcher, not catalogue-wide accuracy measurements."""

import asyncio
import json
from dataclasses import replace
from itertools import permutations
from typing import Any

import pytest
from sqlalchemy import delete, select

from app.core.clock import utcnow
from app.models import ExternalRatingCache, Place
from app.services.experimental.external_reviews import client, google, matcher, parser, twogis, warmup
from app.services.experimental.external_reviews.google import GoogleProvider
from app.services.experimental.external_reviews.hub import ReviewsHub
from app.services.experimental.external_reviews.models import (
    CatalogueReviewSource,
    ExternalReviewSource,
    Outcome,
    ReviewMatchEvidence,
)
from app.services.experimental.external_reviews.parser import Organization
from app.services.experimental.external_reviews.service import ExternalReviewsService, Target
from tests.conftest import API, World
from tests.experimental.test_api import OCEANARIUM, TITLE, FakePages, enable, oceanarium, page
from tests.experimental.test_google import GooglePages, fixture
from tests.experimental.test_twogis import CATALOGUE, ORG_ID, TwoGisPages

SUBJECT = matcher.Subject(TITLE, **OCEANARIUM)


def test_yandex_conflicting_copies_are_not_silently_deduplicated() -> None:
    item = {
        "id": "123",
        "title": TITLE,
        "coordinates": [SUBJECT.lng, SUBJECT.lat],
        "ratingData": {},
    }
    state = {"results": {"items": [item, item, {**item, "title": TITLE + ", касса"}]}}
    html = '<script type="application/json" class="state-view">' + json.dumps(state) + "</script>"
    results = parser.parse_search(html)
    assert len(results) == 2
    assert matcher.match(SUBJECT, results) is None


def test_google_competitor_after_fifth_result_still_vetoes_match() -> None:
    root = fixture("search.json")
    exact = json.loads(json.dumps(root[64][0]))
    exact[1][11] = TITLE
    competitor = json.loads(json.dumps(exact))
    competitor[1][10] = "0x123:0x456"
    root[64] = [exact, *([root[64][1]] * 4), competitor]
    results = google.parse_search(json.dumps(root))
    assert matcher.match(SUBJECT, results[:5]) is not None
    assert matcher.match(SUBJECT, results) is None


def org(title: str = TITLE, *, identifier: str = "1", north_m: float = 10) -> Organization:
    return Organization(identifier, title, SUBJECT.lat + north_m / 111_195, SUBJECT.lng, 5, 10, 5, ())


@pytest.mark.parametrize(
    "candidate",
    [
        "Приморский океанариум, дельфинарий",
        "Приморский океанариум, экспозиционный корпус",
        "Приморский океанариум Научно-образовательный комплекс",
        "Научно-образовательный комплекс «Приморский океанариум», музей",
    ],
)
def test_a_fuller_wording_or_a_rubric_extends_the_name(candidate: str) -> None:
    item = org(candidate)
    assert matcher.match(SUBJECT, [item]) == item
    assert matcher.method(SUBJECT, item) == "extended_name_nearby"
    assert matcher.match(SUBJECT, [org(candidate, north_m=60)]) is None


@pytest.mark.parametrize(
    "candidate",
    [
        "Приморский океанариум, касса",
        "Кафе Приморский океанариум",
        "Приморский океанариум, ресторан",
        "Бизнес-зал, Приморский океанариум",
        "Музей Приморский океанариум",
        "Приморские океанариумы",
        "Океанариум",
    ],
)
def test_businesses_departments_and_partial_names_are_not_proof(candidate: str) -> None:
    assert matcher.match(SUBJECT, [org(candidate)]) is None


@pytest.mark.parametrize("distance", [60, 200, 399, 1000])
def test_exact_name_of_a_place_outside_small_radius_is_not_proof(distance: float) -> None:
    assert matcher.match(SUBJECT, [org(north_m=distance)]) is None


def test_a_territory_is_pinned_anywhere_inside_it() -> None:
    park = replace(SUBJECT, title="Нагорный парк", area_radius_m=100)
    exact, fuller = org(park.title, north_m=350), org("Нагорный парк культуры", north_m=90)
    assert matcher.match(park, [exact]) == exact
    assert matcher.match(park, [org(park.title, north_m=450)]) is None
    assert matcher.match(park, [fuller]) == fuller
    assert matcher.match(park, [org(fuller.title, north_m=150)]) is None
    assert matcher.match(park, [org("Нагорный парк, ресторан", north_m=20)]) is None


def test_a_long_object_is_accepted_by_its_exact_name_only() -> None:
    bridge = replace(SUBJECT, title="Русский мост")
    exact = org(bridge.title, north_m=1200)
    assert matcher.match(bridge, [exact]) == exact
    assert matcher.match(bridge, [org("Русский мост, смотровая", north_m=1200)]) is None


@pytest.mark.parametrize("title", ["Смотровая площадка", "Кафе", "Парк", "Музей"])
def test_generic_name_at_same_point_is_not_proof(title: str) -> None:
    assert matcher.match(replace(SUBJECT, title=title), [org(title, north_m=0)]) is None


def test_only_case_punctuation_yo_and_word_order_are_ignored() -> None:
    target = replace(SUBJECT, title="Кафе «Ёж»")
    candidate = org("еж, КАФЕ")
    assert matcher.match(target, [candidate]) == candidate
    assert matcher.match(target, [org("Кафе Ёжик")]) is None


def test_nearby_branches_cannot_be_resolved_by_distance_or_result_order() -> None:
    target = replace(SUBJECT, title="Кофейня Море")
    first = org(target.title, identifier="first", north_m=10)
    second = org(target.title, identifier="second", north_m=200)
    for ordering in permutations([first, second]):
        assert matcher.match(target, ordering) is None


def test_a_nearby_department_vetoes_even_an_exact_result() -> None:
    whole = org()
    cashier = org(TITLE + ", касса", identifier="cashier")
    for ordering in permutations([whole, cashier]):
        assert matcher.match(SUBJECT, ordering) is None


def test_duplicate_same_id_is_ok_but_conflicting_records_are_not() -> None:
    item = org()
    assert matcher.match(SUBJECT, [item, item]) == item
    assert matcher.match(SUBJECT, [item, replace(item, lat=item.lat + 0.0001)]) is None


def test_unrelated_and_distant_results_do_not_hide_an_exact_match() -> None:
    item = org()
    assert matcher.match(SUBJECT, [org("Кафе Нерпа", identifier="other"), item]) == item
    assert matcher.match(SUBJECT, [org(identifier="far", north_m=1000), item]) == item


def test_a_sixth_result_can_veto_but_cannot_establish_a_match() -> None:
    unrelated = [org(f"Кафе {i}", identifier=str(i + 10)) for i in range(4)]
    item, other = org(), org(identifier="other", north_m=200)
    assert matcher.match(SUBJECT, [item, *unrelated, other]) is None
    assert matcher.match(SUBJECT, [*unrelated, other, item]) is None


def test_saved_live_shapes_are_not_forced_to_match_the_oceanarium() -> None:
    assert matcher.match(SUBJECT, twogis.parse_catalogue(json.dumps(CATALOGUE))) is None, "two buildings"
    found = matcher.match(SUBJECT, google.parse_search(json.dumps(fixture("search.json"))))
    assert found.title == "Приморский океанариум Научно-образовательный комплекс"
    linked = matcher.linked(SUBJECT, twogis.parse_catalogue(json.dumps(CATALOGUE)), ORG_ID)
    assert linked.org_id == ORG_ID
    assert matcher.linked(SUBJECT, [org(identifier=ORG_ID, north_m=2000)], ORG_ID) is None
    assert matcher.linked(SUBJECT, [org()], "missing") is None


def hub(app: Any, *, exact: bool) -> tuple[FakePages, TwoGisPages, GooglePages]:
    pages = FakePages(), TwoGisPages(exact=exact), GooglePages(exact=exact)
    pages[0].serve_oceanarium()
    app.state.settings = app.state.settings.model_copy(update={"external_reviews_enabled": True})
    app.state.external_reviews = ReviewsHub(
        [
            ExternalReviewsService(app.state.database.session_factory, pages[0], request_interval_s=0),
            ExternalReviewsService(
                app.state.database.session_factory,
                pages[1],
                provider=twogis.TwoGisProvider(),
                request_interval_s=0,
            ),
            ExternalReviewsService(
                app.state.database.session_factory, pages[2], provider=GoogleProvider(), request_interval_s=0
            ),
        ]
    )
    return pages


async def test_an_unconfirmed_provider_does_not_load_reviews_or_expose_rating_or_photos(
    world: World, app: Any
) -> None:
    pages = hub(app, exact=False)
    place = await oceanarium(world)
    path = f"{API}/places/{place['id']}/external-reviews"
    body = (await world.http.get(path)).json()
    assert [s["source"] for s in body["sources"]] == ["yandex", "google"]
    assert len(pages[1].requests) == 3, "web config, organisations, map objects"
    assert len(pages[2].requests) == 3
    assert "/search/" in next(link["url"] for link in body["links"] if link["source"] == "2gis")
    assert (await world.http.get(path)).json() == body
    async with world.session() as session:
        row = await session.scalar(
            select(CatalogueReviewSource).where(CatalogueReviewSource.source == "2gis")
        )
        assert row.outcome is Outcome.NO_MATCH
        assert row.rating is None
        assert not row.photos
        assert not row.reviews
        methods = dict(
            (await session.execute(select(ReviewMatchEvidence.source, ReviewMatchEvidence.method))).all()
        )
        assert methods == {
            "yandex": "exact_name_nearby",
            "2gis": "unconfirmed",
            "google": "extended_name_nearby",
        }


@pytest.mark.parametrize("change", ["title", "lat", "lng", "object_id"])
async def test_identity_edits_hide_all_cached_sources_without_network(
    world: World, app: Any, change: str
) -> None:
    pages = hub(app, exact=True)
    place = await oceanarium(world)
    path = f"{API}/places/{place['id']}/external-reviews"
    assert len((await world.http.get(path)).json()["sources"]) == 3
    requests = [len(p.requests) for p in pages]
    async with world.session() as session:
        row = await session.get(Place, place["id"])
        setattr(row, change, {"title": "Другое место", "lat": 43.2, "lng": 132, "object_id": "123"}[change])
        await session.commit()
    assert (await world.http.get(path, params={"cached_only": True})).json()["sources"] == []
    assert [len(p.requests) for p in pages] == requests
    async with world.session() as session:
        for source in ("yandex", "2gis", "google"):
            assert place["id"] in [t.place_id for t in await warmup.candidates(session, 10, source)]


async def test_legacy_cache_is_hidden_then_rechecked_without_erasing_budget(world: World, app: Any) -> None:
    pages = hub(app, exact=True)
    place = await oceanarium(world)
    path = f"{API}/places/{place['id']}/external-reviews"
    await world.http.get(path)
    async with world.session() as session:
        await session.execute(delete(ReviewMatchEvidence))
        await session.commit()
    assert (await world.http.get(path, params={"cached_only": True})).json()["sources"] == []
    assert [len(p.requests) for p in pages] == [2, 3, 3]
    assert len((await world.http.get(path)).json()["sources"]) == 3
    async with world.session() as session:
        assert await session.scalar(select(ExternalReviewSource.requests)) == 4
        assert list(await session.scalars(select(CatalogueReviewSource.requests))) == [5, 5]
        evidence = list(await session.scalars(select(ReviewMatchEvidence)))
        assert len(evidence) == 3
        assert all(e.title == TITLE and e.lat is not None and e.lng is not None for e in evidence)
        assert all(e.method == "exact_name_nearby" for e in evidence)


async def test_old_pending_fetch_cannot_answer_for_renamed_target(world: World, app: Any) -> None:
    started, release = asyncio.Event(), asyncio.Event()

    class PausedPages(FakePages):
        async def get(self, url: str) -> str:
            if not started.is_set():
                started.set()
                await release.wait()
            return await super().get(url)

    pages = PausedPages()
    pages.serve_oceanarium()
    pages.pages[client.search_url("Другое место", **OCEANARIUM)] = page("search.html")
    enable(app, pages, request_interval_s=0)
    place = await oceanarium(world)
    service = app.state.external_reviews
    old = Target(SUBJECT, place_id=place["id"])
    new = replace(old, subject=replace(SUBJECT, title="Другое место"))
    old_task = asyncio.create_task(service.reviews_for(old))
    await asyncio.wait_for(started.wait(), 2)
    new_task = asyncio.create_task(service.reviews_for(new))
    release.set()
    await old_task
    assert not (await new_task).sources
    assert not (await service.cached_for(new)).sources
    assert len(pages.requests) == 3


async def test_explicit_2gis_binding_and_rating_fallback_require_current_evidence(
    world: World, app: Any
) -> None:
    pages = hub(app, exact=False)
    place = await oceanarium(world)
    async with world.session() as session:
        row = await session.get(Place, place["id"])
        row.object_id = ORG_ID
        session.add(
            ExternalRatingCache(object_id=ORG_ID, rating=4.9, count=30, succeeded=True, fetched_at=utcnow())
        )
        await session.commit()
    path = f"{API}/places/{place['id']}/external-reviews"
    assert (await world.http.get(path, params={"cached_only": True})).json()["sources"] == []
    body = (await world.http.get(path)).json()
    assert [s["source"] for s in body["sources"]] == ["yandex", "2gis", "google"]
    async with world.session() as session:
        proof = await session.scalar(select(ReviewMatchEvidence).where(ReviewMatchEvidence.source == "2gis"))
        assert proof.method == "explicit_id"
        assert proof.org_id == ORG_ID
    # Even when 2GIS text loading is disabled, its official rating needs the same verified binding.
    app.state.external_reviews = ExternalReviewsService(
        app.state.database.session_factory, pages[0], request_interval_s=0
    )
    cached = (await world.http.get(path, params={"cached_only": True})).json()
    assert cached["sources"][1]["reviews_available"] is False
    async with world.session() as session:
        row = await session.get(Place, place["id"])
        row.lat = 43.2
        await session.commit()
    assert (await world.http.get(path, params={"cached_only": True})).json()["sources"] == []
