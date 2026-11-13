"""Places: map queries, creation with limits and screening, editing and archiving."""

import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum
from operator import itemgetter

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.errors import (
    ConflictError,
    FieldValidationError,
    ForbiddenError,
    RateLimitedError,
)
from app.domain import ai_moderation, content_check, geo, levels, limits, trust
from app.domain import attributes as attribute_rules
from app.domain.attributes import AttributeValue
from app.domain.enums import (
    PUBLIC_STATUSES,
    AiTarget,
    ExternalSourceId,
    HistoryKind,
    InfoSource,
    IssueSeverity,
    IssueStage,
    Layer,
    ModerationTrigger,
    PlaceStatus,
)
from app.domain.geo import BBox
from app.models import Area, Category, EventDetails, IssueDetails, Photo, Place, PlaceQuality, User
from app.schemas.place import (
    EventInput,
    HistoryEntry,
    IssueInput,
    PlaceCard,
    PlaceDetail,
    PlaceInput,
    PlaceUpdate,
)
from app.services import (
    areas,
    content,
    events,
    history,
    locality,
    moderation_cases,
    notifications,
    place_details,
    place_queries,
    quiet_holds,
    screening,
    uploads,
)
from app.services.external_ratings import RatingRefresher
from app.services.interests import tagging as interest_tagging
from app.services.place_queries import Origin

DEFAULT_LIST_LIMIT = 500
MAX_LIST_LIMIT = 1000
DEFAULT_NEAR_RADIUS_M = 80
MAX_NEAR_RADIUS_M = 1000
_EDITABLE_FIELDS: dict[str, str] = {
    "title": "название",
    "description": "описание",
    "tips": "советы",
    "address": "адрес",
    "object_id": "объект на карте",
    "lat": "координаты",
    "lng": "координаты",
    "tags": "теги",
}
_NULLABLE_FIELDS = frozenset({"tips", "address", "object_id"})
_SCREENED_LABELS = frozenset({"название", "описание", "советы", "фото"})
"""Changes re-checked by today's text and image flags (SPEC §6)."""
_WINDOW_LABELS = frozenset({"название", "описание", "советы", "адрес", "теги", "характеристики"})
"""Changes of the author's own words that open a new screening window (SPEC §24.1)."""


class MinStatus(StrEnum):
    ANY = "any"
    PRELIMINARY = "preliminary"
    VERIFIED = "verified"


_STATUSES_BY_MIN: dict[MinStatus, tuple[PlaceStatus, ...]] = {
    MinStatus.ANY: PUBLIC_STATUSES,
    MinStatus.PRELIMINARY: (PlaceStatus.PRELIMINARY, PlaceStatus.VERIFIED),
    MinStatus.VERIFIED: (PlaceStatus.VERIFIED,),
}


@dataclass(frozen=True, slots=True)
class PlaceFilters:
    bbox: BBox | None = None
    layers: tuple[Layer, ...] = ()
    category_ids: tuple[int, ...] = ()
    min_status: MinStatus = MinStatus.ANY
    query: str | None = None
    tags: tuple[str, ...] = ()
    attrs: Mapping[str, str] = field(default_factory=dict)
    event_from: datetime | None = None
    event_to: datetime | None = None
    include_past_events: bool = False
    include_resolved: bool = False
    author_id: int | None = None
    area_id: int | None = None
    origin: Origin | None = None
    near: tuple[float, float] | None = None
    """`(lat, lng)`: only places within `radius_m`, nearest first."""
    radius_m: int = DEFAULT_NEAR_RADIUS_M
    limit: int = DEFAULT_LIST_LIMIT


@dataclass(frozen=True, slots=True)
class ExternalRef:
    """Identity of a place imported from an external source."""

    source: ExternalSourceId
    external_id: str
    url: str
    image_url: str | None = None


def build_search_text(title: str, description: str, address: str | None, tags: Sequence[str]) -> str:
    return "\n".join([title, description, address or "", " ".join(tags)]).casefold()


async def get_detail(
    session: AsyncSession, place_id: int, viewer: User | None, ratings: RatingRefresher
) -> PlaceDetail:
    """The card; opening it is what refreshes the linked 2GIS rating when due."""
    now = utcnow()
    place = await place_queries.get_visible_place(session, place_id, viewer)
    await ratings.refresh_if_due(session, place.object_id, now)
    return await place_details.build(session, place, viewer, now)


