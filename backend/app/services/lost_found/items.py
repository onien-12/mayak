"""Posts of «Потеряшки» (SPEC §26): publishing, reading, closing and taking them down.

A post is screened like a note (SPEC §24.1): the author sees it at once, everyone else once the
check passes; its photos are screened with it. Lists show active posts only — returned and
expired ones stay reachable by their link.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import ColumnElement, and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.clock import utcnow
from app.core.errors import (
    BadRequestError,
    ConflictError,
    FieldValidationError,
    ForbiddenError,
    NotFoundError,
    RateLimitedError,
)
from app.domain import limits
from app.domain import lost_found as rules
from app.domain.enums import AiTarget
from app.domain.geo import BBox
from app.domain.lost_found import LostCategory, LostKind, LostState
from app.models import LostItem, LostItemPhoto, LostItemReport, LostMatch, LostResponse, Photo, User
from app.schemas.lost_found import LostItemCard, LostItemIn, LostItemOut
from app.schemas.user import UserBrief
from app.services import content, moderation_cases, quiet_holds, uploads
from app.services.lost_found import responses

DEFAULT_LIMIT = 200
MAX_LIMIT = 500
_NOT_FOUND = "Объявление не найдено."
_FUTURE_SLACK = timedelta(days=1)
"""The date is the author's local one; Vladivostok is ahead of UTC."""


@dataclass(frozen=True, slots=True)
class ItemFilters:
    kind: LostKind | None = None
    categories: tuple[LostCategory, ...] = ()
    since: date | None = None
    """Lost or found on this day or later."""
    bbox: BBox | None = None


def is_public(item: LostItem) -> bool:
    return not item.is_hidden


def is_active(item: LostItem, now: datetime) -> bool:
    return rules.state(item.created_at, item.closed_at, now) is LostState.ACTIVE


def active_clause(now: datetime) -> ColumnElement[bool]:
    """Public, not closed and not older than the lifetime of a post."""
    return and_(
        LostItem.is_hidden.is_(False),
        LostItem.closed_at.is_(None),
        LostItem.created_at > now - rules.LIFETIME,
    )


def as_post(item: LostItem) -> rules.Post:
    return rules.Post(
        title=item.title,
        description=item.description,
        category=item.category,
        point=(item.lat, item.lng),
        radius_m=item.radius_m if item.kind is LostKind.LOST else None,
        happened_on=item.happened_on,
    )


async def photos_of(session: AsyncSession, item_ids: list[int]) -> dict[int, list[Photo]]:
    if not item_ids:
        return {}
    rows = await session.execute(
        select(LostItemPhoto.item_id, Photo)
        .join(Photo, Photo.id == LostItemPhoto.photo_id)
        .where(LostItemPhoto.item_id.in_(item_ids))
        .order_by(LostItemPhoto.position, LostItemPhoto.id)
    )
    photos: dict[int, list[Photo]] = defaultdict(list)
    for item_id, photo in rows:
        photos[item_id].append(photo)
    return photos


def _card_fields(item: LostItem, photos: list[Photo], now: datetime, *, on_review: bool) -> dict[str, object]:
    return {
        "id": item.id,
        "kind": item.kind,
        "category": item.category,
        "title": item.title,
        "description": item.description,
        "lat": item.lat,
        "lng": item.lng,
        "radius_m": item.radius_m,
        "happened_on": item.happened_on,
        "state": rules.state(item.created_at, item.closed_at, now),
        "created_at": item.created_at,
        "expires_at": rules.expires_at(item.created_at),
        "author": UserBrief.model_validate(item.author),
        "cover_url": photos[0].url if photos else None,
        "photos_count": len(photos),
        "on_review": on_review,
    }


async def cards(
    session: AsyncSession, items: list[LostItem], viewer: User | None, now: datetime
) -> list[LostItemCard]:
    """Requires `item.author` to be loaded."""
    photos = await photos_of(session, [item.id for item in items])
    own = [item.id for item in items if viewer is not None and item.author_id == viewer.id]
    held = await quiet_holds.held_ids(session, AiTarget.LOST_ITEM, own)
    return [
        LostItemCard(**_card_fields(item, photos.get(item.id, []), now, on_review=item.id in held))
        for item in items
    ]


def _shown_to(viewer: User | None) -> ColumnElement[bool]:
    """Public posts, and the viewer's own ones still screened or held."""
    shown = LostItem.is_hidden.is_(False)
    if viewer is None:
        return shown
    own_held = and_(
        LostItem.author_id == viewer.id,
        LostItem.hidden_by_moderator.is_(False),
        LostItem.id.in_(quiet_holds.active_ids(AiTarget.LOST_ITEM)),
    )
    return or_(shown, own_held)


