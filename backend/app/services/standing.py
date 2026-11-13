"""Hidden author standing (SPEC §24.4): reading it and changing it with an audit row."""

from collections.abc import Collection
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import standing as rules
from app.domain.enums import AiTarget, StandingReason
from app.models import AuthorStanding, StandingEvent


async def score(session: AsyncSession, user_id: int) -> int:
    value = await session.scalar(select(AuthorStanding.score).where(AuthorStanding.user_id == user_id))
    return rules.START if value is None else value


async def scores(session: AsyncSession, user_ids: Collection[int]) -> dict[int, int]:
    """Standing of several authors in one query; everyone without a row is at the start."""
    found: dict[int, int] = {}
    if user_ids:
        rows = await session.execute(
            select(AuthorStanding.user_id, AuthorStanding.score).where(AuthorStanding.user_id.in_(user_ids))
        )
        found = dict(rows.all())
    return {user_id: found.get(user_id, rules.START) for user_id in user_ids}


async def change(
    session: AsyncSession,
    user_id: int,
    reason: StandingReason,
    *,
    now: datetime,
    target: tuple[AiTarget, int] | None = None,
) -> int:
    """Apply one event of SPEC §24.4 and log it; returns the new score."""
    row = await session.get(AuthorStanding, user_id)
    if row is None:
        row = AuthorStanding(user_id=user_id, score=rules.START, updated_at=now)
        session.add(row)
    before = row.score
    row.score = rules.changed(before, reason)
    row.updated_at = now
    session.add(
        StandingEvent(
            user_id=user_id,
            delta=row.score - before,
            score=row.score,
            reason=reason,
            target_type=target[0] if target else None,
            target_id=target[1] if target else None,
            created_at=now,
        )
    )
    return row.score
