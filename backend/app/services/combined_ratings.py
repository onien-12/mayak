"""Blended ratings for place and area cards (SPEC §22): cached external data only, batched per page.

Served while the external reviews are enabled; the API binds that per request to the session
(`enable`), so every service that builds a card reads it from the session it already has.
"""

from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import combined_rating
from app.domain.areas import COUNTED_LAYERS
from app.domain.combined_rating import OWN_SOURCE, RatingPart
from app.domain.enums import PUBLIC_STATUSES
from app.models import Area, Place
from app.schemas.place import CombinedRating
from app.services.experimental.external_reviews import ratings

_ENABLED = "combined_ratings_enabled"


def enable(session: AsyncSession, enabled: bool) -> None:
    session.info[_ENABLED] = enabled


def enabled(session: AsyncSession) -> bool:
    """The external sources (SPEC §20) are served on this session: their ratings, and the covers
    borrowed from their photos (`covers`)."""
    return bool(session.info.get(_ENABLED, False))


def _own(rating: float | None, count: int | None) -> RatingPart | None:
    return None if rating is None else RatingPart(OWN_SOURCE, rating, count)


def _blend(own: RatingPart | None, external: list[RatingPart]) -> CombinedRating | None:
    blended = combined_rating.combine(own, external)
    return None if blended is None else CombinedRating.model_validate(blended)


async def for_places(session: AsyncSession, places: Sequence[Place]) -> dict[int, CombinedRating]:
    """Requires `place.area` loaded; places without a blend are left out."""
    if not places or not enabled(session):
        return {}
    external = await ratings.for_places(session, places)
    blends = {
        place.id: _blend(_own(place.rating_avg, place.rating_count), parts)
        for place in places
        if (parts := external.get(place.id))
    }
    return {identifier: blend for identifier, blend in blends.items() if blend is not None}


async def for_place(session: AsyncSession, place: Place) -> CombinedRating | None:
    return (await for_places(session, [place])).get(place.id)


async def _ratings_inside(session: AsyncSession, area_ids: Sequence[int]) -> dict[int, int]:
    """How many ratings stand behind each area's `rating_avg`: the places it averages."""
    rows = await session.execute(
        select(Place.area_id, func.sum(Place.rating_count))
        .where(
            Place.area_id.in_(area_ids),
            Place.status.in_(PUBLIC_STATUSES),
            Place.layer.in_(COUNTED_LAYERS),
            Place.rating_avg.is_not(None),
        )
        .group_by(Place.area_id)
    )
    return {area_id: int(count) for area_id, count in rows}


async def for_areas(session: AsyncSession, areas: Sequence[Area]) -> dict[int, CombinedRating]:
    if not areas or not enabled(session):
        return {}
    external = await ratings.for_areas(session, areas)
    rated = [area for area in areas if external.get(area.id)]
    counts = await _ratings_inside(session, [area.id for area in rated if area.rating_avg is not None])
    blends = {
        area.id: _blend(_own(area.rating_avg, counts.get(area.id)), external[area.id]) for area in rated
    }
    return {identifier: blend for identifier, blend in blends.items() if blend is not None}
