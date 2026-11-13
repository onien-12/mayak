"""Reading the topics of places and areas: one query for a whole page."""

from collections import defaultdict
from collections.abc import Collection

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.interests import InterestTarget, Topic
from app.models import InterestTag

Tags = dict[Topic, float]


async def for_targets(
    session: AsyncSession,
    target_type: InterestTarget,
    target_ids: Collection[int],
    topics: Collection[Topic] | None = None,
) -> dict[int, Tags]:
    """Merged tags (the strongest basis of every topic) per object; `topics` narrows them down."""
    if not target_ids:
        return {}
    statement = (
        select(InterestTag.target_id, InterestTag.topic, func.max(InterestTag.weight))
        .where(InterestTag.target_type == target_type, InterestTag.target_id.in_(list(target_ids)))
        .group_by(InterestTag.target_id, InterestTag.topic)
    )
    if topics is not None:
        statement = statement.where(InterestTag.topic.in_(list(topics)))
    merged: dict[int, Tags] = defaultdict(dict)
    for target_id, topic, weight in await session.execute(statement):
        merged[target_id][topic] = weight
    return dict(merged)


async def for_target(session: AsyncSession, target_type: InterestTarget, target_id: int) -> Tags:
    return (await for_targets(session, target_type, [target_id])).get(target_id, {})
