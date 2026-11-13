"""Author routes: custom waypoints with a path computed once at save time (SPEC §12)."""

from collections.abc import Collection
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from sqlalchemy import ColumnElement, and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core import viewer as request_viewer
from app.core.clock import utcnow
from app.core.errors import ConflictError, FieldValidationError, ForbiddenError, NotFoundError
from app.domain import content_check, gpx, hold_reasons, levels, routing
from app.domain.enums import (
    ACTIVE_HOLD_STATES,
    PUBLIC_ROUTE_STATUSES,
    AiTarget,
    HoldState,
    ModerationTrigger,
    PathMode,
    PathSource,
    PlaceStatus,
    ReputationReason,
    RouteDifficulty,
    RouteKind,
    RouteStatus,
    RouteVisibility,
    StopKind,
)
from app.models import Photo, Place, QuietHold, Review, Route, RouteSave, RouteStop, User
from app.schemas.place import PhotoOut, PlaceCard, ScreeningHold
from app.schemas.route import (
    RouteCard,
    RouteDetail,
    RouteInput,
    RoutePreviewIn,
    RoutePreviewOut,
    RouteStopOut,
    RouteUpdate,
    StopInput,
)
from app.services import (
    content,
    mappers,
    moderation_cases,
    place_queries,
    quiet_holds,
    reputation,
    uploads,
)
from app.services.route_planner import PlannedPath, RoutePlanner

DEFAULT_LIMIT = 50
MAX_LIMIT = 200
UNROUTABLE_STATUSES = (PlaceStatus.HIDDEN, PlaceStatus.ARCHIVED)

_ROUTE_NOT_FOUND = "Маршрут не найден."
_ROUTE_LOAD = (
    joinedload(Route.author),
    selectinload(Route.stops).options(
        selectinload(RouteStop.photos),
        joinedload(RouteStop.place).options(
            joinedload(Place.event), joinedload(Place.issue), joinedload(Place.area)
        ),
    ),
)


class RouteSort(StrEnum):
    NEW = "new"
    POPULAR = "popular"
    RATING = "rating"


@dataclass(frozen=True, slots=True)
class RouteFilters:
    kinds: tuple[RouteKind, ...] = ()
    difficulties: tuple[RouteDifficulty, ...] = ()
    query: str | None = None
    author_id: int | None = None
    sort: RouteSort = RouteSort.NEW
    limit: int = DEFAULT_LIMIT
    offset: int = 0


def build_search_text(title: str, description: str, tags: list[str]) -> str:
    return "\n".join([title, description, " ".join(tags)]).casefold()


def is_public(route: Route) -> bool:
    """Visible to everyone: a public route that is not waiting for or hidden by moderation."""
    return route.visibility is RouteVisibility.PUBLIC and route.status in PUBLIC_ROUTE_STATUSES


def listed_clause(viewer: User | None) -> ColumnElement[bool]:
    """Public routes, plus the viewer's own ones in a screening window, which look published to
    them (SPEC §24.1)."""
    public = and_(Route.visibility == RouteVisibility.PUBLIC, Route.status.in_(PUBLIC_ROUTE_STATUSES))
    if viewer is None:
        return public
    own = quiet_holds.own_shown_as(
        AiTarget.ROUTE, Route.id, Route.author_id, viewer.id, PUBLIC_ROUTE_STATUSES
    )
    return or_(public, own)


async def _hold_statuses(
    session: AsyncSession, routes: list[Route], states: Collection[HoldState]
) -> dict[int, RouteStatus]:
    pending = [route.id for route in routes if route.status is RouteStatus.PENDING]
    holds = await quiet_holds.active_by_target(session, AiTarget.ROUTE, pending, states)
    return {route_id: RouteStatus(hold.shown_status) for route_id, hold in holds.items() if hold.shown_status}


