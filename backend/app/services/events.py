"""Events: afisha queries, participation and schedule changes (SPEC §3.4)."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.clock import utcnow
from app.core.errors import BadRequestError, ConflictError, FieldValidationError
from app.domain import event_phase, geo
from app.domain.enums import PUBLIC_STATUSES, Layer, NotificationKind, PlaceStatus
from app.models import EventDetails, EventParticipant, Place, User
from app.schemas.place import EventUpdate, PlaceCard, PlaceDetail
from app.schemas.user import UserBrief
from app.services import mappers, notifications, place_details, place_queries
from app.services.interests import signals as interest_signals
from app.services.place_queries import Origin

DEFAULT_LIMIT = 100
MAX_LIMIT = 500
_UPDATABLE_FIELDS = (
    "capacity",
    "price",
    "price_note",
    "age_limit",
    "registration_url",
    "contact",
    "is_meetup",
    "venue_place_id",
)


class EventScope(StrEnum):
    UPCOMING = "upcoming"
    PAST = "past"
    ALL = "all"


class MeetupFilter(StrEnum):
    ONLY = "only"
    EXCLUDE = "exclude"


class EventSort(StrEnum):
    START = "start"
    POPULAR = "popular"
    PRICE = "price"
    DISTANCE = "distance"


@dataclass(frozen=True, slots=True)
class EventFilters:
    scope: EventScope = EventScope.UPCOMING
    starts_from: datetime | None = None
    ends_to: datetime | None = None
    category_ids: tuple[int, ...] = ()
    query: str | None = None
    meetups: MeetupFilter | None = None
    origin: Origin | None = None
    free_only: bool = False
    sort: EventSort = EventSort.START
    lat: float | None = None
    lng: float | None = None
    radius_m: float | None = None
    limit: int = DEFAULT_LIMIT
    offset: int = 0


def _scope_clause(scope: EventScope, now: datetime) -> object | None:
    is_upcoming = (EventDetails.ends_at >= now) & EventDetails.is_cancelled.is_(False)
    if scope is EventScope.UPCOMING:
        return is_upcoming
    if scope is EventScope.PAST:
        return EventDetails.ends_at < now
    return None


def _filtered(filters: EventFilters, now: datetime, viewer: User | None) -> Select[tuple[Place]]:
    statement = place_queries.card_query().where(
        Place.layer == Layer.EVENT, place_queries.listed_clause(viewer)
    )
    clauses = [
        _scope_clause(filters.scope, now),
        EventDetails.ends_at >= filters.starts_from if filters.starts_from else None,
        EventDetails.starts_at <= filters.ends_to if filters.ends_to else None,
        Place.category_id.in_(filters.category_ids) if filters.category_ids else None,
        Place.search_text.contains(filters.query.casefold(), autoescape=True) if filters.query else None,
        EventDetails.is_meetup.is_(filters.meetups is MeetupFilter.ONLY) if filters.meetups else None,
        Place.external_source.is_not(None) if filters.origin is Origin.EXTERNAL else None,
        Place.external_source.is_(None) if filters.origin is Origin.COMMUNITY else None,
        EventDetails.price == 0 if filters.free_only else None,
    ]
    return statement.where(*(clause for clause in clauses if clause is not None))


async def list_events(
    session: AsyncSession, filters: EventFilters, viewer: User | None = None
) -> list[PlaceCard]:
    """Public events; the viewer's own quietly held ones too, as they see them (SPEC §24.1)."""
    now = utcnow()
    by_distance = filters.sort is EventSort.DISTANCE
    if filters.lat is None or filters.lng is None:
        if by_distance:
            raise FieldValidationError("sort", "Для сортировки по расстоянию передайте координаты lat и lng.")
        if filters.radius_m is not None:
            raise FieldValidationError("radius_m", "Для поиска в радиусе передайте координаты lat и lng.")
    statement = _filtered(filters, now, viewer)

    order = {
        EventSort.START: (EventDetails.starts_at.asc(),),
        EventSort.POPULAR: (EventDetails.participants_count.desc(), EventDetails.starts_at.asc()),
        EventSort.PRICE: (EventDetails.price.asc().nulls_last(), EventDetails.starts_at.asc()),
        EventSort.DISTANCE: (),
    }[filters.sort]
    if filters.scope is EventScope.PAST and filters.sort is EventSort.START:
        order = (EventDetails.starts_at.desc(),)
    statement = statement.order_by(*order, Place.id)

    if by_distance or filters.radius_m is not None:
        # Distances are computed here, so the page is cut after filtering and sorting.
        def distance(place: Place) -> float:
            return geo.haversine_m(filters.lat, filters.lng, place.lat, place.lng)

        found = list(await session.scalars(statement))
        if filters.radius_m is not None:
            found = [place for place in found if distance(place) <= filters.radius_m]
        if by_distance:
            found.sort(key=distance)
        page = found[filters.offset : filters.offset + filters.limit]
    else:
        page = list(await session.scalars(statement.limit(filters.limit).offset(filters.offset)))
    return await place_queries.cards(session, page, now)


