"""A person's interest profile (SPEC §23.3): chosen topics plus affinity learned from behaviour.

Private: read only for its owner (`MyInterests`) and for personalising what they see. Weights and
affinity numbers never leave the server.
"""

from collections.abc import Sequence

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.domain import interests as rules
from app.domain.interests import Profile, Topic
from app.models import User, UserInterest, UserInterestSettings
from app.schemas.interest import MyInterests, TopicOut


def catalogue() -> list[TopicOut]:
    return [
        TopicOut(slug=info.slug, label=info.label, description=info.description) for info in rules.CATALOGUE
    ]


async def _rows(session: AsyncSession, user_id: int) -> list[UserInterest]:
    return list(await session.scalars(select(UserInterest).where(UserInterest.user_id == user_id)))


async def load(session: AsyncSession, user_id: int) -> Profile:
    rows = await session.execute(
        select(UserInterest.topic, UserInterest.chosen, UserInterest.affinity).where(
            UserInterest.user_id == user_id
        )
    )
    return rules.profile_of((row.topic, row.chosen, row.affinity) for row in rows)


async def resolve(session: AsyncSession, viewer: User | None, topics: Sequence[Topic]) -> Profile:
    """The signed-in person's profile; else (or while it is empty) the visitor's `topics` param."""
    if viewer is not None:
        profile = await load(session, viewer.id)
        if profile:
            return profile
    return rules.profile_from_topics(topics)


async def my_interests(session: AsyncSession, user: User) -> MyInterests:
    rows = await _rows(session, user.id)
    onboarded_at = await session.scalar(
        select(UserInterestSettings.onboarded_at).where(UserInterestSettings.user_id == user.id)
    )
    chosen = sorted((row.topic for row in rows if row.chosen), key=rules.TOPIC_ORDER.__getitem__)
    noticed = sorted(
        (row for row in rows if rules.is_noticed(row.chosen, row.affinity)),
        key=lambda row: (-row.affinity, rules.TOPIC_ORDER[row.topic]),
    )
    return MyInterests(
        topics=chosen, noticed=[row.topic for row in noticed], onboarded=onboarded_at is not None
    )


async def set_chosen(session: AsyncSession, user: User, topics: Sequence[Topic]) -> MyInterests:
    """Replace the chosen set and mark the picker as answered."""
    now = utcnow()
    wanted = set(topics)
    rows = {row.topic: row for row in await _rows(session, user.id)}
    for topic, row in rows.items():
        row.chosen = topic in wanted
        row.updated_at = now
    for topic in wanted - rows.keys():
        session.add(UserInterest(user_id=user.id, topic=topic, chosen=True, affinity=0.0, updated_at=now))
    settings = await session.get(UserInterestSettings, user.id)
    if settings is None:
        session.add(UserInterestSettings(user_id=user.id, onboarded_at=now))
    elif settings.onboarded_at is None:
        settings.onboarded_at = now
    await session.commit()
    return await my_interests(session, user)


async def forget_learned(session: AsyncSession, user: User) -> MyInterests:
    """Reset everything learned from behaviour; the chosen topics stay."""
    await session.execute(
        update(UserInterest)
        .where(UserInterest.user_id == user.id)
        .values(affinity=0.0, searched_at=None, updated_at=utcnow())
    )
    await session.commit()
    return await my_interests(session, user)
