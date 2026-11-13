"""Learned affinity (SPEC §23.3): what a person does with objects moves the topics of those objects.

Object signals are recorded after the person's action has been committed, in a session of their
own: recording one can never fail or undo the action itself. A search signal keeps only the topic
increments; the text of the query is neither stored nor logged.
"""

import logging
from collections.abc import Mapping
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.domain import interests as rules
from app.domain.interests import InterestTarget, Topic
from app.domain.limits import DAY
from app.models import User, UserInterest
from app.services.interests import tags

logger = logging.getLogger(__name__)
_PRECISION = 4


async def _apply(session: AsyncSession, user_id: int, changes: Mapping[Topic, float], now: datetime) -> None:
    if not changes:
        return
    rows = {
        row.topic: row
        for row in await session.scalars(
            select(UserInterest).where(UserInterest.user_id == user_id, UserInterest.topic.in_(list(changes)))
        )
    }
    for topic, change in changes.items():
        row = rows.get(topic)
        if row is None:
            row = UserInterest(user_id=user_id, topic=topic, chosen=False, affinity=0.0)
            session.add(row)
        row.affinity = round(rules.clamp_affinity(row.affinity + change), _PRECISION)
        row.updated_at = now


async def on_place(session: AsyncSession, user_id: int, place_id: int, delta: float) -> None:
    """Favourites, collections, reviews, event participation; never raises."""
    if delta == 0:
        return
    try:
        async with AsyncSession(session.bind, expire_on_commit=False) as own:
            place_tags = await tags.for_target(own, InterestTarget.PLACE, place_id)
            await _apply(own, user_id, rules.affinity_changes(place_tags, delta), utcnow())
            await own.commit()
    except Exception:
        logger.exception("Interest signal for a place was not recorded")


async def on_favorite(session: AsyncSession, user_id: int, place_id: int, *, added: bool) -> None:
    await on_place(session, user_id, place_id, rules.FAVORITE_DELTA if added else -rules.FAVORITE_DELTA)


async def on_collection(session: AsyncSession, user_id: int, place_id: int, *, added: bool) -> None:
    await on_place(session, user_id, place_id, rules.COLLECTION_DELTA if added else -rules.COLLECTION_DELTA)


async def on_participation(session: AsyncSession, user_id: int, place_id: int, *, joined: bool) -> None:
    await on_place(session, user_id, place_id, rules.EVENT_DELTA if joined else -rules.EVENT_DELTA)


async def on_review(
    session: AsyncSession, user_id: int, place_id: int, rating: int, previous: int | None
) -> None:
    await on_place(session, user_id, place_id, rules.review_delta(rating, previous))


async def on_search(session: AsyncSession, user: User, query: str) -> None:
    """+0.3 per topic the lexicon finds in the query, at most once per topic per day."""
    now = utcnow()
    found = rules.keyword_topics(query) if len(query.strip()) >= rules.SEARCH_MIN_LENGTH else set()
    if not found:
        return
    rows = {
        row.topic: row
        for row in await session.scalars(
            select(UserInterest).where(UserInterest.user_id == user.id, UserInterest.topic.in_(list(found)))
        )
    }
    for topic in found:
        row = rows.get(topic)
        if row is not None and row.searched_at is not None and now - row.searched_at < DAY:
            continue
        if row is None:
            row = UserInterest(user_id=user.id, topic=topic, chosen=False, affinity=0.0)
            session.add(row)
        row.affinity = round(rules.clamp_affinity(row.affinity + rules.SEARCH_DELTA), _PRECISION)
        row.searched_at = now
        row.updated_at = now
    await session.commit()