async def list_history(session: AsyncSession, place_id: int, viewer: User | None) -> list[HistoryEntry]:
    place = await place_queries.get_visible_place(session, place_id, viewer)
    return await history.list_for_place(session, place.id)


def _visibility_clause(filters: PlaceFilters, viewer: User | None) -> object:
    """Public places of the requested statuses; the viewer's own submissions waiting for
    pre-moderation (or held by the screening) on the default map, and their places in a
    screening window as they see them."""
    listed = place_queries.listed_clause(viewer, _STATUSES_BY_MIN[filters.min_status])
    if viewer is None or filters.min_status is not MinStatus.ANY:
        return listed
    return listed | ((Place.status == PlaceStatus.PENDING) & (Place.author_id == viewer.id))


def _lifecycle_clauses(filters: PlaceFilters, now: datetime) -> list[object]:
    """Finished / cancelled events and resolved issues leave the default map."""
    clauses: list[object] = []
    if not filters.include_past_events:
        still_relevant = and_(EventDetails.ends_at >= now, EventDetails.is_cancelled.is_(False))
        clauses.append(or_(Place.layer != Layer.EVENT, still_relevant))
    if filters.event_from is not None:
        clauses.append(or_(Place.layer != Layer.EVENT, EventDetails.ends_at >= filters.event_from))
    if filters.event_to is not None:
        clauses.append(or_(Place.layer != Layer.EVENT, EventDetails.starts_at <= filters.event_to))
    if not filters.include_resolved:
        clauses.append(or_(Place.layer != Layer.ISSUE, IssueDetails.stage != IssueStage.RESOLVED))
    return clauses


def _matches_json_filters(place: Place, filters: PlaceFilters) -> bool:
    """Tag and attribute filters run in Python: both live in JSON columns."""
    if filters.tags and not set(filters.tags).issubset(place.tags):
        return False
    return attribute_rules.matches_filters(place.attributes, filters.attrs)


async def list_places(session: AsyncSession, viewer: User | None, filters: PlaceFilters) -> list[PlaceCard]:
    now = utcnow()
    statement = place_queries.card_query().where(
        _visibility_clause(filters, viewer), *_lifecycle_clauses(filters, now)
    )
    if filters.bbox is not None:
        statement = statement.where(
            Place.lat.between(filters.bbox.min_lat, filters.bbox.max_lat),
            Place.lng.between(filters.bbox.min_lng, filters.bbox.max_lng),
        )
    if filters.layers:
        statement = statement.where(Place.layer.in_(filters.layers))
    if filters.category_ids:
        statement = statement.where(Place.category_id.in_(filters.category_ids))
    if filters.author_id is not None:
        statement = statement.where(Place.author_id == filters.author_id)
    if filters.query:
        statement = statement.where(Place.search_text.contains(filters.query.casefold(), autoescape=True))
    if filters.area_id is not None:
        statement = statement.where(Place.area_id == filters.area_id)
    if filters.origin is not None:
        is_external = Place.external_source.is_not(None)
        statement = statement.where(is_external if filters.origin is Origin.EXTERNAL else ~is_external)
    if filters.near is not None:
        area = geo.bbox_around(*filters.near, filters.radius_m)
        statement = statement.where(
            Place.lat.between(area.min_lat, area.max_lat), Place.lng.between(area.min_lng, area.max_lng)
        )
    usefulness = func.coalesce(PlaceQuality.usefulness, ai_moderation.NEUTRAL_USEFULNESS)
    statement = statement.outerjoin(PlaceQuality, PlaceQuality.place_id == Place.id).order_by(
        Place.trust_score.desc(), usefulness.desc(), Place.id.desc()
    )
    filters_in_python = bool(filters.tags or filters.attrs or filters.near)
    if not filters_in_python:
        statement = statement.limit(filters.limit)
    places = [place for place in await session.scalars(statement) if _matches_json_filters(place, filters)]
    if filters.near is not None:
        places = _nearest_first(places, filters.near, filters.radius_m)
    return await place_queries.cards(session, places[: filters.limit], now)


