"""`combined_rating` on cards and lists (SPEC §22): cached data only, batched per page."""

from typing import Any

from sqlalchemy import event

from app.core.clock import utcnow
from app.models import Area, Place
from app.services import place_queries
from app.services.experimental.external_reviews import client, rules, targets
from app.services.experimental.external_reviews.models import (
    CatalogueReviewSource,
    ExternalReviewSource,
    Outcome,
    ReviewMatchEvidence,
)
from tests.conftest import API, World
from tests.experimental.test_api import OCEANARIUM, TITLE, FakePages, enable, oceanarium, page

YANDEX = {"source": "yandex", "rating": 5.0, "count": 37615}


async def reviewed_oceanarium(world: World, app: Any, **overrides: Any) -> dict[str, Any]:
    """A place matched at Yandex (5.0 from 37 615 ratings) and rated 3 by one resident."""
    place = await oceanarium(world, **overrides)
    pages = FakePages()
    pages.serve_oceanarium()
    enable(app, pages)
    assert len((await world.http.get(f"{API}/places/{place['id']}/external-reviews")).json()["sources"]) == 1
    reviewer = await world.actor(f"reviewer{world._counter}", reputation=15)
    await reviewer.post(f"/places/{place['id']}/reviews", json={"rating": 3, "text": "Неплохо."})
    return place


async def cached_yandex_match(world: World, place_id: int) -> None:
    """What a lookup would have stored for the place: a match rated 4.0 by 99, with evidence."""
    async with world.session() as session:
        target = targets.for_place(await place_queries.get_place(session, place_id))
        fetched_at = utcnow()
        session.add_all(
            [
                ExternalReviewSource(
                    place_id=place_id,
                    outcome=Outcome.MATCHED,
                    org_id=str(place_id),
                    rating=4.0,
                    ratings_count=99,
                    fetched_at=fetched_at,
                ),
                ReviewMatchEvidence(
                    source="yandex",
                    place_id=place_id,
                    fingerprint=target.fingerprint,
                    org_id=str(place_id),
                    method="exact_name_nearby",
                    fetched_at=fetched_at,
                ),
            ]
        )
        await session.commit()


async def test_blend_on_the_card_and_in_lists(world: World, app: Any) -> None:
    place = await reviewed_oceanarium(world, app)
    combined = {
        "value": 4.8,
        "count": 37616,
        "parts": [{"source": "mayak", "rating": 3.0, "count": 1}, YANDEX],
    }
    detail = (await world.http.get(f"{API}/places/{place['id']}")).json()
    assert (detail["rating_avg"], detail["combined_rating"]) == (3.0, combined)
    [card] = (await world.http.get(f"{API}/places")).json()
    assert card["combined_rating"] == combined
    assert card["trust_score"] == detail["trust_score"]


async def test_no_blend_without_a_source_rating_or_while_disabled(world: World, app: Any) -> None:
    place = await reviewed_oceanarium(world, app)
    unmatched = await oceanarium(world, title="Нерпинарий")
    path = f"{API}/places/{unmatched['id']}"
    assert (await world.http.get(path)).json()["combined_rating"] is None
    app.state.settings = app.state.settings.model_copy(update={"external_reviews_enabled": False})
    assert (await world.http.get(f"{API}/places/{place['id']}")).json()["combined_rating"] is None
    assert all(card["combined_rating"] is None for card in (await world.http.get(f"{API}/places")).json())


async def test_only_a_current_unexpired_match_counts(world: World, app: Any) -> None:
    place = await reviewed_oceanarium(world, app)
    path = f"{API}/places/{place['id']}"
    world.clock.shift(rules.CACHE_TTL)
    assert (await world.http.get(path)).json()["combined_rating"] is None, "expired"
    world.clock.shift(-rules.CACHE_TTL)
    async with world.session() as session:
        row = await session.get(Place, place["id"])
        row.lat += 0.001
        await session.commit()
    assert (await world.http.get(path)).json()["combined_rating"] is None, "moved since the match"


async def test_a_list_loads_blends_in_a_fixed_number_of_queries(world: World, app: Any) -> None:
    await reviewed_oceanarium(world, app)
    statements: list[str] = []

    def record(*args: Any) -> None:
        statements.append(args[2])

    engine = app.state.database.engine.sync_engine
    event.listen(engine, "before_cursor_execute", record)
    try:
        await world.http.get(f"{API}/places")
        one = len(statements)
        for index in range(4):
            await cached_yandex_match(world, (await oceanarium(world, title=f"Океанариум {index}"))["id"])
        statements.clear()
        cards = (await world.http.get(f"{API}/places")).json()
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert len(cards) == 5
    assert all(card["combined_rating"] for card in cards)
    assert len(statements) == one


async def test_area_blend_counts_the_ratings_inside(world: World, app: Any) -> None:
    moderator = await world.actor("moderator", reputation=60)
    area = (
        await moderator.post(
            "/areas", json={"title": TITLE, "kind": "complex", **OCEANARIUM, "radius_m": 300}
        )
    ).json()
    await reviewed_oceanarium(world, app)
    pages = FakePages()
    pages.pages[client.search_url(TITLE, area["lat"], area["lng"])] = page("search.html")
    pages.pages[client.reviews_url("211680110089")] = page("reviews.html")
    enable(app, pages)
    assert len((await world.http.get(f"{API}/areas/{area['id']}/external-reviews")).json()["sources"]) == 1
    async with world.session() as session:
        target = targets.for_area(await session.get(Area, area["id"]))
        fetched_at = utcnow()
        session.add_all(
            [
                CatalogueReviewSource(
                    source="2gis",
                    area_id=area["id"],
                    outcome=Outcome.MATCHED,
                    org_id="70000001024450259",
                    rating=4.9,
                    reviews_count=3867,
                    requests=2,
                    fetched_at=fetched_at,
                ),
                ReviewMatchEvidence(
                    source="2gis",
                    area_id=area["id"],
                    fingerprint=target.fingerprint,
                    org_id="70000001024450259",
                    method="extended_name_nearby",
                    fetched_at=fetched_at,
                ),
            ]
        )
        await session.commit()
    combined = {
        "value": 4.8,
        "count": 1 + 37615 + 3867,
        "parts": [
            {"source": "mayak", "rating": 3.0, "count": 1},
            YANDEX,
            {"source": "2gis", "rating": 4.9, "count": 3867},
        ],
    }
    detail = (await world.http.get(f"{API}/areas/{area['id']}")).json()
    assert detail["combined_rating"] == combined
    assert detail["places"][0]["combined_rating"]["parts"][1] == YANDEX
    [card] = (await world.http.get(f"{API}/areas")).json()
    assert card["combined_rating"] == combined
