"""Areas: named locations with exact polygons that group the places inside them (SPEC §17)."""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import Row, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.clock import utcnow
from app.core.errors import ConflictError, FieldValidationError, ForbiddenError, NotFoundError
from app.domain import areas as area_rules
from app.domain import cover as cover_rules
from app.domain import geometry, levels
from app.domain import interests as interest_rules
from app.domain.areas import CountedPlace
from app.domain.enums import PUBLIC_STATUSES, AreaKind, IssueStage, Layer, UserLevel
from app.domain.geo import BBox
from app.domain.geometry import Territory
from app.domain.interests import InterestTarget, Profile, Topic
from app.models import Area, EventDetails, IssueDetails, Photo, Place, User
from app.schemas.area import AreaCard, AreaDetail, AreaInput, AreaUpdate, PersonalInterest, TerritoryInput
from app.schemas.place import CombinedRating, PhotoOut
from app.schemas.user import UserBrief
from app.services import (
    combined_ratings,
    content,
    covers,
    external_ratings,
    mappers,
    place_queries,
    text_credits,
)
from app.services.external_ratings import RatingRefresher
from app.services.interests import tagging as interest_tagging
from app.services.interests import tags as interest_tags

DEFAULT_LIMIT = 200
MAX_LIMIT = 500
_NOT_FOUND = "Локация не найдена."


@dataclass(frozen=True, slots=True)
class AreaFilters:
    bbox: BBox | None = None
    query: str | None = None
    kinds: tuple[AreaKind, ...] = ()
    object_id: str | None = None
    min_places: int = 0
    limit: int = DEFAULT_LIMIT


def can_create(user: User) -> bool:
    return user.is_staff or levels.level_rank(user.level) >= levels.level_rank(UserLevel.TRUSTED)


def can_edit(area: Area, viewer: User | None) -> bool:
    return viewer is not None and (viewer.is_staff or viewer.id == area.author_id)


def personal_interest(
    area: Area, profile: Profile | None, tags: dict[Topic, float]
) -> PersonalInterest | None:
    """SPEC §23.4: None without a profile; otherwise the interest moved towards the viewer."""
    if not profile:
        return None
    match = interest_rules.match(profile, tags)
    return PersonalInterest(
        value=interest_rules.personal_interest(area.interest, match),
        topics=interest_rules.reasons(profile, tags) if interest_rules.fits(match) else [],
    )


def _card_fields(
    area: Area, combined_rating: CombinedRating | None, personal: PersonalInterest | None
) -> dict[str, object]:
    return {
        "id": area.id,
        "title": area.title,
        "kind": area.kind,
        "geometry": area.geometry,
        "lat": area.lat,
        "lng": area.lng,
        "radius_m": area.radius_m,
        "cover_url": area.cover_url,
        "cover_credit": area.cover_credit,
        "places_count": area.places_count,
        "interest": area.interest,
        "rating_avg": area.rating_avg,
        "combined_rating": combined_rating,
        "highlights": area.highlights,
        "events_upcoming": area.events_upcoming,
        "issues_open": area.issues_open,
        "external": mappers.external_source(area),
        "personal_interest": personal,
    }


def _covers_point(lat: float, lng: float) -> tuple[object, ...]:
    """Bounding-box pre-filter for "which areas may contain this point"."""
    return (Area.min_lat <= lat, Area.max_lat >= lat, Area.min_lng <= lng, Area.max_lng >= lng)


async def containing_area(session: AsyncSession, lat: float, lng: float) -> Area | None:
    """The area a point belongs to: the smallest territory that contains it."""
    candidates = list(await session.scalars(select(Area).where(*_covers_point(lat, lng))))
    area_id = geometry.smallest_containing(
        ((area.id, area.geometry, area.area_m2) for area in candidates), lat, lng
    )
    return next((area for area in candidates if area.id == area_id), None)


async def get_area(session: AsyncSession, area_id: int) -> Area:
    area = await session.scalar(select(Area).where(Area.id == area_id).options(joinedload(Area.author)))
    if area is None:
        raise NotFoundError(_NOT_FOUND)
    return area


async def resolve_explicit(session: AsyncSession, area_id: int | None) -> Area | None:
    """The area an author picked by hand; `None` means "belongs to no location"."""
    if area_id is None:
        return None
    area = await session.get(Area, area_id)
    if area is None:
        raise FieldValidationError("area_id", "Локация не найдена.")
    return area


def _is_upcoming(row: Row[Any], now: datetime) -> bool:
    return row.ends_at is not None and row.ends_at >= now and not row.is_cancelled


