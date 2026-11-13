"""Anonymous web API shapes, organisation binding and independent provider caches."""

import asyncio
import json
from copy import deepcopy
from dataclasses import replace
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import select

from app.core.clock import utcnow
from app.models import ExternalRatingCache, Place
from app.services.experimental.external_reviews import rules, twogis, warmup
from app.services.experimental.external_reviews.hub import ReviewsHub
from app.services.experimental.external_reviews.matcher import Subject
from app.services.experimental.external_reviews.models import (
    CatalogueReviewSource,
    ExternalReviewSource,
    Outcome,
)
from app.services.experimental.external_reviews.parser import UnexpectedPageError
from app.services.experimental.external_reviews.resolver import Resolver
from app.services.experimental.external_reviews.service import ExternalReviewsService, Target
from tests.conftest import API, World
from tests.experimental.test_api import FakePages, oceanarium

ORG_ID = "70000001024450259"
CONFIG = '{"webApiKey":"public-catalogue-test","reviewApiKey":"public-review-test"}'
# Same shape as the live web response; synthetic texts and identities only.
CATALOGUE = {
    "meta": {"code": 200},
    "result": {
        "items": [
            {
                "id": "70000001094182480_tracking",
                "type": "branch",
                "name": "Приморский океанариум, дельфинарий",
                "point": {"lat": 43.014495, "lon": 131.930618},
            },
            {
                "id": ORG_ID + "_tracking-123",
                "type": "branch",
                "name": "Приморский океанариум, экспозиционный корпус",
                "point": {"lat": 43.01417, "lon": 131.930253},
                "reviews": {
                    "general_rating": 4.9,
                    "general_review_count": 30,
                    "general_review_count_with_stars": 40,
                },
            },
        ]
    },
}
REVIEW = {
    "id": "synthetic-review",
    "provider": "2gis",
    "object": {"id": ORG_ID, "type": "branch"},
    "rating": 5,
    "text": "<b>Просторный</b> зал &amp; интересная экспозиция.",
    "date_created": "2026-11-01T12:30:00+10:00",
    "date_edited": "2026-11-02T12:30:00+10:00",
    "is_hidden": False,
    "on_moderation": False,
    "user": {"name": "Synthetic Private Author", "id": "private-user-id", "avatar": "private-avatar"},
    "official_answer": {"text": "Private reply"},
}
REVIEWS = {
    "meta": {"code": 200, "branch_rating": 4.9, "branch_reviews_count": 30, "total_count": 29},
    "reviews": [REVIEW],
}


class TwoGisPages:
    def __init__(self, *, delay: float = 0, fail: bool = False, exact: bool = False) -> None:
        self.requests: list[str] = []
        self.delay = delay
        self.fail = fail
        self.exact = exact

    async def get(self, url: str) -> str:
        self.requests.append(url)
        await asyncio.sleep(self.delay)
        if self.fail:
            return "<html>Browser check</html>"
        parts = urlsplit(url)
        if url == twogis.HOME_URL:
            return CONFIG
        query = {k: v[0] for k, v in parse_qs(parts.query).items()}
        if parts.hostname == "catalog.api.2gis.ru":
            checksum = query.pop("r")
            assert checksum == twogis.request_checksum(parts.path, query)
            catalogue = deepcopy(CATALOGUE)
            if self.exact:
                # A synthetic unambiguous result for cache/transport tests. The original live
                # shape above remains ambiguous and is covered by matching regression tests.
                item = catalogue["result"]["items"][1]
                item["name"] = "Приморский океанариум"
                catalogue["result"]["items"] = [item]
            return json.dumps(catalogue)
        assert parts.path == f"/2.0/branches/{ORG_ID}/reviews"
        assert query["limit"] == "30"
        assert query["sort_by"] == "date_created"
        return json.dumps(REVIEWS)


