"""The demo data by key, and finding it again in any database (SPEC §10, §19).

Enrichment snapshots name the seed's own places `seed:<key>` and its areas `seed-area:<key>`.
A seeded place is found by its exact title and coordinates, an area by its title — which works
on a fresh seed as well as on a long-running database where residents added much more.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Area, Place
from app.seed import areas as area_data
from app.seed import events, infrastructure, issues, scenarios, tourism
from app.seed.specs import SeedPlace
from app.services.enrichment import Keyed

ALL_PLACES: tuple[SeedPlace, ...] = (
    *infrastructure.PLACES,
    *tourism.PLACES,
    *events.PLACES,
    *issues.PLACES,
    *scenarios.PLACES,
)
COORDINATE_DIGITS = 6


def place_key(key: str) -> str:
    """Key of a seed place in enrichment snapshots (imported places use their `external_id`)."""
    return f"seed:{key}"


def area_key(key: str) -> str:
    return f"seed-area:{key}"


def _spot(title: str, lat: float, lng: float) -> tuple[str, float, float]:
    return title, round(lat, COORDINATE_DIGITS), round(lng, COORDINATE_DIGITS)


async def seed_objects(session: AsyncSession) -> Keyed:
    """The seed's places and areas present in the database, by their snapshot keys."""
    places = {
        _spot(place.title, place.lat, place.lng): place
        for place in await session.scalars(select(Place).where(Place.external_source.is_(None)))
    }
    areas = {
        area.title: area for area in await session.scalars(select(Area).where(Area.external_source.is_(None)))
    }
    keyed = Keyed()
    for spec in ALL_PLACES:
        place = places.get(_spot(spec.title, spec.lat, spec.lng))
        if place is not None:
            keyed.places[place_key(spec.key)] = place
    for area_spec in area_data.AREAS:
        area = areas.get(area_spec.title)
        if area is not None:
            keyed.areas[area_key(area_spec.key)] = area
    return keyed