def _summarize(
    area: Area,
    members: Sequence[Row[Any]],
    own_photo: Photo | None,
    cover_scores: dict[str, float],
    now: datetime,
) -> None:
    """Denormalised summary of an area from its public places. The cover is the best preview
    among the covers of its best places (SPEC §25) and falls back to the area's own (external)
    photo when no place inside has one."""
    counted = [row for row in members if row.layer in area_rules.COUNTED_LAYERS]
    summary = [CountedPlace(row.category_id, row.status, row.rating_avg) for row in counted]
    events_upcoming = sum(1 for row in members if _is_upcoming(row, now))
    best_first = sorted(counted, key=lambda row: (-row.trust_score, -(row.rating_avg or 0), row.id))
    with_cover = [row for row in best_first if row.cover_url][: cover_rules.COVER_CANDIDATES]
    cover = max(
        with_cover,
        key=lambda row: cover_scores.get(row.cover_url, cover_rules.UNKNOWN_COVER),
        default=None,
    )
    area.places_count = len(counted)
    area.events_upcoming = events_upcoming
    area.issues_open = sum(
        1 for row in members if row.stage is not None and row.stage is not IssueStage.RESOLVED
    )
    area.interest = area_rules.interest(summary, events_upcoming)
    area.rating_avg = area_rules.mean_rating(summary)
    area.highlights = area_rules.highlights(summary)
    if cover is not None:
        area.cover_url, area.cover_credit = cover.cover_url, cover.cover_credit
    elif own_photo is not None:
        area.cover_url, area.cover_credit = own_photo.url, own_photo.credit
    else:
        area.cover_url, area.cover_credit = None, None


async def _refresh(session: AsyncSession, targets: Sequence[Area], now: datetime) -> None:
    """A fixed number of queries for any number of areas: their public places, their own photos
    and the cover scores of the places' covers."""
    if not targets:
        return
    await session.flush()
    area_ids = [area.id for area in targets]
    rows = await session.execute(
        select(
            Place.id,
            Place.area_id,
            Place.layer,
            Place.category_id,
            Place.status,
            Place.rating_avg,
            Place.trust_score,
            Place.cover_url,
            Place.cover_credit,
            EventDetails.ends_at,
            EventDetails.is_cancelled,
            IssueDetails.stage,
        )
        .outerjoin(EventDetails, EventDetails.place_id == Place.id)
        .outerjoin(IssueDetails, IssueDetails.place_id == Place.id)
        .where(Place.area_id.in_(area_ids), Place.status.in_(PUBLIC_STATUSES))
    )
    members: dict[int, list[Row[Any]]] = defaultdict(list)
    for row in rows:
        members[row.area_id].append(row)
    first_photos: dict[int, Photo] = {}
    for photo in await session.scalars(
        select(Photo).where(Photo.area_id.in_(area_ids)).order_by(Photo.position, Photo.id)
    ):
        first_photos.setdefault(photo.area_id, photo)
    cover_scores = await covers.scores_by_url(
        session, {row.cover_url for rows_of_area in members.values() for row in rows_of_area if row.cover_url}
    )
    for area in targets:
        _summarize(area, members[area.id], first_photos.get(area.id), cover_scores, now)


async def refresh_area(session: AsyncSession, area_id: int | None, now: datetime) -> None:
    """Recompute the denormalised summary of an area from the public places inside it."""
    area = await session.get(Area, area_id) if area_id is not None else None
    if area is not None:
        await _refresh(session, [area], now)


async def refresh_all(session: AsyncSession, now: datetime) -> None:
    """Upcoming-event counters drift with time; called at startup and after imports."""
    await _refresh(session, list(await session.scalars(select(Area))), now)


async def reattach_places(session: AsyncSession, boxes: list[BBox], area_id: int, now: datetime) -> None:
    """Re-run automatic membership for the places an area change may affect.

    Places whose author chose the area (or "none") by hand keep their choice.
    """
    in_boxes = [
        Place.lat.between(box.min_lat, box.max_lat) & Place.lng.between(box.min_lng, box.max_lng)
        for box in boxes
    ]
    places = await session.scalars(
        select(Place).where(Place.area_pinned.is_(False), or_(Place.area_id == area_id, *in_boxes))
    )
    affected = {area_id}
    for place in places:
        area = await containing_area(session, place.lat, place.lng)
        new_area_id = area.id if area else None
        if new_area_id != place.area_id:
            affected.update(filter(None, (place.area_id, new_area_id)))
            place.area_id = new_area_id
    await session.flush()
    for affected_id in affected:
        await refresh_area(session, affected_id, now)


def build_territory(payload: TerritoryInput) -> Territory:
    """An exact outline when given, else the circle fallback stored as a polygon."""
    if payload.geometry is None:
        return geometry.circle_territory(payload.lat, payload.lng, payload.radius_m)
    try:
        return geometry.parse_territory(payload.geometry)
    except geometry.InvalidGeometryError as error:
        raise FieldValidationError("geometry", str(error)) from error


