"""Holds of the screening in motion (SPEC §24): releasing, holding and closing them.

The screener calls these after its checks, moderators through their decisions. A release at the
end of the screening window is silent: the item appears for everyone else exactly as a normal
publication would have. A hold leaves the item where only the author and moderators see it and
tells the author once that it did not pass and why, in words without the model's numbers.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.domain import hold_reasons
from app.domain.enums import (
    ACTIVE_HOLD_STATES,
    PUBLIC_STATUSES,
    AiTarget,
    HistoryKind,
    HoldSource,
    HoldState,
    ModerationTrigger,
    NotificationKind,
    PlaceStatus,
    RouteStatus,
    StandingReason,
)
from app.models import Comment, MapNote, Photo, Place, QuietHold, Review, Route, RouteStop, User
from app.services import (
    areas,
    comments,
    history,
    moderation_cases,
    notifications,
    place_queries,
    quiet_holds,
    reviews,
    routes,
    standing,
    uploads,
)
from app.services.interests import tagging as interest_tagging
from app.services.moderation_cases import CaseTarget

_TITLE_LIMIT = 120
_NOTE_TITLE = "Заметка на карте"
REVIEW_HISTORY_MESSAGE = "Автоматическая проверка: публикацию посмотрит модератор"
HOLD_HISTORY_MESSAGE = "Публикация отправлена на проверку автоматическим фильтром"


@dataclass(frozen=True, slots=True)
class Owner:
    """What the author of an item recognises it by, and where it is shown."""

    title: str | None
    link: str | None


def _title(prefix: str, title: str) -> str:
    text = f"{prefix} «{title}»"
    return text if len(text) <= _TITLE_LIMIT else f"{text[: _TITLE_LIMIT - 1]}…"


async def _owner_title(session: AsyncSession, place_id: int | None, route_id: int | None) -> str:
    if place_id is not None:
        place = await session.get(Place, place_id)
        return place.title if place is not None else ""
    route = await session.get(Route, route_id) if route_id is not None else None
    return route.title if route is not None else ""


async def case_target(session: AsyncSession, hold: QuietHold) -> CaseTarget | None:
    """What the hold's moderation case is about; None when the item no longer exists."""
    match hold.target_type:
        case AiTarget.PLACE:
            return moderation_cases.place_target(await place_queries.get_place(session, hold.target_id))
        case AiTarget.ROUTE:
            route = await routes.find_route(session, hold.target_id)
            return moderation_cases.route_target(route) if route is not None else None
    author = await session.get(User, hold.author_id)
    item = await _small_item(session, hold)
    if item is None or author is None:
        return None
    match item:
        case Comment():
            title = _title("Комментарий к", await _owner_title(session, item.place_id, None))
        case Review():
            title = _title("Отзыв к", await _owner_title(session, item.place_id, item.route_id))
        case MapNote():
            title = _title("Заметка", item.object_name) if item.object_name else _NOTE_TITLE
        case _:
            stop = await session.get(RouteStop, item.route_stop_id) if item.route_stop_id else None
            title = _title(
                "Фото к", await _owner_title(session, item.place_id, stop.route_id if stop else None)
            )
    return CaseTarget(hold.target_type, hold.target_id, title, None, author)


async def _owner_of(session: AsyncSession, place_id: int | None, route_id: int | None) -> Owner:
    if place_id is not None:
        return Owner(await _owner_title(session, place_id, None), notifications.place_link(place_id))
    if route_id is not None:
        return Owner(await _owner_title(session, None, route_id), notifications.route_link(route_id))
    return Owner(None, None)


async def owner(session: AsyncSession, hold: QuietHold) -> Owner | None:
    """The place or route the item is (or is about), a note's 2GIS object; None when gone."""
    if hold.target_type in (AiTarget.PLACE, AiTarget.ROUTE):
        is_place = hold.target_type is AiTarget.PLACE
        return await _owner_of(
            session, hold.target_id if is_place else None, None if is_place else hold.target_id
        )
    item = await _small_item(session, hold)
    if item is None:
        return None
    if isinstance(item, MapNote):
        return Owner(item.object_name, notifications.spot_link(item.lat, item.lng, item.object_id))
    route_id = item.route_id if isinstance(item, Review) else None
    if isinstance(item, Photo) and item.route_stop_id is not None:
        stop = await session.get(RouteStop, item.route_stop_id)
        route_id = stop.route_id if stop is not None else None
    return await _owner_of(session, item.place_id, route_id)


async def _small_item(session: AsyncSession, hold: QuietHold) -> Comment | Review | MapNote | Photo | None:
    model = {
        AiTarget.COMMENT: Comment,
        AiTarget.REVIEW: Review,
        AiTarget.NOTE: MapNote,
        AiTarget.PHOTO: Photo,
    }[hold.target_type]
    return await session.get(model, hold.target_id)


