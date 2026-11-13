"""Source adapters share the same cache/throttle service, but never share failure state."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from app.services.experimental.external_reviews import client, parser
from app.services.experimental.external_reviews.resolver import Resolver, Verdict
from app.services.experimental.external_reviews.schemas import SourceName

if TYPE_CHECKING:
    from app.services.experimental.external_reviews.service import Target

GetPage = Callable[[str | client.FormPost], Awaitable[str]]


@dataclass(frozen=True, slots=True)
class FetchedReviews:
    organization: parser.Organization
    reviews: list[parser.Review]
    url: str
    next_offset: int | None = None
    """Where the next page starts, when the source holds more and the provider can page."""


@dataclass(frozen=True, slots=True)
class ReviewPage:
    reviews: list[parser.Review]
    next_offset: int | None


@dataclass(frozen=True, slots=True)
class Lookup:
    """How the source's entries were judged and, when one of them is ours, what it holds."""

    verdict: Verdict
    found: FetchedReviews | None = None


class Provider(Protocol):
    name: SourceName
    label: str
    max_requests: int
    pages: bool
    """Whether `next_page` loads further reviews; only then can a first page leave a cursor."""

    async def fetch(self, target: Target, get: GetPage, resolver: Resolver) -> Lookup: ...


class PagingProvider(Provider, Protocol):
    max_page_requests: int
    """Requests one further page may take, reserved against the daily cap."""

    async def next_page(self, org_id: str, offset: int, get: GetPage) -> ReviewPage:
        """One more request: the reviews from `offset` on."""


class YandexProvider:
    name: SourceName = "yandex"
    label = "Яндекс Карты"
    max_requests = 2
    pages = False
    """Its further review pages need a signed request."""

    async def fetch(self, target: Target, get: GetPage, resolver: Resolver) -> Lookup:
        subject = target.subject
        verdict = await resolver.resolve(
            subject,
            parser.parse_search(await get(client.search_url(subject.title, subject.lat, subject.lng))),
        )
        found = verdict.organization
        if found is None:
            return Lookup(verdict)
        reviews = parser.parse_reviews(
            await get(client.reviews_url(found.org_id)), found.org_id, expected_count=found.reviews_count
        )
        return Lookup(verdict, FetchedReviews(found, reviews, client.organization_url(found.org_id)))
