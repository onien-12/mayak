from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Request

from app.api.v1 import params
from app.core.deps import CurrentUser, OptionalUser, SessionDep
from app.core.rate_limit import limit_by_user
from app.domain import limits
from app.domain.enums import AiTarget
from app.schemas.common import Latitude, Longitude, UtcDatetime
from app.schemas.feedback import EventContribution
from app.schemas.place import EventJoinInput, PlaceCard, PlaceDetail
from app.schemas.user import UserBrief
from app.services import events
from app.services.ai_moderation.screener import AiScreener, get_ai_screener
from app.services.events import EventFilters, EventScope, EventSort, MeetupFilter
from app.services.place_queries import Origin

router = APIRouter(tags=["events"])

_note_limit = limit_by_user(
    "comments",
    limit=limits.COMMENTS_PER_HOUR,
    window=limits.HOUR,
    message="Слишком много комментариев за час. Попробуйте позже.",
)
"""What a participant brings is a comment: it shares the comments' hourly limit."""


def event_filters(
    scope: EventScope = EventScope.UPCOMING,
    starts_from: Annotated[UtcDatetime | None, Query(alias="from")] = None,
    ends_to: Annotated[UtcDatetime | None, Query(alias="to")] = None,
    categories: str | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    meetups: MeetupFilter | None = None,
    origin: Origin | None = None,
    free: bool = False,
    sort: EventSort = EventSort.START,
    lat: Latitude | None = None,
    lng: Longitude | None = None,
    radius_m: Annotated[float | None, Query(ge=100, le=100_000)] = None,
    limit: Annotated[int, Query(ge=1, le=events.MAX_LIMIT)] = events.DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> EventFilters:
    return EventFilters(
        scope=scope,
        starts_from=starts_from,
        ends_to=ends_to,
        category_ids=params.csv_ints(categories, "categories"),
        query=q.strip() if q else None,
        meetups=meetups,
        origin=origin,
        free_only=free,
        sort=sort,
        lat=lat,
        lng=lng,
        radius_m=radius_m,
        limit=limit,
        offset=offset,
    )


@router.get("/events")
async def list_events(
    filters: Annotated[EventFilters, Depends(event_filters)], viewer: OptionalUser, session: SessionDep
) -> list[PlaceCard]:
    return await events.list_events(session, filters, viewer)


@router.put("/places/{place_id}/event/participation")
async def join_event(
    place_id: int,
    user: CurrentUser,
    session: SessionDep,
    request: Request,
    screener: Annotated[AiScreener, Depends(get_ai_screener)],
    payload: Annotated[EventJoinInput | None, Body()] = None,
) -> PlaceDetail:
    note = payload.note if payload is not None else None
    if note is not None:
        await _note_limit(request, user)
    joined = await events.join(session, user, place_id, note)
    if joined.note_id is not None:
        await screener.submit(AiTarget.COMMENT, joined.note_id)
    return joined.detail


@router.delete("/places/{place_id}/event/participation")
async def leave_event(place_id: int, user: CurrentUser, session: SessionDep) -> PlaceDetail:
    return await events.leave(session, user, place_id)


@router.get("/places/{place_id}/event/participants")
async def list_participants(place_id: int, viewer: OptionalUser, session: SessionDep) -> list[UserBrief]:
    return await events.list_participants(session, place_id, viewer)


@router.get("/places/{place_id}/event/contributions")
async def list_contributions(
    place_id: int, viewer: OptionalUser, session: SessionDep
) -> list[EventContribution]:
    return await events.list_contributions(session, place_id, viewer)
