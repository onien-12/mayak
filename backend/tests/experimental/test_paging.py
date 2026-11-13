"""«Показать ещё»: further 2GIS pages of a map object's reviews, appended to the cached match."""

import json
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import select

from app.services.experimental.external_reviews import rules, twogis
from app.services.experimental.external_reviews.client import SourceRefusedError
from app.services.experimental.external_reviews.models import (
    CatalogueReviewCursor,
    CatalogueReviewSource,
    Outcome,
)
from app.services.experimental.external_reviews.service import ExternalReviewsService
from tests.conftest import API, World
from tests.experimental.test_twogis import (
    BRIDGE,
    BRIDGE_ID,
    CATALOGUE,
    CONFIG,
    GEO_CATALOGUE,
    GEO_REVIEW,
    REVIEW,
)

TOTAL = 95


def review(index: int) -> dict[str, Any]:
    day = 1 + index % 28
    return {
        **GEO_REVIEW,
        "id": f"r{index}",
        "text": f"Отзыв {index}",
        "date_created": f"2026-10-{day:02d}T10:00:00+10:00",
    }


def pool() -> list[dict[str, Any]]:
    items = [review(index) for index in range(TOTAL)]
    items[40]["text"] = None  # a rating without a text
    items[45] = {**review(3), "id": "r45"}  # the same review again under another ID
    return items


class GeoPages:
    """A bridge known only as a 2GIS map object, with `TOTAL` reviews to page through."""

    def __init__(self) -> None:
        self.requests: list[str] = []
        self.reviews = pool()
        self.failure: Exception | str | None = None

    async def get(self, url: str) -> str:
        self.requests.append(url)
        parts = urlsplit(url)
        query = {key: values[0] for key, values in parse_qs(parts.query).items()}
        if url == twogis.HOME_URL:
            return CONFIG
        if parts.path == "/3.0/items":
            geo = query["type"] == twogis.GEO_SEARCH_TYPES
            return json.dumps(GEO_CATALOGUE if geo else {"meta": {"code": 404}})
        assert parts.path == f"/3.0/geo/{BRIDGE_ID}/reviews"
        assert "next_link" not in url
        offset, limit = int(query["offset"]), int(query["limit"])
        if offset and self.failure is not None:
            if isinstance(self.failure, Exception):
                raise self.failure
            return self.failure
        meta = {
            "geo_rating": 4.8,
            "geo_reviews_count": TOTAL,
            "total_count": TOTAL,
            "next_link": "https://x/",
        }
        return json.dumps({"meta": meta, "reviews": self.reviews[offset : offset + limit]})


async def bridge(world: World, app: Any, **options: Any) -> tuple[GeoPages, str]:
    pages = GeoPages()
    app.state.settings = app.state.settings.model_copy(update={"external_reviews_enabled": True})
    app.state.external_reviews = ExternalReviewsService(
        app.state.database.session_factory,
        pages,
        provider=twogis.TwoGisProvider(),
        request_interval_s=0,
        **options,
    )
    author = await world.actor("author", reputation=20)
    subject = BRIDGE.subject
    place = await world.create_place(
        author, "culture_space", title=subject.title, lat=subject.lat, lng=subject.lng
    )
    return pages, f"{API}/places/{place['id']}/external-reviews"


def texts(source: dict[str, Any]) -> list[str]:
    return [item["text"] for item in source["reviews"]]


async def test_pages_are_appended_deduplicated_and_kept_in_the_cache(world: World, app: Any) -> None:
    pages, path = await bridge(world, app)
    [first] = (await world.http.get(path)).json()["sources"]
    assert (len(first["reviews"]), first["has_more"]) == (30, True)
    assert len(pages.requests) == 4

    second = (await world.http.get(f"{path}/more", params={"source": "2gis"})).json()
    assert len(pages.requests) == 5
    assert parse_qs(urlsplit(pages.requests[-1]).query)["limit"] == ["50"]
    assert texts(second)[:30] == texts(first)
    assert len(second["reviews"]) == 30 + 50 - 2, "a rating without text and a repeat are left out"
    assert second["has_more"] is True

    third = (await world.http.get(f"{path}/more", params={"source": "2gis"})).json()
    assert len(third["reviews"]) == 78 + 15
    assert len(set(texts(third))) == len(third["reviews"])
    assert "has_more" not in third, "the source has nothing more"
    assert "Private" not in json.dumps(third)

    refused = await world.http.get(f"{path}/more", params={"source": "2gis"})
    assert (refused.status_code, refused.json()["code"]) == (409, "no_more_reviews")
    assert len(pages.requests) == 6
    [cached] = (await world.http.get(path, params={"cached_only": True})).json()["sources"]
    assert cached == third
    async with world.session() as session:
        row = await session.scalar(select(CatalogueReviewSource))
        assert [review.position for review in row.reviews] == list(range(93))
        assert (row.requests, row.cursor.requests) == (4, 2), "page requests count against the cap"


