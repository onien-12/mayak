"""Reputation changes: every delta is a `ReputationEvent`; level-ups notify the user (SPEC §4)."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import levels
from app.domain.enums import NotificationKind, ReputationReason, UserLevel
from app.domain.limits import DAY
from app.domain.reputation import RULES
from app.models import ReputationEvent, User
from app.schemas.user import ReputationEventOut
from app.services import notifications

LEVEL_NAMES: dict[UserLevel, str] = {
    UserLevel.NEWCOMER: "Новичок",
    UserLevel.RESIDENT: "Житель",
    UserLevel.TRUSTED: "Доверенный житель",
    UserLevel.EXPERT: "Эксперт",
}


async def _rewarded_recently(
    session: AsyncSession, user_id: int, reason: ReputationReason, now: datetime
) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(ReputationEvent)
        .where(
            ReputationEvent.user_id == user_id,
            ReputationEvent.reason == reason,
            ReputationEvent.created_at > now - DAY,
        )
    )
    return count or 0


async def award(
    session: AsyncSession,
    user: User,
    reason: ReputationReason,
    *,
    now: datetime,
    place_id: int | None = None,
) -> bool:
    """Apply the rule for `reason`; returns False for system users or an exhausted daily cap."""
    if user.is_system:
        return False
    rule = RULES[reason]
    if (
        rule.daily_cap is not None
        and await _rewarded_recently(session, user.id, reason, now) >= rule.daily_cap
    ):
        return False
    level_before = user.level
    user.reputation += rule.delta
    session.add(
        ReputationEvent(
            user_id=user.id,
            delta=rule.delta,
            reason=reason,
            message=rule.message,
            place_id=place_id,
            created_at=now,
        )
    )
    if levels.level_rank(user.level) > levels.level_rank(level_before):
        notifications.notify(
            session,
            user_id=user.id,
            kind=NotificationKind.LEVEL_UP,
            title=f"Новый уровень: {LEVEL_NAMES[user.level]}",
            body="Ваш голос теперь весит больше, а возможностей стало больше.",
            link=notifications.user_link(user.id),
            now=now,
        )
    return True


async def award_once_per_place(
    session: AsyncSession, user: User, reason: ReputationReason, *, place_id: int, now: datetime
) -> bool:
    """Award only if this user was never rewarded for this reason on this place."""
    already = await session.scalar(
        select(ReputationEvent.id)
        .where(
            ReputationEvent.user_id == user.id,
            ReputationEvent.reason == reason,
            ReputationEvent.place_id == place_id,
        )
        .limit(1)
    )
    if already is not None:
        return False
    return await award(session, user, reason, now=now, place_id=place_id)


async def list_events(session: AsyncSession, user: User, *, limit: int) -> list[ReputationEventOut]:
    rows = await session.scalars(
        select(ReputationEvent)
        .where(ReputationEvent.user_id == user.id)
        .order_by(ReputationEvent.created_at.desc(), ReputationEvent.id.desc())
        .limit(limit)
    )
    return [ReputationEventOut.model_validate(row) for row in rows]
