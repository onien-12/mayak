"""Shared place lookups and the visibility rule used by every service that touches a place."""

from collections.abc import Collection, Sequence
from datetime import datetime
from enum import StrEnum

from sqlalchemy import ColumnElement, Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload

from app.core import viewer as request_viewer
from app.core.errors import NotFoundError
from app.domain.enums import ACTIVE_HOLD_STATES, PUBLIC_STATUSES, AiTarget, HoldState, PlaceStatus
from app.models import Place, User
from app.schemas.place import PlaceCard
from app.services import combined_ratings, covers, mappers, quiet_holds


class Origin(StrEnum):
    """Who the content came from: residents or an imported external source."""

    COMMUNITY = "community"
    EXTERNAL = "external"


RESTRICTED_STATUSES = (PlaceStatus.PENDING, PlaceStatus.HIDDEN)
"""Visible only to the author and moderators."""

_PLACE_NOT_FOUND = "Точка не найдена."
_FULL_LOAD = (
    joinedload(Place.category),
    joinedload(Place.author),
    joinedload(Place.event),
    joinedload(Place.issue),
    joinedload(Place.area),
)


def card_query() -> Select[tuple[Place]]:
    """Places joined with their event / issue extension and area, ready for `mappers.place_card`."""
    return (
        select(Place)
        .outerjoin(Place.event)
        .outerjoin(Place.issue)
        .outerjoin(Place.area)
        .options(contains_eager(Place.event), contains_eager(Place.issue), contains_eager(Place.area))
    )


def listed_clause(
    viewer: User | None, statuses: Collection[PlaceStatus] = PUBLIC_STATUSES
) -> ColumnElement[bool]:
    """Places a listing shows: those in `statuses`, plus the viewer's own places in a screening
    window that look to them as one of `statuses` (SPEC §24.1)."""
    public = Place.status.in_(statuses)
    if viewer is None:
        return public
    return or_(
        public, quiet_holds.own_shown_as(AiTarget.PLACE, Place.id, Place.author_id, viewer.id, statuses)
    )


async def _hold_statuses(
    session: AsyncSession, places: Sequence[Place], states: Collection[HoldState]
) -> dict[int, PlaceStatus]:
    pending = [place.id for place in places if place.status is PlaceStatus.PENDING]
    holds = await quiet_holds.active_by_target(session, AiTarget.PLACE, pending, states)
    return {place_id: PlaceStatus(hold.shown_status) for place_id, hold in holds.items() if hold.shown_status}


async def shown_statuses(session: AsyncSession, places: Sequence[Place]) -> dict[int, PlaceStatus]:
    """What the authors of places in a screening window see instead of `pending` (SPEC §24.1).
    A held place is `pending` for its author too."""
    return await _hold_statuses(session, places, (HoldState.SCREENING,))


async def shown_status(session: AsyncSession, place: Place) -> PlaceStatus:
    """The status the place's author sees."""
    return (await shown_statuses(session, [place])).get(place.id, place.status)


async def intended_status(session: AsyncSession, place: Place) -> PlaceStatus:
    """The status the place gets back when its screening window or hold ends well: what the
    publication rules gave it before the screening took it to `pending`."""
    return (await _hold_statuses(session, [place], ACTIVE_HOLD_STATES)).get(place.id, place.status)


async def cards(session: AsyncSession, places: Sequence[Place], now: datetime) -> list[PlaceCard]:
    """`mappers.place_card` for a page of places: blends and borrowed covers in one go, and the
    status the author of a place in its screening window sees; moderators get the real one."""
    blends = await combined_ratings.for_places(session, places)
    borrowed = await covers.borrowed_for_places(session, places)
    shown = {} if request_viewer.is_staff() else await shown_statuses(session, places)
    return [
        mappers.place_card(
            place,
            now,
            combined_rating=blends.get(place.id),
            status=shown.get(place.id),
            borrowed_cover=borrowed.get(place.id),
        )
        for place in places
    ]


def can_view(place: Place, viewer: User | None) -> bool:
    if place.status not in RESTRICTED_STATUSES:
        return True
    return viewer is not None and (viewer.id == place.author_id or viewer.is_staff)


async def get_place(session: AsyncSession, place_id: int) -> Place:
    """The place with category, author, event and issue loaded."""
    place = await session.scalar(select(Place).where(Place.id == place_id).options(*_FULL_LOAD))
    if place is None:
        raise NotFoundError(_PLACE_NOT_FOUND)
    return place


async def get_visible_place(session: AsyncSession, place_id: int, viewer: User | None) -> Place:
    place = await get_place(session, place_id)
    if not can_view(place, viewer):
        raise NotFoundError(_PLACE_NOT_FOUND)
    return place