async def shown_statuses(session: AsyncSession, routes: list[Route]) -> dict[int, RouteStatus]:
    """What the authors of routes in a screening window see instead of `pending`; a held route
    is `pending` for its author too, and moderators see the truth."""
    if request_viewer.is_staff():
        return {}
    return await _hold_statuses(session, routes, (HoldState.SCREENING,))


async def intended_status(session: AsyncSession, route: Route) -> RouteStatus:
    """The status the route gets back when its screening window or hold ends well."""
    return (await _hold_statuses(session, [route], ACTIVE_HOLD_STATES)).get(route.id, route.status)


def can_view(route: Route, viewer: User | None) -> bool:
    return is_public(route) or can_edit(route, viewer)


def can_edit(route: Route, viewer: User | None) -> bool:
    return viewer is not None and (viewer.id == route.author_id or viewer.is_staff)


async def find_route(session: AsyncSession, route_id: int) -> Route | None:
    """The route with author, stops, stop photos and linked places loaded; None when deleted."""
    return await session.scalar(select(Route).where(Route.id == route_id).options(*_ROUTE_LOAD))


async def get_route(session: AsyncSession, route_id: int) -> Route:
    route = await find_route(session, route_id)
    if route is None:
        raise NotFoundError(_ROUTE_NOT_FOUND)
    return route


async def get_visible_route(session: AsyncSession, route_id: int, viewer: User | None) -> Route:
    route = await get_route(session, route_id)
    if not can_view(route, viewer):
        raise NotFoundError(_ROUTE_NOT_FOUND)
    return route


async def get_public_route(session: AsyncSession, route_id: int, viewer: User | None) -> Route:
    """For saving, reviewing and complaining, which only make sense on public routes. A route in
    its screening window answers its author as if it were published."""
    route = await get_visible_route(session, route_id, viewer)
    seen = route.status
    if viewer is not None and viewer.id == route.author_id:
        seen = (await shown_statuses(session, [route])).get(route.id, route.status)
    if route.visibility is not RouteVisibility.PUBLIC or seen not in PUBLIC_ROUTE_STATUSES:
        raise ConflictError("Действие доступно только для опубликованных маршрутов.")
    return route


async def _saved_ids(session: AsyncSession, viewer: User | None, route_ids: list[int]) -> set[int]:
    if viewer is None or not route_ids:
        return set()
    rows = await session.scalars(
        select(RouteSave.route_id).where(RouteSave.user_id == viewer.id, RouteSave.route_id.in_(route_ids))
    )
    return set(rows)


async def _cards(session: AsyncSession, routes: list[Route], viewer: User | None) -> list[RouteCard]:
    saved = await _saved_ids(session, viewer, [route.id for route in routes])
    shown = await shown_statuses(session, routes)
    return [
        mappers.route_card(route, is_saved=route.id in saved, status=shown.get(route.id)) for route in routes
    ]


async def list_routes(session: AsyncSession, viewer: User | None, filters: RouteFilters) -> list[RouteCard]:
    """Public routes (and the viewer's own ones in a screening window); personal and unpublished ones
    live in `list_my_routes`."""
    statement = select(Route).where(listed_clause(viewer)).options(*_ROUTE_LOAD)
    if filters.kinds:
        statement = statement.where(Route.kind.in_(filters.kinds))
    if filters.difficulties:
        statement = statement.where(Route.difficulty.in_(filters.difficulties))
    if filters.author_id is not None:
        statement = statement.where(Route.author_id == filters.author_id)
    if filters.query:
        statement = statement.where(Route.search_text.contains(filters.query.casefold(), autoescape=True))
    order = {
        RouteSort.NEW: (Route.created_at.desc(),),
        RouteSort.POPULAR: (Route.saves_count.desc(), Route.created_at.desc()),
        RouteSort.RATING: (Route.rating_avg.desc().nulls_last(), Route.rating_count.desc()),
    }[filters.sort]
    rows = await session.scalars(
        statement.order_by(*order, Route.id.desc()).limit(filters.limit).offset(filters.offset)
    )
    return await _cards(session, list(rows), viewer)


