import json
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from sqlalchemy import select

from app.core.clock import utcnow
from app.services.experimental.external_reviews import google, service
from app.services.experimental.external_reviews.client import FormPost, GoogleMapsClient
from app.services.experimental.external_reviews.hub import ReviewsHub
from app.services.experimental.external_reviews.models import CatalogueReviewSource, Outcome
from app.services.experimental.external_reviews.parser import UnexpectedPageError
from app.services.experimental.external_reviews.service import ExternalReviewsService
from app.services.experimental.external_reviews.twogis import TwoGisProvider
from tests.conftest import API, World
from tests.experimental.test_api import FakePages, oceanarium
from tests.experimental.test_twogis import TwoGisPages

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "google"


def fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text())


def envelope(payload: Any) -> str:
    data = json.dumps([["wrb.fr", google.RPC_ID, json.dumps(payload), None, None, None, "generic"]])
    return ")]}'\n\n" + str(len(data.encode())) + "\n" + data + '\n25\n[["di",42]]\n'


class GooglePages:
    def __init__(self, *, fail: bool = False, exact: bool = False) -> None:
        self.requests: list[str | FormPost] = []
        self.fail = fail
        self.exact = exact

    async def get(self, request: str | FormPost) -> str:
        self.requests.append(request)
        if self.fail:
            return "<html>captcha</html>"
        if isinstance(request, FormPost):
            freq = json.loads(request.data["f.req"])
            proto = json.loads(freq[0][0][1])
            assert proto[0][0][0] == fixture("search.json")[64][0][1][10]
            assert request.headers["x-maps-diversion-context-bin"] == "CAE="
            return envelope(fixture("reviews.json"))
        if request == google.HOME_URL:
            return "<html>Google Maps</html>"
        query = parse_qs(urlsplit(request).query)
        assert query["q"] == ["Приморский океанариум Владивосток"]
        assert "{LAT}" not in query["pb"][0]
        data = fixture("search.json")
        if self.exact:
            # Explicitly synthetic name for the three-provider plumbing test, not evidence
            # that the original longer Google name is a safe automatic match.
            data[64][0][1][11] = "Приморский океанариум"
        return ")]}'\n" + json.dumps(data)


def test_google_search_and_five_review_preview() -> None:
    orgs = google.parse_search(")]}'\n" + json.dumps(fixture("search.json")))
    assert len(orgs) == 2
    assert orgs[0].title == "Приморский океанариум Научно-образовательный комплекс"
    assert orgs[0].reviews_count == 16460
    result = google.parse_reviews(envelope(fixture("reviews.json")), orgs[0])
    assert len(result.reviews) == 5
    assert result.reviews[0].text == "Тестовый отзыв 1: интересная экспозиция."
    assert result.reviews[0].rating == 5
    assert result.reviews[0].published_at is None
    assert "Private" not in repr(result)
    assert "private-" not in repr(result)
    assert result.url == "https://www.google.com/maps?cid=14112664146327272852"


def test_google_focused_and_empty_search() -> None:
    root = fixture("search.json")
    node = root[64][0][1]
    root[64] = None
    root[0] = [None, [[None] * 14 + [node]]]
    assert len(google.parse_search(json.dumps(root))) == 1
    root[0] = None
    assert google.parse_search(json.dumps(root)) == []
    with pytest.raises(UnexpectedPageError):
        google.parse_search("[]")


@pytest.mark.parametrize("change", ["foreign", "invalid_payload", "missing_id", "bad_text"])
def test_google_rejects_wrong_business_and_failed_feed(change: str) -> None:
    payload = fixture("reviews.json")
    match change:
        case "foreign":
            payload[2][0][0][1][0] = "0x0:0x123"
        case "invalid_payload":
            payload = None
        case "missing_id":
            payload[2][0][0][0] = None
        case "bad_text":
            payload[2][0][0][2][15][0][0] = {"wrong": "shape"}
    org = google.parse_search(json.dumps(fixture("search.json")))[0]
    with pytest.raises(UnexpectedPageError):
        google.parse_reviews(envelope(payload), org)