async def list_items(
    session: AsyncSession, viewer: User | None, filters: ItemFilters, limit: int
) -> list[LostItemCard]:
    """Active posts for the map and the list, newest first."""
    now = utcnow()
    statement = (
        select(LostItem)
        .where(
            _shown_to(viewer),
            LostItem.closed_at.is_(None),
            LostItem.created_at > now - rules.LIFETIME,
        )
        .options(joinedload(LostItem.author))
    )
    if filters.kind is not None:
        statement = statement.where(LostItem.kind == filters.kind)
    if filters.categories:
        statement = statement.where(LostItem.category.in_(filters.categories))
    if filters.since is not None:
        statement = statement.where(LostItem.happened_on >= filters.since)
    if filters.bbox is not None:
        area = filters.bbox
        statement = statement.where(
            LostItem.lat.between(area.min_lat, area.max_lat), LostItem.lng.between(area.min_lng, area.max_lng)
        )
    items = list(
        await session.scalars(statement.order_by(LostItem.created_at.desc(), LostItem.id.desc()).limit(limit))
    )
    return await cards(session, items, viewer, now)


async def list_mine(session: AsyncSession, author: User) -> list[LostItemCard]:
    """The author's own posts, returned and expired ones included."""
    items = list(
        await session.scalars(
            select(LostItem)
            .where(LostItem.author_id == author.id, LostItem.hidden_by_moderator.is_(False))
            .options(joinedload(LostItem.author))
            .order_by(LostItem.created_at.desc(), LostItem.id.desc())
        )
    )
    shown = [item for item in items if is_public(item) or await _held_for_author(session, item)]
    return await cards(session, shown, author, utcnow())


async def _held_for_author(session: AsyncSession, item: LostItem) -> bool:
    return await quiet_holds.find_active(session, AiTarget.LOST_ITEM, item.id) is not None


async def get_visible(session: AsyncSession, item_id: int, viewer: User | None) -> LostItem:
    """A hidden post is gone, except for moderators and for its author while it is screened or held."""
    item = await session.scalar(
        select(LostItem).where(LostItem.id == item_id).options(joinedload(LostItem.author))
    )
    if item is None:
        raise NotFoundError(_NOT_FOUND)
    if item.is_hidden:
        if viewer is not None and viewer.is_staff:
            return item
        is_author = viewer is not None and viewer.id == item.author_id and not item.hidden_by_moderator
        if not is_author or not await _held_for_author(session, item):
            raise NotFoundError(_NOT_FOUND)
    return item


async def _reported(session: AsyncSession, viewer: User | None, item_id: int) -> bool:
    if viewer is None:
        return False
    found = await session.scalar(
        select(LostItemReport.id).where(
            LostItemReport.item_id == item_id, LostItemReport.user_id == viewer.id
        )
    )
    return found is not None


async def item_out(session: AsyncSession, item: LostItem, viewer: User | None) -> LostItemOut:
    now = utcnow()
    photos = (await photos_of(session, [item.id])).get(item.id, [])
    is_mine = viewer is not None and viewer.id == item.author_id
    on_review = is_mine and bool(await quiet_holds.held_ids(session, AiTarget.LOST_ITEM, [item.id]))
    mine = await responses.own_response(session, item, viewer) if viewer is not None and not is_mine else None
    staff = viewer is not None and viewer.is_staff
    return LostItemOut(
        **_card_fields(item, photos, now, on_review=on_review),
        photos=await uploads.photos_out(session, photos, viewer),
        control_question=item.control_question,
        is_mine=is_mine,
        can_respond=(
            viewer is not None and not is_mine and mine is None and is_public(item) and is_active(item, now)
        ),
        can_delete=is_mine or staff,
        can_moderate=staff,
        is_hidden=item.is_hidden if staff else False,
        reported_by_me=await _reported(session, viewer, item.id),
        pending_responses=await responses.pending_count(session, item.id) if is_mine else 0,
        my_response=mine,
    )


async def get_item(session: AsyncSession, item_id: int, viewer: User | None) -> LostItemOut:
    return await item_out(session, await get_visible(session, item_id, viewer), viewer)


def _check_dates(happened_on: date, now: datetime) -> None:
    today = now.date()
    if happened_on > today + _FUTURE_SLACK:
        raise FieldValidationError("happened_on", "Дата не может быть в будущем.")
    if happened_on < today - timedelta(days=rules.MAX_DAYS_BACK):
        raise FieldValidationError("happened_on", "Дата слишком давняя: объявления живут месяц.")


async def _enforce_daily_limit(session: AsyncSession, author: User, now: datetime) -> None:
    if author.is_staff:
        return
    written = await session.scalar(
        select(func.count())
        .select_from(LostItem)
        .where(LostItem.author_id == author.id, LostItem.created_at > now - limits.DAY)
    )
    if (written or 0) >= rules.POSTS_PER_DAY:
        raise RateLimitedError(
            f"Достигнут дневной лимит объявлений: {rules.POSTS_PER_DAY}. Попробуйте завтра."
        )


async def _claim_photos(session: AsyncSession, author: User, photo_ids: list[int]) -> list[Photo]:
    photos = await uploads.claim_photos(session, author, photo_ids)
    if photos:
        taken = await session.scalar(
            select(LostItemPhoto.id)
            .where(LostItemPhoto.photo_id.in_([photo.id for photo in photos]))
            .limit(1)
        )
        if taken is not None:
            raise FieldValidationError("photo_ids", "Это фото уже прикреплено к другому объявлению.")
    return photos