async def list_my_routes(session: AsyncSession, user: User) -> list[RouteCard]:
    rows = await session.scalars(
        select(Route)
        .where(Route.author_id == user.id)
        .options(*_ROUTE_LOAD)
        .order_by(Route.created_at.desc(), Route.id.desc())
    )
    return await _cards(session, list(rows), user)


async def list_saved_routes(session: AsyncSession, user: User) -> list[RouteCard]:
    rows = await session.scalars(
        select(Route)
        .join(RouteSave, RouteSave.route_id == Route.id)
        .where(RouteSave.user_id == user.id, listed_clause(user))
        .options(*_ROUTE_LOAD)
        .order_by(RouteSave.created_at.desc(), RouteSave.id.desc())
    )
    routes = list(rows)
    shown = await shown_statuses(session, routes)
    return [mappers.route_card(route, is_saved=True, status=shown.get(route.id)) for route in routes]


def _stop_out(
    stop: RouteStop, cards: dict[int, PlaceCard], viewer: User | None, held_photos: set[int]
) -> RouteStopOut:
    """A linked place appears only to those who may see it (a held place stays its author's)."""
    place = stop.place if stop.place is not None and place_queries.can_view(stop.place, viewer) else None
    return RouteStopOut(
        position=stop.position,
        kind=stop.kind,
        title=stop.title,
        lat=stop.lat,
        lng=stop.lng,
        note=stop.note,
        landmark=stop.landmark,
        stay_min=stop.stay_min,
        photos=[
            PhotoOut.model_validate(photo).model_copy(update={"on_review": photo.id in held_photos})
            for photo in stop.photos
        ],
        distance_from_prev_m=stop.distance_from_prev_m,
        place=cards.get(place.id) if place else None,
    )


async def build_detail(
    session: AsyncSession, route: Route, viewer: User | None, now: datetime
) -> RouteDetail:
    my_rating = None
    is_saved = False
    if viewer is not None:
        my_rating = await session.scalar(
            select(Review.rating).where(Review.route_id == route.id, Review.author_id == viewer.id)
        )
        is_saved = bool(await _saved_ids(session, viewer, [route.id]))
    linked = [stop.place for stop in route.stops if stop.place]
    cards = {card.id: card for card in await place_queries.cards(session, linked, now)}
    status = (await shown_statuses(session, [route])).get(route.id)
    is_author = viewer is not None and viewer.id == route.author_id
    held_photos = (
        await quiet_holds.held_ids(
            session, AiTarget.PHOTO, [photo.id for stop in route.stops for photo in stop.photos]
        )
        if is_author
        else set()
    )
    return RouteDetail(
        **mappers.route_card_fields(route, is_saved=is_saved, status=status),
        tips=route.tips,
        path_mode=route.path_mode,
        path_source=route.path_source,
        stops=[_stop_out(stop, cards, viewer, held_photos) for stop in route.stops],
        can_edit=can_edit(route, viewer),
        my_rating=my_rating,
        screening_hold=await _screening_hold(session, route) if can_edit(route, viewer) else None,
    )


async def _screening_hold(session: AsyncSession, route: Route) -> ScreeningHold | None:
    """Why the route did not pass the automatic check, while it waits for a moderator."""
    hold = await quiet_holds.find_active(session, AiTarget.ROUTE, route.id)
    if hold is None or hold.state is not HoldState.HELD:
        return None
    return ScreeningHold(reasons=hold_reasons.for_author(hold.reasons, AiTarget.ROUTE))


async def get_detail(session: AsyncSession, route_id: int, viewer: User | None) -> RouteDetail:
    route = await get_visible_route(session, route_id, viewer)
    return await build_detail(session, route, viewer, utcnow())


