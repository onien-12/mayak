"""Aggregate ratings of linked 2GIS objects: fetched lazily on card open, cached, capped (SPEC §19).

Shown as a separate reference line; never blended into our own rating, trust or interest.
"""

from datetime import datetime
from typing import Protocol

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import external_rating
from app.models import ExternalRatingCache
from app.schemas.place import ExternalRating
from app.services.twogis_places import ObjectRating


class RatingClient(Protocol):
    async def object_rating(self, object_id: str) -> ObjectRating | None:
        """The object's rating; None when the request failed."""


async def cached(session: AsyncSession, object_id: str | None) -> ExternalRating | None:
    """The last known rating of the object; None when unknown, unrated or never fetched."""
    if object_id is None:
        return None
    row = await session.scalar(select(ExternalRatingCache).where(ExternalRatingCache.object_id == object_id))
    if row is None or row.rating is None:
        return None
    return ExternalRating(
        source="2gis", rating=row.rating, count=row.count, url=external_rating.object_url(object_id)
    )


class RatingRefresher:
    """Asks 2GIS at most once a week per object and at most `daily_limit` times a day overall."""

    def __init__(self, client: RatingClient, daily_limit: int) -> None:
        self._client = client
        self._daily_limit = daily_limit

    async def _requests_today(self, session: AsyncSession, now: datetime) -> int:
        since = now - external_rating.CAP_WINDOW
        return (
            await session.scalar(
                select(func.count())
                .select_from(ExternalRatingCache)
                .where(ExternalRatingCache.fetched_at > since)
            )
            or 0
        )

    async def refresh_if_due(self, session: AsyncSession, object_id: str | None, now: datetime) -> None:
        """Commits the new answer; does nothing when the cache is fresh or the cap is reached.

        A failed request keeps the last known rating and is retried after a day.
        """
        if object_id is None:
            return
        row = await session.scalar(
            select(ExternalRatingCache).where(ExternalRatingCache.object_id == object_id)
        )
        if row is not None and not external_rating.is_due(row.fetched_at, succeeded=row.succeeded, now=now):
            return
        if await self._requests_today(session, now) >= self._daily_limit:
            return
        answer = await self._client.object_rating(object_id)
        if row is None:
            row = ExternalRatingCache(object_id=object_id)
            session.add(row)
        row.succeeded = answer is not None
        if answer is not None:
            row.rating, row.count = answer.rating, answer.count
        row.fetched_at = now
        await session.commit()


def get_rating_refresher(request: Request) -> RatingRefresher:
    return request.app.state.rating_refresher
