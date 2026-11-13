"""On-demand fetching, caching and throttling of external reviews (SPEC §20).

A card asks; a cached answer younger than a week is returned at once. Otherwise one background
fetch per target runs (search page → reviews page) under a single lock that spaces requests at
least 4 seconds apart, and the card waits for it at most 8 seconds. Requests are counted against
the daily cap. A captcha, a refused request or an answer that cannot be read ends that one lookup
(`blocked` / `failed`); the target is asked again after an hour, other targets as usual. A "no
match" the rules reached without a judge is treated the same way once a judge is configured, so
it gets its judgement. All limits are derived from the stored rows, so they survive restarts. The
spacing is also kept against the last stored fetch, so a warm-up run in another process does not
crowd the server.
Summary rows never ask: `cached_for` only reads what an earlier lookup or the warm-up stored.
A provider that pages (2GIS map objects) loads further reviews on request (`more`): one request
under the same lock, spacing and cap, appended to the cached match.
"""

import asyncio
import hashlib
import json
import logging
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from http import HTTPStatus
from pathlib import Path
from typing import Protocol, cast

from sqlalchemy import func, select, true
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import utcnow
from app.core.errors import AppError, ConflictError, RateLimitedError
from app.services.experimental.external_reviews import rules
from app.services.experimental.external_reviews.client import (
    FormPost,
    SourceRefusedError,
    SourceUnavailableError,
)
from app.services.experimental.external_reviews.matcher import Subject
from app.services.experimental.external_reviews.models import (
    CatalogueReview,
    CatalogueReviewCursor,
    CatalogueReviewSource,
    ExternalReview,
    ExternalReviewSource,
    Outcome,
    ReviewMatchEvidence,
)
from app.services.experimental.external_reviews.parser import CaptchaError, UnexpectedPageError
from app.services.experimental.external_reviews.providers import PagingProvider, Provider, YandexProvider
from app.services.experimental.external_reviews.resolver import UNCONFIRMED, Resolver
from app.services.experimental.external_reviews.schemas import (
    ExternalReviewOut,
    ExternalReviews,
    ExternalReviewSourceOut,
    SourceName,
)

logger = logging.getLogger(__name__)

POLICY = "extended-names-v2"
DISABLED = ExternalReviews(enabled=False, sources=[])
NOTHING = ExternalReviews(enabled=True, sources=[])


class PageUnavailableError(AppError):
    """The source refused the page or its answer could not be read; nothing stored changed."""

    status_code = HTTPStatus.BAD_GATEWAY
    code = "source_unavailable"


class PageSource(Protocol):
    async def get(self, url: str | FormPost) -> str: ...


@dataclass(frozen=True, slots=True)
class Target:
    """A place (`place_id`) or an area (`area_id`) with what the search and the matcher need."""

    subject: Subject
    place_id: int | None = None
    area_id: int | None = None
    object_id: str | None = None

    @property
    def key(self) -> tuple[int | None, int | None]:
        return self.place_id, self.area_id

    @property
    def fingerprint(self) -> str:
        """Policy + exact inputs. A rename, move, reparenting or binding change invalidates cache.

        The subject's `kind` is left out: it is context for the judge, not identity. The policy
        stays `extended-names-v2` with the judge: it runs only where these rules abstain, so every
        match they made still holds, and their "no match" is re-asked through `is_cached`."""
        payload = {"policy": POLICY, **asdict(self)}
        del payload["subject"]["kind"]
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


type SourceRow = ExternalReviewSource | CatalogueReviewSource


def awaits_judgement(outcome: Outcome, method: str, *, judged: bool) -> bool:
    """A "no match" reached without a judge, while one is configured now: legacy answers of the
    rules alone and judgements that failed are asked again like a failed lookup."""
    return judged and outcome is Outcome.NO_MATCH and method == UNCONFIRMED


def is_cached(
    row: SourceRow | None,
    evidence: ReviewMatchEvidence | None,
    now: datetime,
    target: Target,
    *,
    judged: bool = False,
) -> bool:
    """A match or a "no match" younger than a week, or a refused or failed lookup (or an
    unjudged "no match", see `awaits_judgement`) not yet due for a retry."""
    if (
        row is None
        or evidence is None
        or evidence.fingerprint != target.fingerprint
        or evidence.fetched_at != row.fetched_at
        or evidence.org_id != row.org_id
    ):
        return False
    if row.outcome in (Outcome.BLOCKED, Outcome.FAILED) or awaits_judgement(
        row.outcome, evidence.method, judged=judged
    ):
        return not rules.may_retry_failed(row.fetched_at, now)
    return rules.is_fresh(row.fetched_at, now)