def _nearest_first(places: list[Place], center: tuple[float, float], radius_m: int) -> list[Place]:
    measured = [(geo.haversine_m(*center, place.lat, place.lng), place) for place in places]
    return [place for distance, place in sorted(measured, key=itemgetter(0)) if distance <= radius_m]


async def _category_for_layer(session: AsyncSession, category_id: int, layer: Layer) -> Category:
    category = await session.get(Category, category_id)
    if category is None or category.layer is not layer:
        raise FieldValidationError("category_id", "Категория не найдена в выбранном слое.")
    return category


def _coerce_attributes(category: Category, raw: Mapping[str, object] | None) -> dict[str, AttributeValue]:
    try:
        return attribute_rules.coerce_attributes(category.fields, raw)
    except attribute_rules.InvalidAttributeError as error:
        raise FieldValidationError(f"attributes.{error.key}", error.message) from error


async def _recent_places(session: AsyncSession, author_id: int, now: datetime) -> list[limits.RecentPlace]:
    rows = await session.execute(
        select(Place.lat, Place.lng, Place.created_at, EventDetails.series_id)
        .outerjoin(EventDetails, EventDetails.place_id == Place.id)
        .where(Place.author_id == author_id, Place.created_at > now - limits.DAY)
    )
    return [limits.RecentPlace(row.lat, row.lng, row.created_at, row.series_id) for row in rows]


async def places_left_today(session: AsyncSession, user: User, now: datetime) -> int:
    used = limits.publications_count(await _recent_places(session, user.id, now))
    return max(levels.daily_place_limit(user.level, user.role) - used, 0)


async def _enforce_creation_limits(
    session: AsyncSession, author: User, lat: float, lng: float, now: datetime
) -> None:
    violation = limits.place_creation_violation(
        daily_limit=levels.daily_place_limit(author.level, author.role),
        recent=await _recent_places(session, author.id, now),
        lat=lat,
        lng=lng,
        now=now,
    )
    if violation is not None:
        raise RateLimitedError(violation)


async def _validate_event(session: AsyncSession, event: EventInput, now: datetime) -> None:
    if event.ends_at <= now:
        raise FieldValidationError("event.ends_at", "Событие должно заканчиваться в будущем.")
    if event.venue_place_id is not None and await session.get(Place, event.venue_place_id) is None:
        raise FieldValidationError("event.venue_place_id", "Площадка не найдена.")


def expand_occurrences(payload: PlaceInput) -> list[PlaceInput]:
    """A repeating event expands into independent places shifted by the interval."""
    event = payload.event
    if event is None or event.repeat is None:
        return [payload]
    step = timedelta(days=event.repeat.interval_days)
    return [
        payload.model_copy(
            update={
                "event": event.model_copy(
                    update={
                        "starts_at": event.starts_at + step * index,
                        "ends_at": event.ends_at + step * index,
                    }
                )
            }
        )
        for index in range(event.repeat.count)
    ]


def _event_details(event: EventInput, series_id: str | None) -> EventDetails:
    return EventDetails(
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        capacity=event.capacity,
        price=event.price,
        price_note=event.price_note or None,
        age_limit=event.age_limit,
        registration_url=event.registration_url or None,
        contact=event.contact or None,
        is_meetup=event.is_meetup,
        venue_place_id=event.venue_place_id,
        series_id=series_id,
    )


def _issue_details(issue: IssueInput | None, now: datetime) -> IssueDetails:
    issue = issue or IssueInput()
    return IssueDetails(
        stage=IssueStage.DETECTED,
        stage_changed_at=now,
        severity=issue.severity or IssueSeverity.MEDIUM,
        radius_m=issue.radius_m,
        source=InfoSource.USER,
        detected_at=issue.detected_at or now,
    )


async def _area_for(session: AsyncSession, payload: PlaceInput) -> tuple[Area | None, bool]:
    """The location of a new place and whether the author chose it by hand.

    An omitted `area_id` means "by position"; an explicit value (including null) is kept
    through later automatic re-attachments.
    """
    if "area_id" in payload.model_fields_set:
        return await areas.resolve_explicit(session, payload.area_id), True
    return await areas.containing_area(session, payload.lat, payload.lng), False