async def hold_item(
    session: AsyncSession,
    hold: QuietHold,
    *,
    reasons: list[str],
    source: HoldSource,
    triggers: list[ModerationTrigger],
    now: datetime,
) -> None:
    """Keep the item where only its author and moderators see it and put it before a moderator.

    Once per hold, however many reasons it collects and however often it is checked again,
    the author is told and their standing loses points. Occurrences of an event series held
    with the item are held with it.
    """
    hold.state = HoldState.HELD
    hold.reasons = list(dict.fromkeys([*hold.reasons, *reasons]))
    hold.source = hold.source or source
    hold.updated_at = now
    siblings = await _hold_siblings(session, hold, now)
    if not hold.penalized:
        hold.penalized = True
        await standing.change(
            session, hold.author_id, StandingReason.HELD, now=now, target=(hold.target_type, hold.target_id)
        )
        await _tell_author(session, hold, now)
        for held in (hold, *siblings):
            await _record_place_hold(session, held, now)
    target = await case_target(session, hold)
    if target is not None:
        for trigger in dict.fromkeys(triggers or [ModerationTrigger.AUTO_AI]):
            await moderation_cases.open_case(session, target, trigger, now=now, flags=hold.reasons)
    if hold.target_type is AiTarget.PHOTO:
        await _refresh_photo_place(session, hold, now)


async def _hold_siblings(session: AsyncSession, hold: QuietHold, now: datetime) -> list[QuietHold]:
    """The other occurrences of an event series screened with the item: held for the same reasons."""
    siblings = [
        child
        for child in await quiet_holds.children(session, hold)
        if child.target_type is AiTarget.PLACE and child.state in ACTIVE_HOLD_STATES
    ]
    for sibling in siblings:
        sibling.state = HoldState.HELD
        sibling.reasons = list(hold.reasons)
        sibling.source = hold.source
        sibling.updated_at = now
    return siblings


async def _tell_author(session: AsyncSession, hold: QuietHold, now: datetime) -> None:
    """One notice per hold: what did not pass, why, and that a moderator will decide."""
    seen_by = await owner(session, hold)
    if seen_by is None:
        return
    notifications.notify(
        session,
        user_id=hold.author_id,
        kind=NotificationKind.MODERATION,
        title=hold_reasons.notice_title(hold.target_type, seen_by.title),
        body=hold_reasons.notice_body(hold.target_type, hold.reasons),
        link=seen_by.link,
        now=now,
    )


async def _record_place_hold(session: AsyncSession, hold: QuietHold, now: datetime) -> None:
    """The place's history tells its author that it went to a moderator (SPEC §24.1)."""
    if hold.target_type is not AiTarget.PLACE or not hold.shown_status:
        return
    seen = PlaceStatus(hold.shown_status)
    place = await session.get(Place, hold.target_id)
    if place is None or seen is PlaceStatus.PENDING:
        return
    history.record(
        session,
        place,
        HistoryKind.STATUS_CHANGED,
        HOLD_HISTORY_MESSAGE,
        now=now,
        old_status=seen,
        new_status=PlaceStatus.PENDING,
    )


async def release(session: AsyncSession, hold: QuietHold, now: datetime, *, by_moderator: bool) -> None:
    """Show the item (and whatever was screened with it) to everyone.

    Passing the checks earns the author a point of standing; a moderator overruling a hold
    returns what the hold took.
    """
    was_penalized = hold.penalized
    _close(hold, HoldState.RELEASED, now)
    await _show(session, hold, now)
    for child in await quiet_holds.children(session, hold):
        if child.state in ACTIVE_HOLD_STATES:
            _close(child, HoldState.RELEASED, now)
            await _show(session, child, now)
    target = (hold.target_type, hold.target_id)
    if not by_moderator:
        await standing.change(session, hold.author_id, StandingReason.PASSED, now=now, target=target)
    elif was_penalized:
        await standing.change(session, hold.author_id, StandingReason.RELEASED, now=now, target=target)


async def confirm(session: AsyncSession, hold: QuietHold, now: datetime, *, penalize: bool) -> list[int]:
    """A moderator decided against the item. Photos held with it are taken off; `penalize` for
    a confirmed hold (reject, hide, removal), not for a request to change something.

    Returns the other occurrences of an event series screened with the item: the same
    decision applies to them."""
    _close(hold, HoldState.DECIDED, now)
    siblings: list[int] = []
    for child in await quiet_holds.children(session, hold):
        if child.state not in ACTIVE_HOLD_STATES:
            continue
        _close(child, HoldState.DECIDED if child.state is HoldState.HELD else HoldState.RELEASED, now)
        if child.target_type is AiTarget.PLACE:
            child.state = HoldState.DECIDED
            siblings.append(child.target_id)
        elif child.state is HoldState.DECIDED:
            await detach_photo(session, child.target_id, now)
    if penalize and hold.penalized:
        await standing.change(
            session,
            hold.author_id,
            StandingReason.CONFIRMED,
            now=now,
            target=(hold.target_type, hold.target_id),
        )
    return siblings