def has_more(row: SourceRow, provider: Provider) -> bool:
    """The provider pages, the source said it holds more, and the stored list has room."""
    return (
        provider.pages
        and isinstance(row, CatalogueReviewSource)
        and row.cursor is not None
        and row.cursor.next_offset is not None
        and len(row.reviews) < rules.MAX_STORED_REVIEWS
    )


def _set_next_offset(row: SourceRow, next_offset: int | None) -> None:
    """Catalogue rows keep their cursor (and its page requests) across refreshes."""
    if not isinstance(row, CatalogueReviewSource):
        return
    if row.cursor is None:
        row.cursor = CatalogueReviewCursor(requests=0)
    row.cursor.next_offset = next_offset


def _response(row: SourceRow | None, provider: Provider) -> ExternalReviews:
    if row is None or row.outcome is not Outcome.MATCHED or row.url is None:
        return NOTHING
    if row.rating is None and not row.reviews:
        # Found, but with nothing to show; the link to the source is among `links` anyway.
        return NOTHING
    source = ExternalReviewSourceOut(
        source=provider.name,
        label=provider.label,
        url=row.url,
        rating=row.rating,
        ratings_count=row.ratings_count,
        reviews_count=row.reviews_count,
        reviews=[
            ExternalReviewOut(rating=review.rating, text=review.text, published_at=review.published_at)
            for review in row.reviews
        ],
        photos=list(row.photos),
        fetched_at=row.fetched_at,
        # A source may show a rating and a count and still hand out no texts.
        reviews_available=bool(row.reviews) or not row.reviews_count,
        has_more=has_more(row, provider),
    )
    return ExternalReviews(enabled=True, sources=[source])