async def export_gpx(session: AsyncSession, route_id: int, viewer: User | None) -> str:
    """The author's texts are masked like in every other response (SPEC §24.5)."""
    route = await get_visible_route(session, route_id, viewer)

    def shown(text: str) -> str:
        return request_viewer.shown(text, route.author_id)

    waypoints = [
        gpx.GpxWaypoint(
            name=shown(stop.title),
            description=shown("\n".join(part for part in (stop.note, stop.landmark) if part)),
            lat=stop.lat,
            lng=stop.lng,
        )
        for stop in route.stops
        if stop.kind is not StopKind.VIA
    ]
    path = [(lng, lat) for lng, lat in route.path]
    return gpx.build_gpx(shown(route.title), shown(route.description), waypoints, path)


async def preview(planner: RoutePlanner, payload: RoutePreviewIn) -> RoutePreviewOut:
    points = [(point.lng, point.lat) for point in payload.points]
    planned = await planner.plan(payload.kind, points, payload.path_mode)
    return RoutePreviewOut(
        path=planned.path,
        distance_m=planned.distance_m,
        travel_min=planned.travel_min,
        legs_m=planned.legs_m,
        source=planned.source,
    )


async def _linked_places(session: AsyncSession, actor: User, stops: list[StopInput]) -> dict[int, Place]:
    place_ids = {stop.place_id for stop in stops if stop.place_id is not None}
    if not place_ids:
        return {}
    rows = await session.scalars(
        place_queries.card_query().where(Place.id.in_(place_ids), Place.status.not_in(UNROUTABLE_STATUSES))
    )
    places = {place.id: place for place in rows if place_queries.can_view(place, actor)}
    if place_ids - places.keys():
        raise FieldValidationError("stops", "Некоторые места маршрута не найдены или недоступны.")
    return places


async def _stop_photos(
    session: AsyncSession, actor: User, stops: list[StopInput], reusable_photo_ids: frozenset[int]
) -> dict[int, Photo]:
    """Photos named by the stops: the actor's free uploads or photos the route already had."""
    photo_ids = {photo_id for stop in stops for photo_id in stop.photo_ids}
    if not photo_ids:
        return {}
    rows = await session.scalars(select(Photo).where(Photo.id.in_(photo_ids)))
    photos = {
        photo.id: photo
        for photo in rows
        if photo.id in reusable_photo_ids or (photo.uploader_id == actor.id and uploads.is_free(photo))
    }
    if photo_ids - photos.keys():
        raise FieldValidationError("stops", "К точке можно прикрепить только свои загруженные фото.")
    return photos


async def resolve_stops(
    session: AsyncSession,
    actor: User,
    stops: list[StopInput],
    *,
    reusable_photo_ids: frozenset[int] = frozenset(),
) -> list[RouteStop]:
    """Turn the input into waypoints; a linked place supplies the title and coordinates by default."""
    places = await _linked_places(session, actor, stops)
    photos = await _stop_photos(session, actor, stops, reusable_photo_ids)
    resolved: list[RouteStop] = []
    for position, stop in enumerate(stops, start=1):
        place = places.get(stop.place_id) if stop.place_id is not None else None
        stop_photos = [photos[photo_id] for photo_id in dict.fromkeys(stop.photo_ids)]
        for index, photo in enumerate(stop_photos):
            photo.position = index
        resolved.append(
            RouteStop(
                position=position,
                kind=stop.kind,
                title=stop.title or (place.title if place else ""),
                lat=stop.lat if stop.lat is not None else place.lat,
                lng=stop.lng if stop.lng is not None else place.lng,
                note=stop.note,
                landmark=stop.landmark,
                stay_min=stop.stay_min,
                place=place,
                photos=stop_photos,
            )
        )
    return resolved


def stop_points(stops: list[RouteStop]) -> list[tuple[float, float]]:
    return [(stop.lng, stop.lat) for stop in stops]