def test_google_deduplicates_and_bounds_preview() -> None:
    payload = fixture("reviews.json")
    payload[2][0][0][2][15][0][0] = "А" * 900
    payload[2] *= 3
    org = google.parse_search(json.dumps(fixture("search.json")))[0]
    result = google.parse_reviews(envelope(payload), org)
    assert len(result.reviews) == 5
    assert len(result.reviews[0].text) == 600


def test_short_payload_of_a_place_with_few_reviews() -> None:
    org = google.parse_search(json.dumps(fixture("search.json")))[0]
    short = fixture("reviews.json")[:3]
    short[2] = short[2][:2]
    assert len(google.parse_reviews(envelope(short), org).reviews) == 2
    with pytest.raises(UnexpectedPageError, match="missing Google review payload"):
        google.parse_reviews(envelope(short[:2]), org)


@pytest.mark.parametrize("payload", [[], [None, None, None]])
def test_a_place_without_a_preview_keeps_its_rating_and_has_no_texts(payload: list[Any]) -> None:
    org = google.parse_search(json.dumps(fixture("search.json")))[0]
    result = google.parse_reviews(envelope(payload), org)
    assert result.reviews == []
    assert result.organization.rating == org.rating
    assert result.organization.reviews_count == 16460


def test_a_match_with_neither_rating_nor_texts_is_not_shown() -> None:
    row = CatalogueReviewSource(
        source="google", outcome=Outcome.MATCHED, url="https://www.google.com/maps?cid=1", fetched_at=utcnow()
    )
    row.reviews, row.photos = [], []
    assert service._response(row, google.GoogleProvider()).sources == []
    row.rating, row.reviews_count = 4.6, 660
    [source] = service._response(row, google.GoogleProvider()).sources
    assert source.reviews_available is False


@pytest.mark.parametrize("failed", [False, True])
async def test_three_sources_and_independent_google_failure(world: World, app: Any, failed: bool) -> None:
    yandex, other, maps = FakePages(), TwoGisPages(exact=True), GooglePages(fail=failed, exact=True)
    yandex.serve_oceanarium()
    factory = app.state.database.session_factory
    app.state.settings = app.state.settings.model_copy(update={"external_reviews_enabled": True})
    app.state.external_reviews = ReviewsHub(
        [
            ExternalReviewsService(factory, yandex, request_interval_s=0.001),
            ExternalReviewsService(factory, other, provider=TwoGisProvider(), request_interval_s=0.001),
            ExternalReviewsService(factory, maps, provider=google.GoogleProvider(), request_interval_s=0.001),
        ]
    )
    place = await oceanarium(world)
    path = f"{API}/places/{place['id']}/external-reviews"
    assert (await world.http.get(path, params={"cached_only": True})).json()["sources"] == []
    assert maps.requests == []
    answer = await world.http.get(path)
    assert answer.status_code == 200
    expected = ["yandex", "2gis"] if failed else ["yandex", "2gis", "google"]
    assert [s["source"] for s in answer.json()["sources"]] == expected
    assert "Private" not in answer.text
    assert "private-" not in answer.text
    assert len(maps.requests) == (2 if failed else 3)
    assert (await world.http.get(path)).json() == answer.json()
    assert len(maps.requests) == (2 if failed else 3)
    async with world.session() as session:
        row = await session.scalar(
            select(CatalogueReviewSource).where(CatalogueReviewSource.source == "google")
        )
        assert row.outcome == (Outcome.FAILED if failed else Outcome.MATCHED)
        if not failed:
            assert len(row.reviews) == 5


async def test_google_client_preserves_only_its_own_cookies_and_sends_rpc_form() -> None:
    requests = []

    def respond(request):
        requests.append(request)
        if request.method == "GET":
            return httpx.Response(200, text="home", headers={"Set-Cookie": "anonymous=test; Path=/; Secure"})
        assert request.headers["cookie"] == "anonymous=test"
        assert request.headers["content-type"] == "application/x-www-form-urlencoded"
        assert b"f.req=" in request.content
        return httpx.Response(200, text="RPC")

    client = GoogleMapsClient(transport=httpx.MockTransport(respond))
    await client.get(google.HOME_URL)
    assert await client.get(google.review_request("0x123:0x456")) == "RPC"
    assert [r.method for r in requests] == ["GET", "POST"]