def apply_territory(area: Area, territory: Territory) -> None:
    area.geometry = territory.geojson
    area.lat, area.lng = territory.label_lat, territory.label_lng
    area.radius_m = territory.radius_m
    area.area_m2 = territory.area_m2
    area.min_lat, area.max_lat = territory.bbox.min_lat, territory.bbox.max_lat
    area.min_lng, area.max_lng = territory.bbox.min_lng, territory.bbox.max_lng


def _bbox(area: Area) -> BBox:
    return BBox(area.min_lng, area.min_lat, area.max_lng, area.max_lat)


async def find_duplicate(
    session: AsyncSession, territory: Territory, object_id: str | None, *, except_id: int | None = None
) -> Area | None:
    """An existing area for the same 2GIS object or with a territory that largely overlaps."""
    box = territory.bbox
    overlapping = select(Area).where(
        Area.min_lat <= box.max_lat,
        Area.max_lat >= box.min_lat,
        Area.min_lng <= box.max_lng,
        Area.max_lng >= box.min_lng,
    )
    candidates = list(await session.scalars(overlapping))
    if object_id:
        candidates += list(await session.scalars(select(Area).where(Area.object_id == object_id)))
    for area in candidates:
        if area.id == except_id:
            continue
        share = geometry.overlap_share(territory.geojson, area.geometry)
        is_same_object = object_id is not None and area.object_id == object_id
        if is_same_object or area_rules.is_duplicate(share, territory.area_m2, area.area_m2):
            return area
    return None


async def _ensure_unique(
    session: AsyncSession, territory: Territory, object_id: str | None, *, except_id: int | None = None
) -> None:
    """409 for the same 2GIS object or a territory that largely overlaps an existing one."""
    duplicate = await find_duplicate(session, territory, object_id, except_id=except_id)
    if duplicate is not None:
        raise ConflictError(f"Такая локация уже есть на карте: «{duplicate.title}».")


def build_search_text(title: str, description: str) -> str:
    return f"{title}\n{description}".casefold()


def build_area(author: User | None, payload: AreaInput, territory: Territory, now: datetime) -> Area:
    """A new area with its territory; nothing is written yet."""
    area = Area(
        title=payload.title,
        search_text=build_search_text(payload.title, payload.description),
        kind=payload.kind,
        description=payload.description,
        object_id=payload.object_id,
        author=author,
        created_at=now,
    )
    apply_territory(area, territory)
    return area


async def insert_area(
    session: AsyncSession,
    author: User | None,
    payload: AreaInput,
    territory: Territory,
    now: datetime,
) -> Area:
    """Persist an area and attach the places inside it."""
    area = build_area(author, payload, territory, now)
    session.add(area)
    await session.flush()
    await reattach_places(session, [territory.bbox], area.id, now)
    await interest_tagging.tag_areas(session, [area.id], now)
    return area


async def list_areas(
    session: AsyncSession, filters: AreaFilters, profile: Profile | None = None
) -> list[AreaCard]:
    """One query for the areas: everything a card needs is denormalised on the area."""
    statement = select(Area)
    if filters.bbox is not None:
        statement = statement.where(
            Area.min_lat <= filters.bbox.max_lat,
            Area.max_lat >= filters.bbox.min_lat,
            Area.min_lng <= filters.bbox.max_lng,
            Area.max_lng >= filters.bbox.min_lng,
        )
    if filters.query:
        statement = statement.where(Area.search_text.contains(filters.query.casefold(), autoescape=True))
    if filters.kinds:
        statement = statement.where(Area.kind.in_(filters.kinds))
    if filters.object_id is not None:
        statement = statement.where(Area.object_id == filters.object_id)
    if filters.min_places:
        statement = statement.where(Area.places_count >= filters.min_places)
    rows = list(await session.scalars(statement.order_by(Area.interest.desc(), Area.id).limit(filters.limit)))
    return await area_cards(session, rows, profile)


async def area_cards(session: AsyncSession, rows: Sequence[Area], profile: Profile | None) -> list[AreaCard]:
    """Cards for a page of areas: blends and, with a profile, the personal interest in two queries."""
    blends = await combined_ratings.for_areas(session, rows)
    tags = (
        await interest_tags.for_targets(
            session, InterestTarget.AREA, [area.id for area in rows], profile.keys()
        )
        if profile
        else {}
    )
    return [
        AreaCard(
            **_card_fields(area, blends.get(area.id), personal_interest(area, profile, tags.get(area.id, {})))
        )
        for area in rows
    ]