async def create_item(session: AsyncSession, author: User, payload: LostItemIn) -> LostItemOut:
    """Others see the post once it passes screening (SPEC §24.1); moderators' posts are not screened."""
    now = utcnow()
    texts = {"название": payload.title, "описание": payload.description}
    for text in (payload.title, payload.description, payload.control_question or ""):
        content.ensure_clean_text(text)
    _check_dates(payload.happened_on, now)
    await _enforce_daily_limit(session, author, now)
    photos = await _claim_photos(session, author, payload.photo_ids)
    is_lost = payload.kind is LostKind.LOST
    screened = not author.is_staff
    item = LostItem(
        author=author,
        kind=payload.kind,
        category=payload.category,
        title=payload.title,
        description=payload.description,
        lat=payload.lat,
        lng=payload.lng,
        radius_m=payload.radius_m if is_lost else None,
        happened_on=payload.happened_on,
        control_question=None if is_lost else payload.control_question,
        is_hidden=screened,
        created_at=now,
    )
    session.add(item)
    await session.flush()
    for position, photo in enumerate(photos):
        session.add(LostItemPhoto(item_id=item.id, photo_id=photo.id, position=position))
    if screened:
        await quiet_holds.open_window(
            session,
            AiTarget.LOST_ITEM,
            item.id,
            author.id,
            now=now,
            heuristic_reasons=content.gibberish_reasons(texts),
        )
        await uploads.open_photo_windows(session, author, photos, now, parent=(AiTarget.LOST_ITEM, item.id))
    await session.commit()
    return await item_out(session, item, author)


async def _own_item(session: AsyncSession, actor: User, item_id: int, *, staff_too: bool = False) -> LostItem:
    item = await get_visible(session, item_id, actor)
    if item.author_id != actor.id and not (staff_too and actor.is_staff):
        raise ForbiddenError("Это может сделать только автор объявления.")
    return item


async def close_item(session: AsyncSession, actor: User, item_id: int) -> LostItemOut:
    """«Вернули хозяину»: the post leaves the map and the matcher; its page stays."""
    item = await _own_item(session, actor, item_id)
    if item.closed_at is None:
        item.closed_at = utcnow()
        await session.commit()
    return await item_out(session, item, actor)


async def delete_item(session: AsyncSession, actor: User, item_id: int) -> None:
    now = utcnow()
    item = await _own_item(session, actor, item_id, staff_too=True)
    await quiet_holds.withdraw(session, AiTarget.LOST_ITEM, item.id, now)
    await moderation_cases.close_cases_without_decision(session, AiTarget.LOST_ITEM, item.id, now)
    for response_id in await session.scalars(select(LostResponse.id).where(LostResponse.item_id == item.id)):
        await quiet_holds.withdraw(session, AiTarget.LOST_RESPONSE, response_id, now)
        await moderation_cases.close_cases_without_decision(session, AiTarget.LOST_RESPONSE, response_id, now)
    await session.execute(delete(LostResponse).where(LostResponse.item_id == item.id))
    await session.execute(delete(LostItemReport).where(LostItemReport.item_id == item.id))
    await session.execute(delete(LostItemPhoto).where(LostItemPhoto.item_id == item.id))
    await session.execute(
        delete(LostMatch).where(or_(LostMatch.lost_id == item.id, LostMatch.found_id == item.id))
    )
    await session.delete(item)
    await session.commit()


async def report_item(session: AsyncSession, reporter: User, item_id: int) -> None:
    """One report per user; enough distinct reports hide the post until a moderator looks."""
    item = await get_visible(session, item_id, reporter)
    if item.author_id == reporter.id:
        raise BadRequestError("Нельзя жаловаться на собственное объявление.")
    already = await session.scalar(
        select(LostItemReport.id).where(
            LostItemReport.item_id == item.id, LostItemReport.user_id == reporter.id
        )
    )
    if already is not None:
        return
    session.add(LostItemReport(item_id=item.id, user_id=reporter.id, created_at=utcnow()))
    await session.flush()
    reports = await session.scalar(
        select(func.count()).select_from(LostItemReport).where(LostItemReport.item_id == item.id)
    )
    if (reports or 0) >= rules.REPORTS_TO_HIDE:
        item.is_hidden = True
    await session.commit()


async def set_hidden(session: AsyncSession, moderator: User, item_id: int, hidden: bool) -> LostItemOut:
    """A moderator takes a post down or puts it back; a post still screened stays with the screening."""
    item = await get_visible(session, item_id, moderator)
    if await quiet_holds.find_active(session, AiTarget.LOST_ITEM, item.id) is not None:
        raise ConflictError("Объявление ещё на автоматической проверке — решение в списке удержанных.")
    item.is_hidden = hidden
    item.hidden_by_moderator = hidden
    if not hidden:
        await session.execute(delete(LostItemReport).where(LostItemReport.item_id == item.id))
    await session.commit()
    return await item_out(session, item, moderator)