def build_place(
    author: User,
    category: Category,
    payload: PlaceInput,
    *,
    attributes: dict[str, AttributeValue],
    status: PlaceStatus,
    now: datetime,
    area: Area | None,
    area_pinned: bool = False,
    series_id: str | None = None,
    external: ExternalRef | None = None,
) -> Place:
    """A new place with its extension and initial trust; nothing is written yet."""
    author_prior = levels.author_prior(author.level, author.role)
    local_factor = (
        1.0
        if external
        else locality.factor_for(author, payload.layer, category.slug, payload.lat, payload.lng)
    )
    totals = (
        trust.with_external_baseline(trust.VoteTotals(), external.source) if external else trust.VoteTotals()
    )
    return Place(
        layer=payload.layer,
        category=category,
        author=author,
        area=area,
        area_pinned=area_pinned,
        title=payload.title,
        description=payload.description,
        tips=payload.tips or None,
        lat=payload.lat,
        lng=payload.lng,
        address=payload.address or None,
        object_id=payload.object_id,
        attributes=attributes,
        tags=payload.tags,
        search_text=build_search_text(payload.title, payload.description, payload.address, payload.tags),
        title_key=content_check.normalize_title(payload.title),
        status=status,
        author_prior=author_prior,
        author_local_factor=local_factor,
        trust_score=trust.trust_score(author_prior * local_factor, totals, now, now),
        external_source=external.source if external else None,
        external_id=external.external_id if external else None,
        external_url=external.url if external else None,
        external_image_url=external.image_url if external else None,
        cover_url=external.image_url if external else None,
        created_at=now,
        updated_at=now,
        event=_event_details(payload.event, series_id) if payload.event else None,
        issue=_issue_details(payload.issue, now) if payload.layer is Layer.ISSUE else None,
    )


def record_creation(session: AsyncSession, place: Place, now: datetime) -> None:
    history.record(
        session,
        place,
        HistoryKind.CREATED,
        "Публикация создана",
        now=now,
        actor=place.author,
        new_status=place.status,
    )


async def insert_place(
    session: AsyncSession,
    author: User,
    category: Category,
    payload: PlaceInput,
    *,
    attributes: dict[str, AttributeValue],
    status: PlaceStatus,
    now: datetime,
    series_id: str | None = None,
    external: ExternalRef | None = None,
) -> Place:
    """Persist one place with its extension and the first history entry."""
    area, area_pinned = await _area_for(session, payload)
    place = build_place(
        author,
        category,
        payload,
        attributes=attributes,
        status=status,
        now=now,
        area=area,
        area_pinned=area_pinned,
        series_id=series_id,
        external=external,
    )
    session.add(place)
    await session.flush()
    record_creation(session, place, now)
    return place


def _case_triggers(author: User, text_flags: list[str], photo_flags: list[str]) -> list[ModerationTrigger]:
    triggers: list[ModerationTrigger] = []
    if not levels.publishes_directly(author.level, author.role):
        triggers.append(ModerationTrigger.PREMODERATION)
    if text_flags:
        triggers.append(ModerationTrigger.AUTO_TEXT)
    if photo_flags:
        triggers.append(ModerationTrigger.AUTO_IMAGE)
    return triggers


async def _announce(
    session: AsyncSession, place: Place, triggers: list[ModerationTrigger], flags: list[str], now: datetime
) -> None:
    """A pending place goes to the moderation queue; a published one is announced to subscribers.
    A screened place is announced only once it is released (SPEC §24.1)."""
    if place.status is PlaceStatus.PENDING:
        target = moderation_cases.place_target(place)
        for trigger in triggers:
            await moderation_cases.open_case(session, target, trigger, now=now, flags=flags)
        return
    await notifications.notify_territory(session, place, now)


def _texts(title: str, description: str, tips: str | None) -> dict[str, str | None]:
    return {"название": title, "описание": description, "советы": tips}


