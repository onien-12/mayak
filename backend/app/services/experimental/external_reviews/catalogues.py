"""Combine verified source data and navigation in one response, without inventing reviews.

2GIS's existing Places integration owns its key, quota and rating cache. Reading that cache
here does not spend an extra request. A parsed provider's result takes precedence over this
rating-only fallback. Navigation links are retained even when review fetching is unavailable.
"""

from urllib.parse import quote, urlencode

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.models import ExternalRatingCache
from app.services.experimental.external_reviews import client, rules
from app.services.experimental.external_reviews.models import ReviewMatchEvidence
from app.services.experimental.external_reviews.schemas import (
    ExternalReviewLink,
    ExternalReviews,
    ExternalReviewSourceOut,
)
from app.services.experimental.external_reviews.service import Target


def source_links(target: Target) -> list[ExternalReviewLink]:
    subject = target.subject
    query = quote(client.search_query(subject.title), safe="")
    twogis = (
        f"https://2gis.ru/vladivostok/geo/{quote(target.object_id, safe='')}/tab/reviews"
        if target.object_id
        else f"https://2gis.ru/vladivostok/search/{query}?m={subject.lng},{subject.lat}/17"
    )
    google = "https://www.google.com/maps/search/?" + urlencode(
        {"api": "1", "query": client.search_query(subject.title)}
    )
    return [
        ExternalReviewLink(
            source="yandex",
            label="Яндекс Карты",
            url=client.search_url(subject.title, subject.lat, subject.lng),
        ),
        ExternalReviewLink(source="2gis", label="2ГИС", url=twogis),
        ExternalReviewLink(source="google", label="Google Maps", url=google),
    ]


async def combined(session: AsyncSession, target: Target, answer: ExternalReviews) -> ExternalReviews:
    sources = list(answer.sources)
    links = source_links(target)
    if target.object_id and not any(source.source == "2gis" for source in sources):
        proof = await session.scalar(
            select(ReviewMatchEvidence).where(
                ReviewMatchEvidence.source == "2gis",
                ReviewMatchEvidence.place_id.is_not_distinct_from(target.place_id),
                ReviewMatchEvidence.area_id.is_not_distinct_from(target.area_id),
                ReviewMatchEvidence.org_id == target.object_id,
                ReviewMatchEvidence.fingerprint == target.fingerprint,
                ReviewMatchEvidence.method.in_(("explicit_id", "exact_name_nearby")),
                ReviewMatchEvidence.fetched_at > utcnow() - rules.CACHE_TTL,
            )
        )
        row = (
            await session.scalar(
                select(ExternalRatingCache).where(ExternalRatingCache.object_id == target.object_id)
            )
            if proof is not None
            else None
        )
        if row is not None and row.rating is not None and rules.is_fresh(row.fetched_at, utcnow()):
            sources.append(
                ExternalReviewSourceOut(
                    source="2gis",
                    label="2ГИС",
                    url=links[1].url,
                    rating=row.rating,
                    ratings_count=None,
                    reviews_count=row.count,
                    reviews=[],
                    photos=[],
                    fetched_at=row.fetched_at,
                    reviews_available=False,
                )
            )
    urls = {source.source: source.url for source in sources}
    links = [link.model_copy(update={"url": urls.get(link.source, link.url)}) for link in links]
    return answer.model_copy(update={"sources": sources, "links": links})