def _apply_plan(route: Route, planned: PlannedPath) -> None:
    route.path = [list(point) for point in planned.path]
    route.path_source = planned.source
    route.distance_m = planned.distance_m
    route.travel_min = planned.travel_min
    route.duration_min = routing.total_duration_min(
        planned.travel_min, (stop.stay_min for stop in route.stops)
    )
    distances = routing.stop_distances(planned.legs_m, [stop.kind is StopKind.VIA for stop in route.stops])
    for stop, distance in zip(route.stops, distances, strict=True):
        stop.distance_from_prev_m = distance


@dataclass(slots=True)
class RecomputeReport:
    updated: int = 0
    unchanged: int = 0
    kept_ids: list[int] = field(default_factory=list)
    """Routes no provider could route: their stored path is kept rather than straightened."""

    def summary(self) -> str:
        return (
            f"пересчитано {self.updated}, без изменений {self.unchanged}, "
            f"оставлены как были (маршрутизатор не ответил) {len(self.kept_ids)} {self.kept_ids}"
        )


def _path_state(route: Route) -> tuple[object, ...]:
    return (
        route.path,
        route.path_source,
        route.travel_min,
        route.duration_min,
        [stop.distance_from_prev_m for stop in route.stops],
    )


async def recompute_paths(session: AsyncSession, planner: RoutePlanner) -> RecomputeReport:
    """Re-route every `roads` route with the configured providers, e.g. after switching providers.

    Routes are routed one after another (the providers are polite about their pace); running it
    again changes nothing. Moderation state and `updated_at` are left alone: the author's content
    is the same, only the line under it is redrawn.
    """
    report = RecomputeReport()
    rows = await session.scalars(
        select(Route)
        .where(Route.path_mode == PathMode.ROADS)
        .options(selectinload(Route.stops))
        .order_by(Route.id)
    )
    for route in rows.all():
        planned = await planner.plan(route.kind, stop_points(route.stops), route.path_mode)
        if planned.source is PathSource.STRAIGHT:
            report.kept_ids.append(route.id)
            continue
        before = _path_state(route)
        _apply_plan(route, planned)
        if _path_state(route) == before:
            report.unchanged += 1
        else:
            report.updated += 1
    await session.commit()
    return report


def _stop_texts(route: Route) -> list[str]:
    return [text for stop in route.stops for text in (stop.title, stop.note, stop.landmark)]


def _text_flags(route: Route) -> list[str]:
    return content_check.text_flags(route.title, route.description, route.tips, *_stop_texts(route))


def _gibberish_reasons(route: Route) -> list[str]:
    texts: dict[str, str | None] = {
        "название": route.title,
        "описание": route.description,
        "советы": route.tips,
    }
    stops = "\n".join(text for text in _stop_texts(route) if text)
    return content.gibberish_reasons({**texts, "точки маршрута": stops})


async def _unchecked_photos(session: AsyncSession, route: Route) -> list[Photo]:
    """Stop photos that were never screened (new ones, or a private plan going public)."""
    photos = [photo for stop in route.stops for photo in stop.photos if photo.credit is None]
    if not photos:
        return []
    checked = set(
        await session.scalars(
            select(QuietHold.target_id).where(
                QuietHold.target_type == AiTarget.PHOTO,
                QuietHold.target_id.in_([photo.id for photo in photos]),
            )
        )
    )
    return [photo for photo in photos if photo.id not in checked]


async def _open_window(session: AsyncSession, route: Route, author: User, now: datetime) -> None:
    """Hide the public route from everyone else until its texts and new photos pass (SPEC §24.1);
    its author keeps seeing the status it has now."""
    shown = await intended_status(session, route)
    await quiet_holds.open_window(
        session,
        AiTarget.ROUTE,
        route.id,
        author.id,
        now=now,
        shown_status=shown,
        heuristic_reasons=_gibberish_reasons(route),
    )
    route.status = RouteStatus.PENDING
    photos = await _unchecked_photos(session, route)
    await uploads.open_photo_windows(session, author, photos, now, parent=(AiTarget.ROUTE, route.id))