async def _area_photos(session: AsyncSession, area_id: int) -> list[Photo]:
    """Freely licensed photos of the territory itself (SPEC §19)."""
    return list(
        await session.scalars(
            select(Photo).where(Photo.area_id == area_id).order_by(Photo.position, Photo.id)
        )
    )


async def _build_detail(
    session: AsyncSession, area: Area, viewer: User | None, now: datetime, profile: Profile | None = None
) -> AreaDetail:
    """Everything public inside, all layers, best first; finished events and resolved issues are left out.
    The viewer's own quietly held places are listed for them alone (SPEC §24.1)."""
    still_relevant = or_(
        Place.layer.not_in((Layer.EVENT, Layer.ISSUE)),
        (EventDetails.ends_at >= now) & EventDetails.is_cancelled.is_(False),
        IssueDetails.stage != IssueStage.RESOLVED,
    )
    places = await session.scalars(
        place_queries.card_query()
        .where(Place.area_id == area.id, place_queries.listed_clause(viewer), still_relevant)
        .order_by(Place.trust_score.desc(), Place.rating_avg.desc().nulls_last(), Place.id)
    )
    blends = await combined_ratings.for_areas(session, [area])
    tags = await interest_tags.for_target(session, InterestTarget.AREA, area.id)
    return AreaDetail(
        **_card_fields(area, blends.get(area.id), personal_interest(area, profile, tags)),
        description=area.description,
        description_credit=await text_credits.for_description(session, area),
        object_id=area.object_id,
        author=UserBrief.model_validate(area.author) if area.author else None,
        created_at=area.created_at,
        can_edit=can_edit(area, viewer),
        photos=[PhotoOut.model_validate(photo) for photo in await _area_photos(session, area.id)],
        external_rating=await external_ratings.cached(session, area.object_id),
        places=await place_queries.cards(session, list(places), now),
        topics=interest_rules.strongest(tags),
    )


async def get_detail(
    session: AsyncSession,
    area_id: int,
    viewer: User | None,
    ratings: RatingRefresher,
    profile: Profile | None = None,
) -> AreaDetail:
    """The card; opening it is what refreshes the linked 2GIS rating when due."""
    now = utcnow()
    area = await get_area(session, area_id)
    await ratings.refresh_if_due(session, area.object_id, now)
    return await _build_detail(session, area, viewer, now, profile)


async def create_area(session: AsyncSession, author: User, payload: AreaInput) -> AreaDetail:
    now = utcnow()
    if not can_create(author):
        raise ForbiddenError("Добавлять локации могут пользователи с уровня «Доверенный житель».")
    content.ensure_clean_text(f"{payload.title}\n{payload.description}")
    territory = build_territory(payload)
    await _ensure_unique(session, territory, payload.object_id)
    area = await insert_area(session, author, payload, territory, now)
    await session.commit()
    return await _build_detail(session, area, author, now)


async def update_area(session: AsyncSession, actor: User, area_id: int, payload: AreaUpdate) -> AreaDetail:
    now = utcnow()
    area = await get_area(session, area_id)
    if not can_edit(area, actor):
        raise ForbiddenError("Изменять локацию может её автор или модератор.")
    if payload.title is not None:
        area.title = payload.title
    if payload.kind is not None:
        area.kind = payload.kind
    if payload.description is not None:
        area.description = payload.description
    if "object_id" in payload.model_fields_set:
        area.object_id = payload.object_id
    content.ensure_clean_text(f"{area.title}\n{area.description}")
    area.search_text = build_search_text(area.title, area.description)
    if payload.has_territory:
        territory = build_territory(payload)
        await _ensure_unique(session, territory, area.object_id, except_id=area.id)
        previous_box = _bbox(area)
        apply_territory(area, territory)
        await reattach_places(session, [previous_box, territory.bbox], area.id, now)
    await interest_tagging.tag_areas(session, [area.id], now)
    await session.commit()
    return await _build_detail(session, area, actor, now)


async def delete_area(session: AsyncSession, area_id: int) -> None:
    """Places are detached, not deleted; they may fall into another area that contains them."""
    now = utcnow()
    area = await get_area(session, area_id)
    box = _bbox(area)
    await session.execute(
        update(Place).where(Place.area_id == area.id).values(area_id=None, area_pinned=False)
    )
    await session.delete(area)
    await session.flush()
    for place in await session.scalars(
        select(Place).where(
            Place.area_id.is_(None),
            Place.area_pinned.is_(False),
            Place.lat.between(box.min_lat, box.max_lat),
            Place.lng.between(box.min_lng, box.max_lng),
        )
    ):
        parent = await containing_area(session, place.lat, place.lng)
        if parent is not None:
            place.area_id = parent.id
    await session.flush()
    await refresh_all(session, now)
    await session.commit()
