"""2GIS aggregate rating: parsing, lazy fetch on card open, 7-day cache, daily cap, failures."""

from datetime import timedelta
from typing import Any

import httpx
import pytest

from app.core.http import USER_AGENT
from app.services.external_ratings import RatingRefresher
from app.services.twogis_places import ObjectRating, TwoGisPlacesClient, parse_rating
from tests.conftest import API, World


class FakeRatings:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.answers: dict[str, ObjectRating | None] = {}

    async def object_rating(self, object_id: str) -> ObjectRating | None:
        self.calls.append(object_id)
        return self.answers.get(object_id, ObjectRating(4.9, 3867))


def install(app: Any, daily_limit: int = 30) -> FakeRatings:
    fake = FakeRatings()
    app.state.rating_refresher = RatingRefresher(fake, daily_limit)
    return fake


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        (
            {"result": {"items": [{"reviews": {"general_rating": 4.94, "general_review_count": 3867}}]}},
            ObjectRating(4.94, 3867),
        ),
        ({"result": {"items": [{"reviews": {"general_review_count": 0}}]}}, ObjectRating(None, 0)),
        ({"result": {"items": [{}]}}, ObjectRating(None, 0)),
        (
            {"result": {"items": [{"reviews": {"general_rating": "5", "general_review_count": True}}]}},
            ObjectRating(None, 0),
        ),
        ({"meta": {"code": 404}}, None),
        ([], None),
    ],
)
def test_rating_is_read_defensively(payload: Any, expected: ObjectRating | None) -> None:
    assert parse_rating(payload) == expected


async def test_places_client_sends_no_key_without_one_and_a_descriptive_agent() -> None:
    seen: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            json={
                "result": {
                    "items": [{"address_name": "Светланская, 1", "geometry": {"selection": "POINT(1 2)"}}]
                }
            },
        )

    http = httpx.AsyncClient(transport=httpx.MockTransport(answer), headers={"User-Agent": USER_AGENT})
    assert await TwoGisPlacesClient("", http_client=http).object_rating("1") is None
    assert seen == []
    keyed = TwoGisPlacesClient("test-key", http_client=http)
    assert await keyed.object_outline("1") == ("Светланская, 1", "POINT(1 2)"), (
        "falls back to the address name"
    )
    assert seen[0].url.params["fields"] == "items.point,items.geometry.selection,items.name,items.full_name"
    assert seen[0].headers["user-agent"] == USER_AGENT
    await keyed.aclose()


async def test_rating_is_fetched_on_card_open_and_cached_for_a_week(world: World, app: Any) -> None:
    fake = install(app)
    author = await world.actor("author", reputation=20)
    place = await world.create_place(author, "culture_space", object_id="70000001018022890")
    assert place["object_id"] == "70000001018022890"
    assert place["external_rating"] is None, "creating does not spend the quota"

    detail = (await world.http.get(f"{API}/places/{place['id']}")).json()
    assert detail["external_rating"] == {
        "source": "2gis",
        "rating": 4.9,
        "count": 3867,
        "url": "https://2gis.ru/vladivostok/geo/70000001018022890",
    }
    assert detail["rating_avg"] is None, "never mixed into our own rating"
    await world.http.get(f"{API}/places/{place['id']}")
    assert fake.calls == ["70000001018022890"]

    world.clock.shift(timedelta(days=7, minutes=1))
    fake.answers["70000001018022890"] = None
    still = (await world.http.get(f"{API}/places/{place['id']}")).json()
    assert still["external_rating"]["rating"] == 4.9, "a failed refresh keeps the last known rating"
    assert len(fake.calls) == 2
    await world.http.get(f"{API}/places/{place['id']}")
    assert len(fake.calls) == 2, "a failure is retried only after a day"

    plain = await world.create_place(author, "toilet")
    assert (await world.http.get(f"{API}/places/{plain['id']}")).json()["external_rating"] is None
    assert len(fake.calls) == 2


async def test_daily_cap_and_unrated_objects(world: World, app: Any) -> None:
    fake = install(app, daily_limit=1)
    fake.answers["unrated"] = ObjectRating(None, 0)
    moderator = await world.actor("moderator", reputation=60)
    first = (
        await moderator.post(
            "/areas",
            json={
                "title": "Парк без оценок",
                "kind": "park",
                "lat": 43.12,
                "lng": 131.9,
                "radius_m": 100,
                "object_id": "unrated",
            },
        )
    ).json()
    second = (
        await moderator.post(
            "/areas",
            json={
                "title": "Парк с оценками",
                "kind": "park",
                "lat": 43.15,
                "lng": 131.9,
                "radius_m": 100,
                "object_id": "rated",
            },
        )
    ).json()
    assert (await world.http.get(f"{API}/areas/{first['id']}")).json()["external_rating"] is None
    assert (await world.http.get(f"{API}/areas/{second['id']}")).json()["external_rating"] is None
    assert fake.calls == ["unrated"], "the cap is reached"
    world.clock.shift(timedelta(days=1, minutes=1))
    rated = (await world.http.get(f"{API}/areas/{second['id']}")).json()
    assert rated["external_rating"]["count"] == 3867
    assert fake.calls == ["unrated", "rated"]