class ExternalReviewsService:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        pages: PageSource,
        *,
        provider: Provider | None = None,
        resolver: Resolver | None = None,
        daily_cap: int = rules.DAILY_REQUEST_CAP,
        request_interval_s: float = rules.REQUEST_INTERVAL_S,
        deadline_s: float = rules.RESPONSE_DEADLINE_S,
        failure_dump_dir: Path | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._pages = pages
        self._provider = provider or YandexProvider()
        self._resolver = resolver or Resolver()
        self._daily_cap = daily_cap
        self._source_model = (
            ExternalReviewSource if self._provider.name == "yandex" else CatalogueReviewSource
        )
        self._review_model = ExternalReview if self._provider.name == "yandex" else CatalogueReview
        self._source_filter = (
            true() if self._provider.name == "yandex" else CatalogueReviewSource.source == self._provider.name
        )
        self._request_interval_s = request_interval_s
        self._deadline_s = deadline_s
        self._failure_dump_dir = failure_dump_dir
        self._last_page: str | None = None
        self._lock = asyncio.Lock()
        self._last_request_at: float | None = None
        self._inflight: dict[tuple[int | None, int | None, str], asyncio.Task[Outcome | None]] = {}

    async def _evidence(self, session: AsyncSession, target: Target) -> ReviewMatchEvidence | None:
        return await session.scalar(
            select(ReviewMatchEvidence).where(
                ReviewMatchEvidence.source == self._provider.name,
                ReviewMatchEvidence.place_id.is_not_distinct_from(target.place_id),
                ReviewMatchEvidence.area_id.is_not_distinct_from(target.area_id),
            )
        )

    async def _row(self, session: AsyncSession, target: Target) -> SourceRow | None:
        column = self._source_model.place_id if target.place_id is not None else self._source_model.area_id
        identifier = target.place_id if target.place_id is not None else target.area_id
        return await session.scalar(
            select(self._source_model).where(column == identifier, self._source_filter)
        )

    async def cached_for(self, target: Target) -> ExternalReviews:
        """What is already known, without ever asking the source."""
        async with self._session_factory() as session:
            row = await self._row(session, target)
            evidence = await self._evidence(session, target)
            return _response(row, self._provider) if is_cached(row, evidence, utcnow(), target) else NOTHING

    async def warm(self, target: Target) -> Outcome | None:
        """Ask now unless cached, waiting for the answer however long the spacing takes; the
        outcome of this request, or None when nothing was asked."""
        return await self._fetch(target)

    @property
    def source(self) -> SourceName:
        return self._provider.name

    @property
    def judged(self) -> bool:
        return self._resolver.judges

    async def reviews_for(self, target: Target) -> ExternalReviews:
        async with self._session_factory() as session:
            row = await self._row(session, target)
            evidence = await self._evidence(session, target)
        if is_cached(row, evidence, utcnow(), target, judged=self.judged):
            return _response(row, self._provider)
        key = (*target.key, target.fingerprint)
        task = self._inflight.get(key)
        if task is None:
            task = asyncio.create_task(self._fetch(target))
            self._inflight[key] = task
            task.add_done_callback(lambda _: self._inflight.pop(key, None))
        try:
            await asyncio.wait_for(asyncio.shield(task), self._deadline_s)
        except TimeoutError:
            return ExternalReviews(
                enabled=True, sources=[], pending=True, pending_sources=[self._provider.name]
            )
        async with self._session_factory() as session:
            row = await self._row(session, target)
            evidence = await self._evidence(session, target)
            fresh = is_cached(row, evidence, utcnow(), target, judged=self.judged)
            return _response(row, self._provider) if fresh else NOTHING

    async def _may_request(self, session: AsyncSession, now: datetime, requests: int) -> bool:
        """Room for `requests` more within the provider's rolling daily cap, lookups and pages."""
        since = now - rules.CAP_WINDOW
        used = await session.scalar(
            select(func.coalesce(func.sum(self._source_model.requests), 0)).where(
                self._source_model.fetched_at > since, self._source_filter
            )
        )
        if self._source_model is CatalogueReviewSource:
            used += await session.scalar(
                select(func.coalesce(func.sum(CatalogueReviewCursor.requests), 0))
                .join(CatalogueReviewSource, CatalogueReviewCursor.source_id == CatalogueReviewSource.id)
                .where(CatalogueReviewCursor.requested_at > since, self._source_filter)
            )
        return rules.has_budget(used, requests, self._daily_cap)

    async def _keep_clear_of_other_processes(self, session: AsyncSession) -> None:
        """Wait until the interval has passed since the last fetch any process stored."""
        last_stored = await session.scalar(
            select(func.max(self._source_model.fetched_at)).where(self._source_filter)
        )
        if self._source_model is CatalogueReviewSource:
            last_page = await session.scalar(
                select(func.max(CatalogueReviewCursor.requested_at))
                .join(CatalogueReviewSource, CatalogueReviewCursor.source_id == CatalogueReviewSource.id)
                .where(self._source_filter)
            )
            last_stored = max(filter(None, (last_stored, last_page)), default=None)
        if last_stored is not None:
            pause = (last_stored - utcnow()).total_seconds() + self._request_interval_s
            if pause > 0:
                await asyncio.sleep(pause)

    async def _get(self, url: str | FormPost) -> str:
        """One request, never sooner than the interval after the previous one."""
        if self._last_request_at is not None:
            pause = self._last_request_at + self._request_interval_s - time.monotonic()
            if pause > 0:
                await asyncio.sleep(pause)
        try:
            return await self._pages.get(url)
        finally:
            self._last_request_at = time.monotonic()

    async def _ask_source(self, target: Target, row: SourceRow, evidence: ReviewMatchEvidence) -> None:
        """Fill `row` from the source; raises when the source misbehaves."""

        async def get(url: str | FormPost) -> str:
            row.requests += 1
            self._last_page = None
            self._last_page = await self._get(url)
            return self._last_page

        lookup = await self._provider.fetch(target, get, self._resolver)
        evidence.method = lookup.verdict.method
        result = lookup.found
        if result is None:
            row.outcome = Outcome.NO_MATCH
            return
        found = result.organization
        evidence.org_id, evidence.title, evidence.lat, evidence.lng = (
            found.org_id,
            found.title,
            found.lat,
            found.lng,
        )
        row.outcome = Outcome.MATCHED
        row.org_id, row.url = found.org_id, result.url
        row.rating, row.ratings_count, row.reviews_count = (
            found.rating,
            found.ratings_count,
            found.reviews_count,
        )
        row.photos = list(found.photos)
        _set_next_offset(row, result.next_offset)
        row.reviews = [
            self._review_model(
                position=position, rating=review.rating, text=review.text, published_at=review.published_at
            )
            for position, review in enumerate(result.reviews)
        ]

    def _dump_unread_page(self, request_number: int) -> None:
        """Keep the answer the parser could not read, when debugging asks for it."""
        if self._failure_dump_dir is None or self._last_page is None:
            return
        self._failure_dump_dir.mkdir(parents=True, exist_ok=True)
        name = f"{self._provider.name}-{utcnow():%Y%m%dT%H%M%S}-request{request_number}.txt"
        (self._failure_dump_dir / name).write_text(self._last_page, encoding="utf-8")

    async def _fetch(self, target: Target) -> Outcome | None:
        """Fetch with its own session; the outcome, or None when nothing was asked (cached,
        over the daily cap, or an internal error). Never raises."""
        try:
            async with self._lock, self._session_factory() as session:
                now = utcnow()
                row = await self._row(session, target)
                evidence = await self._evidence(session, target)
                if is_cached(row, evidence, now, target, judged=self.judged):
                    return None
                if not await self._may_request(session, now, self._provider.max_requests):
                    return None
                await self._keep_clear_of_other_processes(session)
                if row is None:
                    row = self._source_model(place_id=target.place_id, area_id=target.area_id)
                    if isinstance(row, CatalogueReviewSource):
                        row.source = self._provider.name
                    session.add(row)
                if isinstance(row, CatalogueReviewSource):
                    row.object_id = target.object_id
                if evidence is None:
                    evidence = ReviewMatchEvidence(
                        source=self._provider.name, place_id=target.place_id, area_id=target.area_id
                    )
                    session.add(evidence)
                evidence.fingerprint = target.fingerprint
                evidence.org_id = evidence.title = evidence.lat = evidence.lng = None
                evidence.method = UNCONFIRMED
                # A changed object binding can refresh a row inside the daily window.
                # Do not erase those earlier requests from the persisted budget.
                recent_requests = (
                    row.requests
                    if row.fetched_at is not None and row.fetched_at > now - rules.CAP_WINDOW
                    else 0
                )
                row.requests, row.reviews, row.photos = recent_requests, [], []
                _set_next_offset(row, None)
                row.org_id = row.url = row.rating = row.ratings_count = row.reviews_count = None
                try:
                    await self._ask_source(target, row, evidence)
                except (SourceRefusedError, CaptchaError) as error:
                    logger.warning(
                        "External reviews %s refused the lookup for «%s»: %s",
                        self._provider.name,
                        target.subject.title,
                        error,
                    )
                    row.outcome = Outcome.BLOCKED
                    row.reviews, row.photos = [], []
                except (SourceUnavailableError, UnexpectedPageError) as error:
                    logger.warning(
                        "External reviews %s failed for «%s»: %s",
                        self._provider.name,
                        target.subject.title,
                        error,
                    )
                    row.outcome = Outcome.FAILED
                    row.reviews, row.photos = [], []
                    if isinstance(error, UnexpectedPageError):
                        self._dump_unread_page(row.requests)
                row.fetched_at = utcnow()
                evidence.fetched_at = row.fetched_at
                await session.commit()
                return row.outcome
        except Exception:
            logger.exception("External reviews fetch failed")
            return None

    async def more(self, target: Target) -> ExternalReviewSourceOut:
        """The next page appended to the cached match; the whole entry again.

        Never a first lookup: 409 unless a current match has more to page, 429 at the daily cap,
        `PageUnavailableError` (502) when the source refused or the answer was unreadable — the
        stored reviews stay as they were, only the spent request is counted."""
        nothing = ConflictError("Больше отзывов из этого источника нет.", code="no_more_reviews")
        async with self._lock, self._session_factory() as session:
            now = utcnow()
            row = await self._row(session, target)
            evidence = await self._evidence(session, target)
            shown = _response(row, self._provider).sources if is_cached(row, evidence, now, target) else []
            # What the card shows offers «Показать ещё»; `has_more` implies a catalogue row.
            if not shown or not shown[0].has_more or not isinstance(row, CatalogueReviewSource):
                raise nothing
            provider = cast(PagingProvider, self._provider)
            if not await self._may_request(session, now, provider.max_page_requests):
                raise RateLimitedError("Лимит запросов к источнику на сегодня исчерпан.", code="daily_cap")
            await self._keep_clear_of_other_processes(session)
            cursor = row.cursor
            recent = cursor.requested_at is not None and cursor.requested_at > now - rules.CAP_WINDOW
            cursor.requests = cursor.requests if recent else 0

            async def get(url: str | FormPost) -> str:
                cursor.requests += 1
                return await self._get(url)

            try:
                page = await provider.next_page(row.org_id, cursor.next_offset, get)
            except (SourceUnavailableError, UnexpectedPageError) as error:
                logger.warning(
                    "External reviews %s: no further page for «%s»: %s",
                    self._provider.name,
                    target.subject.title,
                    error,
                )
                cursor.requested_at = utcnow()
                await session.commit()
                raise PageUnavailableError("Источник сейчас не отдал отзывы, попробуйте позже.") from error
            cursor.requested_at = utcnow()
            cursor.next_offset = page.next_offset
            seen = {(review.rating, review.text, review.published_at) for review in row.reviews}
            for review in page.reviews:
                key = (review.rating, review.text, review.published_at)
                if key in seen or len(row.reviews) >= rules.MAX_STORED_REVIEWS:
                    continue
                seen.add(key)
                row.reviews.append(
                    CatalogueReview(
                        position=len(row.reviews),
                        rating=review.rating,
                        text=review.text,
                        published_at=review.published_at,
                    )
                )
            await session.commit()
            return _response(row, self._provider).sources[0]