async def list_my_events(session: AsyncSession, user: User) -> list[PlaceCard]:
    """Events the user joined or organises that are neither finished nor cancelled, by start time."""
    now = utcnow()
    joined = select(EventParticipant.place_id).where(EventParticipant.user_id == user.id)
    rows = await session.scalars(
        place_queries.card_query()
        .where(
            Place.layer == Layer.EVENT,
            Place.status.in_((*PUBLIC_STATUSES, PlaceStatus.PENDING)),
            EventDetails.ends_at >= now,
            EventDetails.is_cancelled.is_(False),
            or_(Place.author_id == user.id, Place.id.in_(joined)),
        )
        .order_by(EventDetails.starts_at, Place.id)
    )
    return await place_queries.cards(session, list(rows), now)


async def _event_place(session: AsyncSession, place_id: int, viewer: User | None) -> Place:
    place = await place_queries.get_visible_place(session, place_id, viewer)
    if place.event is None:
        raise BadRequestError("Эта публикация не является событием.")
    return place


async def _participation(session: AsyncSession, place_id: int, user_id: int) -> EventParticipant | None:
    return await session.scalar(
        select(EventParticipant).where(
            EventParticipant.place_id == place_id, EventParticipant.user_id == user_id
        )
    )


async def add_participant(session: AsyncSession, place: Place, user: User, now: datetime) -> bool:
    """Register the user; returns False when they already participate."""
    if await _participation(session, place.id, user.id) is not None:
        return False
    session.add(EventParticipant(place_id=place.id, user_id=user.id, created_at=now))
    place.event.participants_count += 1
    if user.id != place.author_id and not place.author.is_system:
        notifications.notify(
            session,
            user_id=place.author_id,
            kind=NotificationKind.EVENT_JOINED,
            title=f"Новый участник: {user.display_name}",
            body=f"Присоединился к событию «{place.title}».",
            link=notifications.place_link(place.id),
            now=now,
        )
    return True


async def join(session: AsyncSession, user: User, place_id: int) -> PlaceDetail:
    now = utcnow()
    place = await _event_place(session, place_id, user)
    event = place.event
    seen = await place_queries.shown_status(session, place) if user.id == place.author_id else place.status
    if seen not in PUBLIC_STATUSES:
        raise ConflictError("Событие ещё не опубликовано.")
    if await _participation(session, place.id, user.id) is None:
        refusal = event_phase.join_refusal(
            mappers.phase_of(event, now),
            registration_closed=event.registration_closed,
            capacity=event.capacity,
            participants_count=event.participants_count,
        )
        if refusal is not None:
            raise ConflictError(refusal)
        await add_participant(session, place, user, now)
        await session.commit()
        await interest_signals.on_participation(session, user.id, place.id, joined=True)
    return await place_details.build(session, place, user, now)


async def leave(session: AsyncSession, user: User, place_id: int) -> PlaceDetail:
    now = utcnow()
    place = await _event_place(session, place_id, user)
    participation = await _participation(session, place.id, user.id)
    if participation is not None:
        await session.delete(participation)
        place.event.participants_count = max(place.event.participants_count - 1, 0)
        await session.commit()
        await interest_signals.on_participation(session, user.id, place.id, joined=False)
    return await place_details.build(session, place, user, now)


async def list_participants(
    session: AsyncSession, place_id: int, viewer: User | None = None
) -> list[UserBrief]:
    place = await _event_place(session, place_id, viewer)
    rows = await session.scalars(
        select(EventParticipant)
        .where(EventParticipant.place_id == place.id)
        .options(joinedload(EventParticipant.user))
        .order_by(EventParticipant.created_at, EventParticipant.id)
    )
    return [UserBrief.model_validate(row.user) for row in rows]


async def notify_participants(
    session: AsyncSession, place: Place, kind: NotificationKind, title: str, now: datetime
) -> None:
    user_ids = await session.scalars(
        select(EventParticipant.user_id).where(EventParticipant.place_id == place.id)
    )
    for user_id in user_ids:
        if user_id != place.author_id:
            notifications.notify(
                session,
                user_id=user_id,
                kind=kind,
                title=title,
                body=f"Событие «{place.title}».",
                link=notifications.place_link(place.id),
                now=now,
            )


async def apply_update(session: AsyncSession, place: Place, update: EventUpdate, now: datetime) -> list[str]:
    """Apply the provided event fields; rescheduling or cancelling notifies participants."""
    event = place.event
    provided = update.model_fields_set
    changed: list[str] = []

    starts_at = update.starts_at or event.starts_at
    ends_at = update.ends_at or event.ends_at
    if (starts_at, ends_at) != (event.starts_at, event.ends_at):
        if ends_at <= starts_at:
            raise FieldValidationError("event.ends_at", "Окончание события должно быть позже начала.")
        event.starts_at, event.ends_at = starts_at, ends_at
        changed.append("время проведения")
        await notify_participants(
            session, place, NotificationKind.EVENT_CHANGED, "Изменилось время события", now
        )

    if update.is_cancelled is not None and update.is_cancelled != event.is_cancelled:
        event.is_cancelled = update.is_cancelled
        changed.append("отмена события" if update.is_cancelled else "событие возобновлено")
        if update.is_cancelled:
            await notify_participants(
                session, place, NotificationKind.EVENT_CANCELLED, "Событие отменено", now
            )

    if update.registration_closed is not None and update.registration_closed != event.registration_closed:
        event.registration_closed = update.registration_closed
        changed.append("регистрация")

    details_changed = False
    for name in _UPDATABLE_FIELDS:
        if name in provided and getattr(event, name) != getattr(update, name):
            setattr(event, name, getattr(update, name))
            details_changed = True
    if details_changed:
        changed.append("параметры события")
    return changed