async def _publish(session: AsyncSession, route: Route, now: datetime, *, screen: bool) -> None:
    """Apply the publication rules to a public route: published and rewarded, or queued.
    With `screen` it is published to its author only until the screener releases it."""
    author = route.author
    flags = _text_flags(route)
    target = moderation_cases.route_target(route)
    if levels.publishes_directly(author.level, author.role) and not flags:
        route.status = RouteStatus.PUBLISHED
        await reputation.award(session, author, ReputationReason.ROUTE_PUBLISHED, now=now)
    else:
        route.status = RouteStatus.PENDING
        if not levels.publishes_directly(author.level, author.role):
            await moderation_cases.open_case(session, target, ModerationTrigger.PREMODERATION, now=now)
        if flags:
            await moderation_cases.open_case(
                session, target, ModerationTrigger.AUTO_TEXT, now=now, flags=flags
            )
    if screen:
        await _open_window(session, route, author, now)


async def publish_route(
    session: AsyncSession,
    author: User,
    payload: RouteInput,
    stops: list[RouteStop],
    planned: PlannedPath,
    now: datetime,
    *,
    screen: bool = False,
) -> Route:
    """Persist a new route. Private routes are personal plans: never screened or moderated.
    The seed never screens; the API screens everyone but moderators."""
    route = Route(
        author=author,
        title=payload.title,
        description=payload.description,
        tips=payload.tips or None,
        tags=payload.tags,
        search_text=build_search_text(payload.title, payload.description, payload.tags),
        kind=payload.kind,
        difficulty=payload.difficulty,
        visibility=payload.visibility,
        path_mode=payload.path_mode,
        status=RouteStatus.PUBLISHED,
        stops=stops,
        created_at=now,
        updated_at=now,
    )
    _apply_plan(route, planned)
    session.add(route)
    await session.flush()
    if route.visibility is RouteVisibility.PUBLIC:
        await _publish(session, route, now, screen=screen)
    return route


async def create_route(
    session: AsyncSession, planner: RoutePlanner, author: User, payload: RouteInput
) -> RouteDetail:
    now = utcnow()
    stops = await resolve_stops(session, author, payload.stops)
    planned = await planner.plan(payload.kind, stop_points(stops), payload.path_mode)
    route = await publish_route(session, author, payload, stops, planned, now, screen=not author.is_staff)
    await session.commit()
    return await build_detail(session, route, author, now)


async def _replace_stops(session: AsyncSession, route: Route, actor: User, stops: list[StopInput]) -> None:
    previous_photo_ids = frozenset(photo.id for stop in route.stops for photo in stop.photos)
    for stop in route.stops:
        stop.photos = []
    route.stops.clear()
    await session.flush()
    route.stops.extend(await resolve_stops(session, actor, stops, reusable_photo_ids=previous_photo_ids))


_TEXT_FIELDS = frozenset({"title", "description", "tips", "tags", "stops"})
"""Fields whose change opens a new screening window of a public route."""


def _apply_meta(route: Route, payload: RouteUpdate) -> None:
    provided = payload.model_fields_set
    if payload.title is not None:
        route.title = payload.title
    if payload.description is not None:
        route.description = payload.description
    if payload.tags is not None:
        route.tags = payload.tags
    if "tips" in provided:
        route.tips = payload.tips or None
    if "difficulty" in provided:
        route.difficulty = payload.difficulty
    route.search_text = build_search_text(route.title, route.description, route.tags)