def enable_hub(app: Any, yandex: FakePages, other: TwoGisPages, **options: Any) -> None:
    app.state.settings = app.state.settings.model_copy(update={"external_reviews_enabled": True})
    factory = app.state.database.session_factory
    app.state.external_reviews = ReviewsHub(
        [
            ExternalReviewsService(factory, yandex, request_interval_s=0.001, **options),
            ExternalReviewsService(
                factory, other, provider=twogis.TwoGisProvider(), request_interval_s=0.001, **options
            ),
        ]
    )


def test_parse_catalogue_and_sanitized_reviews() -> None:
    org = twogis.parse_catalogue(json.dumps(CATALOGUE))[1]
    assert org.org_id == ORG_ID
    result = twogis.parse_reviews(json.dumps(REVIEWS), org)
    assert result.organization.reviews_count == 30
    [review] = result.reviews
    assert review.text == "Просторный зал & интересная экспозиция."
    assert review.rating == 5
    assert review.published_at.isoformat() == "2026-11-01T02:30:00+00:00"
    assert "Private" not in repr(result)
    assert "private-" not in repr(result)


@pytest.mark.parametrize(
    "change", ["wrong_id", "wrong_type", "no_meta", "denied", "no_reviews", "empty", "bad_text"]
)
def test_rejects_unexpected_reviews(change: str) -> None:
    payload = deepcopy(REVIEWS)
    match change:
        case "wrong_id":
            payload["reviews"][0]["object"]["id"] = "999"
        case "wrong_type":
            payload["reviews"][0]["object"]["type"] = "geo"
        case "no_meta":
            del payload["meta"]
        case "denied":
            payload["meta"]["code"] = 403
        case "no_reviews":
            del payload["reviews"]
        case "empty":
            payload["reviews"] = []
        case "bad_text":
            payload["reviews"][0]["text"] = {"unexpected": "shape"}
    with pytest.raises(UnexpectedPageError):
        twogis.parse_reviews(json.dumps(payload), twogis.parse_catalogue(json.dumps(CATALOGUE))[1])


def test_hidden_duplicate_empty_and_long_reviews() -> None:
    payload = deepcopy(REVIEWS)
    payload["reviews"] = [
        {**REVIEW, "is_hidden": True},
        {**REVIEW, "on_moderation": True},
        {**REVIEW, "text": ""},
        REVIEW,
        REVIEW,
        *[{**REVIEW, "id": str(i), "text": "д" * 1000} for i in range(40)],
    ]
    org = twogis.parse_catalogue(json.dumps(CATALOGUE))[1]
    result = twogis.parse_reviews(json.dumps(payload), org)
    assert len(result.reviews) == 30
    assert len(result.reviews[-1].text) == 600
    payload["reviews"] = []
    payload["meta"].update(total_count=0, branch_reviews_count=0, branch_rating=0)
    result = twogis.parse_reviews(json.dumps(payload), org)
    assert not result.reviews
    assert result.organization.rating is None


BRIDGE_ID = "70030076483006736"
BRIDGE = Target(Subject("Золотой мост", 43.1093, 131.8963))
# Shapes of the live answers for a map object; synthetic texts and identities only.
GEO_CATALOGUE = {
    "meta": {"code": 200},
    "result": {
        "items": [
            {"id": "70030076801087178_x", "type": "attraction", "point": {"lat": 43.11, "lon": 131.9}},
            {"id": "3519223187898498_x", "type": "station", "name": "Золотой мост"},
            {
                "id": BRIDGE_ID + "_tracking",
                "type": "building",
                "name": "Золотой мост",
                "point": {"lat": 43.10935, "lon": 131.89635},
                "reviews": {"general_rating": 4.8, "general_review_count": 337},
            },
        ]
    },
}
GEO_REVIEW = {**REVIEW, "object": {"id": BRIDGE_ID, "type": "building"}, "is_rated": True}
GEO_REVIEWS = {
    "meta": {"geo_rating": 4.8, "geo_reviews_count": 329, "total_count": 329, "next_link": "…"},
    "reviews": [GEO_REVIEW, {**GEO_REVIEW, "id": "rating-only", "text": None}],
}