def _close(hold: QuietHold, state: HoldState, now: datetime) -> None:
    hold.state = state
    hold.updated_at = hold.decided_at = now


async def detach_photo(session: AsyncSession, photo_id: int, now: datetime) -> None:
    """Take a photo off its place or stop; the file stays, nobody shows it any more."""
    photo = await session.get(Photo, photo_id)
    if photo is None:
        return
    place_id = photo.place_id
    photo.place_id = None
    photo.route_stop_id = None
    if place_id is not None:
        place = await session.get(Place, place_id)
        await uploads.refresh_cover(session, place)
        await areas.refresh_area(session, place.area_id, now)


async def _refresh_photo_place(session: AsyncSession, hold: QuietHold, now: datetime) -> None:
    photo = await session.get(Photo, hold.target_id)
    if photo is not None and photo.place_id is not None:
        place = await session.get(Place, photo.place_id)
        await uploads.refresh_cover(session, place)
        await areas.refresh_area(session, place.area_id, now)


async def _show(session: AsyncSession, hold: QuietHold, now: datetime) -> None:
    match hold.target_type:
        case AiTarget.PLACE:
            await _show_place(session, hold, now)
        case AiTarget.ROUTE:
            route = await session.get(Route, hold.target_id)
            if route is not None and route.status is RouteStatus.PENDING and hold.shown_status:
                route.status = RouteStatus(hold.shown_status)
        case AiTarget.PHOTO:
            await _show_photo(session, hold, now)
        case AiTarget.COMMENT:
            comment = await session.scalar(
                select(Comment).where(Comment.id == hold.target_id).options(joinedload(Comment.author))
            )
            if comment is not None and comment.is_hidden:
                comment.is_hidden = False
                place = await place_queries.get_place(session, comment.place_id)
                comments.announce(session, place, comment, now)
        case AiTarget.REVIEW:
            review = await session.get(Review, hold.target_id)
            if review is not None and review.is_hidden:
                review.is_hidden = False
                await reviews.refresh_owner(session, review, now)
        case AiTarget.NOTE:
            note = await session.get(MapNote, hold.target_id)
            if note is not None:
                note.is_hidden = False


async def _show_place(session: AsyncSession, hold: QuietHold, now: datetime) -> None:
    place = await place_queries.get_place(session, hold.target_id)
    if place.status is not PlaceStatus.PENDING or not hold.shown_status:
        return
    place.status = PlaceStatus(hold.shown_status)
    if place.status not in PUBLIC_STATUSES:
        return
    await areas.refresh_area(session, place.area_id, now)
    if place.area_id is not None:
        await interest_tagging.refresh_inside(session, [place.area_id])
    if hold.announce:
        await notifications.notify_territory(session, place, now)


async def _show_photo(session: AsyncSession, hold: QuietHold, now: datetime) -> None:
    photo = await session.get(Photo, hold.target_id)
    if photo is None or photo.place_id is None:
        return
    place = await session.get(Place, photo.place_id)
    await uploads.refresh_cover(session, place)
    await areas.refresh_area(session, place.area_id, now)
    if hold.parent_type is None:
        uploader = await session.get(User, photo.uploader_id) if photo.uploader_id else None
        uploads.record_photos_added(session, place, uploader, 1, now)
        place.updated_at = now


async def send_to_review(session: AsyncSession, hold: QuietHold, now: datetime) -> None:
    """Doubt below the hold threshold (SPEC §14 as before): shown with a warning, and a case."""
    if hold.target_type is AiTarget.PLACE:
        place = await place_queries.get_place(session, hold.target_id)
        if place.status in PUBLIC_STATUSES and place.status is not PlaceStatus.NEEDS_REVIEW:
            history.record(
                session,
                place,
                HistoryKind.STATUS_CHANGED,
                REVIEW_HISTORY_MESSAGE,
                now=now,
                old_status=place.status,
                new_status=PlaceStatus.NEEDS_REVIEW,
            )
            place.status = PlaceStatus.NEEDS_REVIEW
            await areas.refresh_area(session, place.area_id, now)
        target = moderation_cases.place_target(place)
    elif hold.target_type is AiTarget.ROUTE:
        route = await routes.get_route(session, hold.target_id)
        if route.status is RouteStatus.PUBLISHED:
            route.status = RouteStatus.NEEDS_REVIEW
        target = moderation_cases.route_target(route)
    else:
        return
    await moderation_cases.open_case(session, target, ModerationTrigger.AUTO_AI, now=now)


async def refresh_open_case(session: AsyncSession, hold: QuietHold) -> None:
    """A newer opinion arrived for an item already before a moderator: recompute the case risk."""
    target = await case_target(session, hold)
    if target is None:
        return
    case = await moderation_cases.find_open_case(session, target.type, target.id)
    if case is not None:
        await moderation_cases.refresh_case(session, case, target)
