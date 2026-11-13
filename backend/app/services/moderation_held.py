"""Held photos, comments, reviews and notes (SPEC §24.1): a list apart from the case queue.

Each held item has a moderation case of its own (opened by the hold), so every decision goes
to the same immutable log. Two outcomes only: release (show it after all) or remove; either way
the author, who was told about the hold, hears how it ended.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.clock import utcnow
from app.core.errors import ConflictError, NotFoundError
from app.domain.enums import AiTarget, CaseState, HoldState, ModerationAction, NotificationKind
from app.models import (
    Comment,
    MapNote,
    ModerationCase,
    Photo,
    Place,
    QuietHold,
    Review,
    Route,
    RouteStop,
    User,
)
from app.schemas.moderation import AiReviewOut, HeldItemOut, HeldOwner
from app.schemas.place import PhotoOut
from app.schemas.user import UserBrief
from app.services import moderation, moderation_cases, notifications, screening, standing

SMALL_ITEMS = (AiTarget.PHOTO, AiTarget.COMMENT, AiTarget.REVIEW, AiTarget.NOTE)
DEFAULT_LIMIT = 50
MAX_LIMIT = 200

_MODELS: dict[AiTarget, type[Comment | Review | MapNote | Photo]] = {
    AiTarget.PHOTO: Photo,
    AiTarget.COMMENT: Comment,
    AiTarget.REVIEW: Review,
    AiTarget.NOTE: MapNote,
}
_RELEASED_TITLES: dict[AiTarget, str] = {
    AiTarget.PHOTO: "Ваше фото проверено и опубликовано",
    AiTarget.COMMENT: "Ваш комментарий проверен и опубликован",
    AiTarget.REVIEW: "Ваш отзыв проверен и опубликован",
    AiTarget.NOTE: "Ваша заметка проверена и опубликована",
}
_REMOVED_TITLES: dict[AiTarget, str] = {
    AiTarget.PHOTO: "Ваше фото убрано модератором",
    AiTarget.COMMENT: "Ваш комментарий удалён модератором",
    AiTarget.REVIEW: "Ваш отзыв удалён модератором",
    AiTarget.NOTE: "Ваша заметка удалена модератором",
}


async def _owners(
    session: AsyncSession, place_id: int | None, route_id: int | None
) -> dict[str, HeldOwner | None]:
    place = await session.get(Place, place_id) if place_id is not None else None
    route = await session.get(Route, route_id) if route_id is not None else None
    return {
        "place": HeldOwner(id=place.id, title=place.title) if place is not None else None,
        "route": HeldOwner(id=route.id, title=route.title) if route is not None else None,
    }


async def _item_fields(session: AsyncSession, hold: QuietHold) -> dict[str, object] | None:
    """What the moderator needs to judge the item; None when the item no longer exists."""
    item = await session.get(_MODELS[hold.target_type], hold.target_id)
    match item:
        case None:
            return None
        case Comment():
            return {"text": item.text, **await _owners(session, item.place_id, None)}
        case Review():
            return {
                "text": item.text,
                "rating": item.rating,
                **await _owners(session, item.place_id, item.route_id),
            }
        case MapNote():
            return {"text": item.text, "object_name": item.object_name, "place": None, "route": None}
    stop = await session.get(RouteStop, item.route_stop_id) if item.route_stop_id else None
    owners = await _owners(session, item.place_id, stop.route_id if stop else None)
    return {"photo": PhotoOut.model_validate(item), **owners}


async def list_held(
    session: AsyncSession, *, kind: AiTarget | None, limit: int, offset: int
) -> list[HeldItemOut]:
    """Items held on their own and waiting for a moderator, oldest first."""
    statement = select(QuietHold).where(
        QuietHold.state == HoldState.HELD,
        QuietHold.parent_type.is_(None),
        QuietHold.target_type.in_([kind] if kind else SMALL_ITEMS),
    )
    holds = list(
        await session.scalars(
            statement.order_by(QuietHold.updated_at, QuietHold.id).offset(offset).limit(limit)
        )
    )
    authors = {
        user.id: user
        for user in await session.scalars(select(User).where(User.id.in_({hold.author_id for hold in holds})))
    }
    scores = await standing.scores(session, list(authors))
    items: list[HeldItemOut] = []
    for hold in holds:
        fields = await _item_fields(session, hold)
        case = await moderation_cases.find_open_case(session, hold.target_type, hold.target_id)
        if fields is None or case is None:
            continue
        review = await moderation_cases.latest_ai_review(session, hold.target_type, hold.target_id)
        items.append(
            HeldItemOut(
                id=hold.id,
                kind=hold.target_type,
                target_id=hold.target_id,
                case_id=case.id,
                author=UserBrief.model_validate(authors[hold.author_id]),
                author_standing=scores[hold.author_id],
                reasons=hold.reasons,
                source=hold.source,
                ai_review=AiReviewOut.model_validate(review) if review else None,
                created_at=hold.created_at,
                **fields,
            )
        )
    return items


async def _held(session: AsyncSession, hold_id: int) -> tuple[QuietHold, ModerationCase]:
    hold = await session.get(QuietHold, hold_id)
    if hold is None or hold.target_type not in SMALL_ITEMS or hold.parent_type is not None:
        raise NotFoundError("Удержанный элемент не найден.")
    if hold.state is not HoldState.HELD:
        raise ConflictError("Решение по этому элементу уже принято.")
    case = await session.scalar(
        select(ModerationCase)
        .where(
            ModerationCase.target_type == hold.target_type,
            ModerationCase.target_id == hold.target_id,
            ModerationCase.state == CaseState.OPEN,
        )
        .options(joinedload(ModerationCase.author))
    )
    if case is None:
        raise ConflictError("Решение по этому элементу уже принято.")
    return hold, case


async def release(session: AsyncSession, moderator: User, hold_id: int, reason: str) -> None:
    """The check was wrong: show the item as if it had passed and tell its author."""
    now = utcnow()
    hold, case = await _held(session, hold_id)
    moderation.log_decision(session, case, moderator, ModerationAction.RELEASE, reason, now)
    await screening.release(session, hold, now, by_moderator=True)
    _tell_author(session, hold, moderator, _RELEASED_TITLES, reason, await _link(session, hold), now)
    await session.commit()


async def remove(session: AsyncSession, moderator: User, hold_id: int, reason: str) -> None:
    """The hold was right: the item stays out of sight for good (a photo comes off its place)."""
    now = utcnow()
    hold, case = await _held(session, hold_id)
    moderation.log_decision(session, case, moderator, ModerationAction.REMOVE, reason, now)
    await screening.confirm(session, hold, now, penalize=True)
    link = await _link(session, hold)
    if hold.target_type is AiTarget.PHOTO:
        await screening.detach_photo(session, hold.target_id, now)
    _tell_author(session, hold, moderator, _REMOVED_TITLES, reason, link, now)
    await session.commit()


def _tell_author(
    session: AsyncSession,
    hold: QuietHold,
    moderator: User,
    titles: dict[AiTarget, str],
    reason: str,
    link: str | None,
    now: datetime,
) -> None:
    if hold.author_id != moderator.id:
        notifications.notify(
            session,
            user_id=hold.author_id,
            kind=NotificationKind.MODERATION,
            title=titles[hold.target_type],
            body=reason,
            link=link,
            now=now,
        )


async def _link(session: AsyncSession, hold: QuietHold) -> str | None:
    """Read before a removed photo comes off its place."""
    found = await screening.owner(session, hold)
    return found.link if found is not None else None