async def _apply_visibility(
    session: AsyncSession, route: Route, actor: User, was_public: bool, texts_changed: bool, now: datetime
) -> None:
    """Re-run the publication rules after an edit, depending on where the route is now."""
    target = moderation_cases.route_target(route)
    screen = not actor.is_staff and actor.id == route.author_id
    if route.visibility is RouteVisibility.PRIVATE:
        if was_public:
            route.status = RouteStatus.PUBLISHED
            await quiet_holds.withdraw(session, AiTarget.ROUTE, route.id, now)
            await moderation_cases.close_cases_without_decision(session, AiTarget.ROUTE, route.id, now)
        return
    if not was_public:
        await _publish(session, route, now, screen=screen)
        return
    intended = await intended_status(session, route)
    flags = [] if actor.is_staff else _text_flags(route)
    if flags:
        route.status = RouteStatus.PENDING
        hold = await quiet_holds.find_active(session, AiTarget.ROUTE, route.id)
        if hold is not None:
            hold.shown_status = RouteStatus.PENDING
        await moderation_cases.open_case(session, target, ModerationTrigger.AUTO_TEXT, now=now, flags=flags)
    elif intended is RouteStatus.PENDING and actor.id == route.author_id:
        await moderation_cases.open_case(session, target, ModerationTrigger.PREMODERATION, now=now)
    if screen and texts_changed and route.status is not RouteStatus.HIDDEN:
        await _open_window(session, route, actor, now)
    open_case = await moderation_cases.find_open_case(session, AiTarget.ROUTE, route.id)
    if open_case is not None:
        open_case.target_title = route.title


async def update_route(
    session: AsyncSession, planner: RoutePlanner, actor: User, route_id: int, payload: RouteUpdate
) -> RouteDetail:
    now = utcnow()
    route = await get_visible_route(session, route_id, actor)
    if not can_edit(route, actor):
        raise ForbiddenError("Редактировать маршрут может только автор или модератор.")
    was_public = route.visibility is RouteVisibility.PUBLIC
    texts_changed = bool(_TEXT_FIELDS.intersection(payload.model_fields_set))
    _apply_meta(route, payload)
    needs_replan = False
    if payload.kind is not None and payload.kind is not route.kind:
        route.kind = payload.kind
        needs_replan = True
    if payload.path_mode is not None and payload.path_mode is not route.path_mode:
        route.path_mode = payload.path_mode
        needs_replan = True
    if payload.stops is not None:
        await _replace_stops(session, route, actor, payload.stops)
        needs_replan = True
    if needs_replan:
        _apply_plan(route, await planner.plan(route.kind, stop_points(route.stops), route.path_mode))
    if payload.visibility is not None:
        route.visibility = payload.visibility
    route.updated_at = now
    await _apply_visibility(session, route, actor, was_public, texts_changed, now)
    await session.commit()
    return await build_detail(session, route, actor, now)


async def delete_route(session: AsyncSession, actor: User, route_id: int) -> None:
    now = utcnow()
    route = await get_visible_route(session, route_id, actor)
    if not can_edit(route, actor):
        raise ForbiddenError("Удалить маршрут может только автор или модератор.")
    await quiet_holds.withdraw(session, AiTarget.ROUTE, route.id, now)
    await moderation_cases.close_cases_without_decision(session, AiTarget.ROUTE, route.id, now)
    await session.execute(delete(Review).where(Review.route_id == route.id))
    await session.execute(delete(RouteSave).where(RouteSave.route_id == route.id))
    for stop in route.stops:
        stop.photos = []
    await session.delete(route)
    await session.commit()


async def _save_row(session: AsyncSession, user: User, route: Route) -> RouteSave | None:
    return await session.scalar(
        select(RouteSave).where(RouteSave.user_id == user.id, RouteSave.route_id == route.id)
    )


async def save_route(session: AsyncSession, user: User, route_id: int) -> None:
    route = await get_public_route(session, route_id, user)
    if await _save_row(session, user, route) is None:
        session.add(RouteSave(user_id=user.id, route_id=route.id, created_at=utcnow()))
        route.saves_count += 1
        await session.commit()


async def unsave_route(session: AsyncSession, user: User, route_id: int) -> None:
    route = await get_visible_route(session, route_id, user)
    saved = await _save_row(session, user, route)
    if saved is not None:
        await session.delete(saved)
        route.saves_count = max(route.saves_count - 1, 0)
        await session.commit()