def test_map_objects_are_parsed_apart_from_organisations() -> None:
    assert twogis.parse_catalogue(json.dumps(GEO_CATALOGUE)) == []
    [bridge] = twogis.parse_catalogue(json.dumps(GEO_CATALOGUE), geo=True)
    assert (bridge.org_id, bridge.title, bridge.reviews_count) == (BRIDGE_ID, "Золотой мост", 337)
    assert twogis.parse_catalogue(json.dumps(CATALOGUE), geo=True) == []
    result = twogis.parse_reviews(json.dumps(GEO_REVIEWS), bridge, geo=True)
    assert (result.organization.rating, result.organization.reviews_count) == (4.8, 329)
    assert [review.text for review in result.reviews] == ["Просторный зал & интересная экспозиция."]
    assert result.url == f"https://2gis.ru/vladivostok/geo/{BRIDGE_ID}/tab/reviews"
    assert "Private" not in repr(result)
    with pytest.raises(UnexpectedPageError):
        twogis.parse_reviews(json.dumps(GEO_REVIEWS), bridge)
    with pytest.raises(UnexpectedPageError):
        twogis.parse_reviews(json.dumps(REVIEWS), twogis.parse_catalogue(json.dumps(CATALOGUE))[1], geo=True)


@pytest.mark.parametrize("bound", [False, True])
async def test_a_map_object_is_found_after_organisations_and_read_at_its_own_address(bound: bool) -> None:
    requests: list[str] = []

    async def get(url: str) -> str:
        requests.append(url)
        parts = urlsplit(url)
        query = {k: v[0] for k, v in parse_qs(parts.query).items()}
        if url == twogis.HOME_URL:
            return CONFIG
        if parts.path == "/3.0/items/byid":
            return json.dumps(GEO_CATALOGUE)
        if parts.path == "/3.0/items":
            empty = {"meta": {"code": 404}}
            return json.dumps(GEO_CATALOGUE if query["type"] == twogis.GEO_SEARCH_TYPES else empty)
        assert parts.path == f"/3.0/geo/{BRIDGE_ID}/reviews"
        assert (query["limit"], query["offset"]) == ("30", "0")
        return json.dumps(GEO_REVIEWS)

    target = replace(BRIDGE, object_id=BRIDGE_ID) if bound else BRIDGE
    lookup = await twogis.TwoGisProvider().fetch(target, get, Resolver())
    assert lookup.found.organization.org_id == BRIDGE_ID
    assert lookup.verdict.method == ("explicit_id" if bound else "exact_name_nearby")
    assert len(lookup.found.reviews) == 1
    assert len(requests) == (3 if bound else 4)
    assert len(requests) <= twogis.TwoGisProvider.max_requests


async def test_sources_share_endpoint_but_have_independent_cache(world: World, app: Any) -> None:
    yandex, other = FakePages(), TwoGisPages(exact=True)
    yandex.serve_oceanarium()
    enable_hub(app, yandex, other)
    place = await oceanarium(world)
    path = f"{API}/places/{place['id']}/external-reviews"
    assert (await world.http.get(path, params={"cached_only": True})).json()["sources"] == []
    assert not yandex.requests
    assert not other.requests
    first, second = await asyncio.gather(world.http.get(path), world.http.get(path))
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert [s["source"] for s in first.json()["sources"]] == ["yandex", "2gis"]
    assert first.json()["sources"][1]["reviews"][0]["rating"] == 5
    assert "Private" not in first.text
    assert "private-" not in first.text
    assert len(yandex.requests) == 2
    assert len(other.requests) == 3
    assert (await world.http.get(path, params={"cached_only": True})).json() == first.json()
    async with world.session() as session:
        row = await session.scalar(select(CatalogueReviewSource))
        assert row.source == "2gis"
        assert row.org_id == ORG_ID
        assert row.requests == 3
        assert await session.scalar(select(ExternalReviewSource.org_id)) == "211680110089"
    # Public configuration is reused for the next organisation, but each target has its own cache.
    another = await oceanarium(world, lat=43.0163)
    await world.http.get(f"{API}/places/{another['id']}/external-reviews")
    assert len(other.requests) == 5, "cached web config + two searches; the second target is too far"
    assert other.requests.count(twogis.HOME_URL) == 1