async def _open_place_window(
    session: AsyncSession,
    place: Place,
    author: User,
    *,
    shown: PlaceStatus,
    now: datetime,
    announce: bool,
    parent: Place | None = None,
) -> None:
    """Hide the place from everyone else until the checks pass; its author keeps seeing `shown`."""
    await quiet_holds.open_window(
        session,
        AiTarget.PLACE,
        place.id,
        author.id,
        now=now,
        shown_status=shown,
        parent=(AiTarget.PLACE, parent.id) if parent is not None else None,
        announce=announce,
        heuristic_reasons=content.gibberish_reasons(_texts(place.title, place.description, place.tips)),
    )
    place.status = PlaceStatus.PENDING


async def publish_place(
    session: AsyncSession,
    author: User,
    category: Category,
    payload: PlaceInput,
    *,
    attributes: dict[str, AttributeValue],
    photos: list[Photo],
    now: datetime,
    screen: bool = False,
) -> Place:
    """Screen, persist and announce a new publication; returns its first occurrence.

    The status follows the author's level unless the automatic checks raise flags. With `screen`
    nobody else sees the places until the screener releases them (SPEC §24.1); the seed and the
    imports never screen. Limits and request validation are the caller's job, which lets the seed
    replay history through here.
    """
    text_flags = content_check.text_flags(payload.title, payload.description, payload.tips)
    text_flags += await content.duplicate_flags(
        session,
        author_id=author.id,
        layer=payload.layer,
        title=payload.title,
        lat=payload.lat,
        lng=payload.lng,
        event=payload.event,
        now=now,
    )
    photo_flags = await uploads.image_flags(session, photos)
    flags = [*text_flags, *photo_flags]
    status = PlaceStatus.PENDING if flags else levels.initial_status(author.level, author.role)
    triggers = _case_triggers(author, text_flags, photo_flags)

    occurrences = expand_occurrences(payload)
    series_id = uuid.uuid4().hex if len(occurrences) > 1 else None
    created = [
        await insert_place(
            session,
            author,
            category,
            occurrence,
            attributes=attributes,
            status=status,
            now=now,
            series_id=series_id,
        )
        for occurrence in occurrences
    ]
    leader = created[0]
    if screen:
        for place in created:
            parent = None if place is leader else leader
            await _open_place_window(
                session, place, author, shown=status, now=now, announce=True, parent=parent
            )
        await uploads.open_photo_windows(session, author, photos, now, parent=(AiTarget.PLACE, leader.id))
    await uploads.set_place_photos(session, leader, photos)
    for place in created:
        if not screen or status is PlaceStatus.PENDING:
            await _announce(session, place, triggers, flags, now)
    await areas.refresh_area(session, leader.area_id, now)
    await interest_tagging.tag_places(session, [place.id for place in created], now)
    return leader


async def create_place(session: AsyncSession, author: User, payload: PlaceInput) -> PlaceDetail:
    now = utcnow()
    category = await _category_for_layer(session, payload.category_id, payload.layer)
    attributes = _coerce_attributes(category, payload.attributes)
    content.ensure_sane_address(payload.address, _texts(payload.title, payload.description, payload.tips))
    if payload.event is not None:
        await _validate_event(session, payload.event, now)
    await _enforce_creation_limits(session, author, payload.lat, payload.lng, now)
    photos = await uploads.claim_photos(session, author, payload.photo_ids)
    place = await publish_place(
        session,
        author,
        category,
        payload,
        attributes=attributes,
        photos=photos,
        now=now,
        screen=not author.is_staff,
    )
    await session.commit()
    return await place_details.build(session, place, author, now)


def _apply_basic_fields(place: Place, payload: PlaceUpdate) -> list[str]:
    changed: list[str] = []
    for name, label in _EDITABLE_FIELDS.items():
        if name not in payload.model_fields_set:
            continue
        value = getattr(payload, name)
        if name in _NULLABLE_FIELDS:
            value = value or None
        elif value is None:
            continue
        if getattr(place, name) != value:
            setattr(place, name, value)
            changed.append(label)
    return changed


async def _apply_area(session: AsyncSession, place: Place, payload: PlaceUpdate, *, moved: bool) -> list[str]:
    """An explicit choice pins the location; otherwise a moved place follows its new position."""
    if "area_id" in payload.model_fields_set:
        area = await areas.resolve_explicit(session, payload.area_id)
        place.area_pinned = True
    elif moved and not place.area_pinned:
        area = await areas.containing_area(session, place.lat, place.lng)
    else:
        return []
    if (area.id if area else None) == place.area_id:
        return []
    place.area = area
    return ["локация"]