async def test_nothing_to_page_is_409_without_asking(world: World, app: Any) -> None:
    pages, path = await bridge(world, app)
    for source in ("2gis", "yandex", "google"):
        response = await world.http.get(f"{path}/more", params={"source": source})
        assert response.status_code == 409, "no cached match yet: never a first lookup"
    assert pages.requests == []
    assert (await world.http.get(f"{path}/more", params={"source": "other"})).status_code == 422
    assert (await world.http.get(f"{API}/places/999/external-reviews/more?source=2gis")).status_code == 404
    await world.http.get(path)
    assert (await world.http.get(f"{path}/more", params={"source": "yandex"})).status_code == 409
    app.state.settings = app.state.settings.model_copy(update={"external_reviews_enabled": False})
    assert (await world.http.get(f"{path}/more", params={"source": "2gis"})).status_code == 409
    assert len(pages.requests) == 4


async def test_the_daily_cap_covers_pages(world: World, app: Any) -> None:
    pages, path = await bridge(world, app, daily_cap=5)
    await world.http.get(path)
    capped = await world.http.get(f"{path}/more", params={"source": "2gis"})
    assert capped.status_code == 429, "four spent, a page may take two"
    assert len(pages.requests) == 4


@pytest.mark.parametrize("failure", [SourceRefusedError("HTTP 403"), '{"meta": {}}'])
async def test_a_failed_page_keeps_what_is_stored(world: World, app: Any, failure: Exception | str) -> None:
    pages, path = await bridge(world, app)
    [first] = (await world.http.get(path)).json()["sources"]
    pages.failure = failure
    failed = await world.http.get(f"{path}/more", params={"source": "2gis"})
    assert (failed.status_code, failed.json()["code"]) == (502, "source_unavailable")
    assert (await world.http.get(path, params={"cached_only": True})).json()["sources"] == [first]
    async with world.session() as session:
        assert await session.scalar(select(CatalogueReviewSource.outcome)) is Outcome.MATCHED
        assert await session.scalar(select(CatalogueReviewCursor.requests)) >= 1
    pages.failure = None
    assert len((await world.http.get(f"{path}/more", params={"source": "2gis"})).json()["reviews"]) == 78


async def test_stored_reviews_have_a_ceiling(world: World, app: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rules, "MAX_STORED_REVIEWS", 40)
    _, path = await bridge(world, app)
    await world.http.get(path)
    page = (await world.http.get(f"{path}/more", params={"source": "2gis"})).json()
    assert len(page["reviews"]) == 40
    assert "has_more" not in page


async def test_a_new_lookup_restarts_the_paging(world: World, app: Any) -> None:
    pages, path = await bridge(world, app)
    await world.http.get(path)
    await world.http.get(f"{path}/more", params={"source": "2gis"})
    world.clock.shift(rules.CACHE_TTL)
    [fresh] = (await world.http.get(path)).json()["sources"]
    assert (len(fresh["reviews"]), fresh["has_more"]) == (30, True)
    assert parse_qs(urlsplit(pages.requests[-1]).query)["offset"] == ["0"]


def test_only_map_objects_page() -> None:
    config = twogis.WebConfig("catalogue", "review")
    assert "offset=80" in twogis.reviews_url(config, "1", geo=True, offset=80, limit=50)
    assert "offset" not in twogis.reviews_url(config, "1"), "no verified paging for organisations"
    answer = {
        "meta": {"code": 200, "branch_reviews_count": 99, "total_count": 99},
        "reviews": [{**REVIEW, "id": str(index)} for index in range(30)],
    }
    organisation = twogis.parse_catalogue(json.dumps(CATALOGUE))[1]
    assert twogis.parse_reviews(json.dumps(answer), organisation).next_offset is None