@pytest.mark.parametrize("failed", ["yandex", "2gis"])
async def test_provider_failure_does_not_hide_other(world: World, app: Any, failed: str) -> None:
    yandex, other = FakePages(), TwoGisPages(fail=failed == "2gis", exact=True)
    if failed != "yandex":
        yandex.serve_oceanarium()
    enable_hub(app, yandex, other)
    place = await oceanarium(world)
    path = f"{API}/places/{place['id']}/external-reviews"
    answer = (await world.http.get(path)).json()
    assert [s["source"] for s in answer["sources"]] == ["2gis" if failed == "yandex" else "yandex"]
    requests = len(yandex.requests), len(other.requests)
    assert (await world.http.get(path)).json() == answer
    assert requests == (len(yandex.requests), len(other.requests))


async def test_slow_provider_keeps_ready_source_and_reuses_pending_task(world: World, app: Any) -> None:
    yandex, other = FakePages(), TwoGisPages(delay=0.1, exact=True)
    yandex.serve_oceanarium()
    enable_hub(app, yandex, other, deadline_s=0.08)
    place = await oceanarium(world)
    path = f"{API}/places/{place['id']}/external-reviews"
    answer = (await world.http.get(path)).json()
    assert answer["pending"]
    assert answer["pending_sources"] == ["2gis"]
    assert [s["source"] for s in answer["sources"]] == ["yandex"]
    await world.http.get(path)
    await asyncio.sleep(0.4)
    answer = (await world.http.get(path)).json()
    assert len(answer["sources"]) == 2
    assert not answer.get("pending")
    assert "pending_sources" not in answer
    assert len(other.requests) == 3


async def test_binding_change_invalidates_cache_and_no_duplicate_rating(world: World, app: Any) -> None:
    yandex, other = FakePages(), TwoGisPages(exact=True)
    yandex.serve_oceanarium()
    enable_hub(app, yandex, other)
    place = await oceanarium(world)
    path = f"{API}/places/{place['id']}/external-reviews"
    await world.http.get(path)
    async with world.session() as session:
        row = await session.get(Place, place["id"])
        row.object_id = ORG_ID
        session.add(
            ExternalRatingCache(object_id=ORG_ID, rating=4.9, count=30, succeeded=True, fetched_at=utcnow())
        )
        await session.commit()
    async with world.session() as session:
        assert place["id"] in [target.place_id for target in await warmup.candidates(session, 10, "2gis")]
    cached = (await world.http.get(path, params={"cached_only": True})).json()
    assert cached["sources"] == [], "a rating-only fallback cannot bypass identity revalidation"
    answer = (await world.http.get(path)).json()
    assert [s["source"] for s in answer["sources"]] == ["yandex", "2gis"]
    assert answer["sources"][1].get("reviews_available", True) is True
    assert len(other.requests) == 5
    assert "/items/byid?" in other.requests[-2]
    async with world.session() as session:
        assert await session.scalar(select(CatalogueReviewSource.requests)) == 5
        assert await warmup.candidates(session, 10, "2gis") == []
    world.clock.shift(rules.CACHE_TTL + timedelta(minutes=1))
    assert (await world.http.get(path, params={"cached_only": True})).json()["sources"] == []


async def test_2gis_budget_reserves_config_catalogue_and_reviews(world: World, app: Any) -> None:
    yandex, other = FakePages(), TwoGisPages()
    yandex.serve_oceanarium()
    enable_hub(app, yandex, other)
    place = await oceanarium(world)
    previous = await oceanarium(world, lat=43.0163)
    async with world.session() as session:
        session.add(
            CatalogueReviewSource(
                source="2gis",
                place_id=previous["id"],
                outcome=Outcome.NO_MATCH,
                requests=rules.DAILY_REQUEST_CAP - 2,
                fetched_at=utcnow(),
            )
        )
        await session.commit()
    answer = (await world.http.get(f"{API}/places/{place['id']}/external-reviews")).json()
    assert [s["source"] for s in answer["sources"]] == ["yandex"]
    assert not other.requests