async def _apply_category_and_attributes(
    session: AsyncSession, place: Place, payload: PlaceUpdate
) -> list[str]:
    changed: list[str] = []
    if payload.category_id is not None and payload.category_id != place.category_id:
        place.category = await _category_for_layer(session, payload.category_id, place.layer)
        place.attributes = _coerce_attributes(place.category, place.attributes)
        changed.append("категория")
    if payload.attributes is not None:
        attributes = _coerce_attributes(place.category, payload.attributes)
        if attributes != place.attributes:
            place.attributes = attributes
            changed.append("характеристики")
    return changed


def _apply_issue_fields(place: Place, issue: IssueInput | None) -> list[str]:
    if issue is None or place.issue is None:
        return []
    changed = False
    if issue.severity is not None and issue.severity is not place.issue.severity:
        place.issue.severity = issue.severity
        changed = True
    if issue.detected_at is not None and issue.detected_at != place.issue.detected_at:
        place.issue.detected_at = issue.detected_at
        changed = True
    if "radius_m" in issue.model_fields_set and issue.radius_m != place.issue.radius_m:
        place.issue.radius_m = issue.radius_m
        changed = True
    return ["параметры проблемы"] if changed else []


async def _replace_photos(
    session: AsyncSession, actor: User, place: Place, photo_ids: list[int]
) -> list[Photo] | None:
    """Replace the photo list. Returns the newly attached photos, or None when nothing changed."""
    current = [photo.id for photo in await uploads.list_place_photos(session, place.id)]
    photos = await uploads.claim_photos(session, actor, photo_ids, place=place)
    if [photo.id for photo in photos] == current:
        return None
    await uploads.set_place_photos(session, place, photos)
    return [photo for photo in photos if photo.id not in current]


async def _rescreen(
    session: AsyncSession, place: Place, actor: User, new_photos: list[Photo], now: datetime
) -> None:
    """Re-run the automatic checks after an edit of screened content by a regular user."""
    if actor.is_staff:
        return
    target = moderation_cases.place_target(place)
    text_flags = content_check.text_flags(place.title, place.description, place.tips)
    photo_flags = await uploads.image_flags(session, new_photos)
    if not text_flags and not photo_flags:
        return
    seen = await place_queries.shown_status(session, place)
    if await place_queries.intended_status(session, place) in PUBLIC_STATUSES:
        if seen in PUBLIC_STATUSES:
            history.record(
                session,
                place,
                HistoryKind.STATUS_CHANGED,
                screening.HOLD_HISTORY_MESSAGE,
                now=now,
                old_status=seen,
                new_status=PlaceStatus.PENDING,
            )
        place.status = PlaceStatus.PENDING
        hold = await quiet_holds.find_active(session, AiTarget.PLACE, place.id)
        if hold is not None:
            hold.shown_status = PlaceStatus.PENDING
    if text_flags:
        await moderation_cases.open_case(
            session, target, ModerationTrigger.AUTO_TEXT, now=now, flags=text_flags
        )
    if photo_flags:
        await moderation_cases.open_case(
            session, target, ModerationTrigger.AUTO_IMAGE, now=now, flags=photo_flags
        )


async def _sync_moderation_queue(
    session: AsyncSession, place: Place, actor: User, intended: PlaceStatus, now: datetime
) -> None:
    """An author's edit of a place waiting for pre-moderation re-queues it (a held one is
    before a moderator already); an open case follows the new title."""
    if intended is PlaceStatus.PENDING and actor.id == place.author_id:
        await moderation_cases.open_case(
            session, moderation_cases.place_target(place), ModerationTrigger.PREMODERATION, now=now
        )
    open_case = await moderation_cases.find_open_case(session, AiTarget.PLACE, place.id)
    if open_case is not None:
        open_case.target_title = place.title


async def _screen_edit(
    session: AsyncSession,
    place: Place,
    actor: User,
    changed: list[str],
    new_photos: list[Photo],
    intended: PlaceStatus,
    now: datetime,
) -> None:
    """The author's new words open a screening window; new photos are checked with the place
    when it is screened anyway, else one by one while the place stays as it is (SPEC §24.1).
    Moderators' edits are not screened."""
    if actor.is_staff:
        return
    reopens = bool(_WINDOW_LABELS.intersection(changed)) and place.status is not PlaceStatus.HIDDEN
    if reopens:
        await _open_place_window(session, place, actor, shown=intended, now=now, announce=False)
    parent = (AiTarget.PLACE, place.id) if reopens else None
    await uploads.open_photo_windows(session, actor, new_photos, now, parent=parent)


async def update_place(
    session: AsyncSession, actor: User, place_id: int, payload: PlaceUpdate
) -> PlaceDetail:
    now = utcnow()
    place = await place_queries.get_visible_place(session, place_id, actor)
    if place.status is PlaceStatus.ARCHIVED:
        raise ConflictError("Архивную публикацию нельзя редактировать.")
    if not place_details.can_edit(place, actor):
        raise ForbiddenError("Редактировать публикацию может только автор или модератор.")
    if "address" in payload.model_fields_set and payload.address and payload.address != place.address:
        texts = _texts(
            payload.title or place.title,
            payload.description if payload.description is not None else place.description,
            payload.tips if "tips" in payload.model_fields_set else place.tips,
        )
        content.ensure_sane_address(payload.address, texts)

    previous_area_id = place.area_id
    changed = _apply_basic_fields(place, payload)
    changed += await _apply_area(session, place, payload, moved="координаты" in changed)
    changed += await _apply_category_and_attributes(session, place, payload)
    changed += _apply_issue_fields(place, payload.issue)
    new_photos: list[Photo] = []
    if payload.photo_ids is not None:
        attached = await _replace_photos(session, actor, place, payload.photo_ids)
        if attached is not None:
            new_photos = attached
            changed.append("фото")
    if payload.event is not None and place.event is not None:
        changed += await events.apply_update(session, place, payload.event, now)

    changed = list(dict.fromkeys(changed))
    if changed:
        place.updated_at = now
        place.locally_edited = place.external_source is not None
        place.search_text = build_search_text(place.title, place.description, place.address, place.tags)
        place.title_key = content_check.normalize_title(place.title)
        history.record(
            session, place, HistoryKind.EDITED, f"Изменено: {', '.join(changed)}", now=now, actor=actor
        )
        if _SCREENED_LABELS.intersection(changed):
            await _rescreen(session, place, actor, new_photos, now)
        intended = await place_queries.intended_status(session, place)
        await _screen_edit(session, place, actor, changed, new_photos, intended, now)
        if new_photos:
            await uploads.refresh_cover(session, place)
        await _sync_moderation_queue(session, place, actor, intended, now)
        await session.flush()
        for area_id in {previous_area_id, place.area_id}:
            await areas.refresh_area(session, area_id, now)
        await interest_tagging.tag_places(session, [place.id], now, also_areas=[previous_area_id])
    await session.commit()
    return await place_details.build(session, place, actor, now)


async def archive_place(session: AsyncSession, actor: User, place_id: int) -> None:
    """Soft delete: the place leaves the map but stays in history."""
    now = utcnow()
    place = await place_queries.get_visible_place(session, place_id, actor)
    if actor.id != place.author_id and not actor.is_staff:
        raise ForbiddenError("Удалить публикацию может только автор или модератор.")
    if place.status is PlaceStatus.ARCHIVED:
        return
    history.record(
        session,
        place,
        HistoryKind.STATUS_CHANGED,
        "Публикация перенесена в архив",
        now=now,
        actor=actor,
        old_status=await place_queries.shown_status(session, place),
        new_status=PlaceStatus.ARCHIVED,
    )
    place.status = PlaceStatus.ARCHIVED
    place.updated_at = now
    await quiet_holds.withdraw(session, AiTarget.PLACE, place.id, now)
    await moderation_cases.close_cases_without_decision(session, AiTarget.PLACE, place.id, now)
    await areas.refresh_area(session, place.area_id, now)
    await session.commit()


async def add_photos(session: AsyncSession, user: User, place_id: int, photo_ids: list[int]) -> PlaceDetail:
    place = await place_queries.get_visible_place(session, place_id, user)
    await uploads.add_photos(session, user, place, photo_ids)
    return await place_details.build(session, place, user, utcnow())
