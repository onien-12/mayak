"""Adding what free sources know to the places and areas we already have (SPEC §19, §21).

Shared by the Wikivoyage importer and the Wikimedia job: snapshot keys → database objects,
descriptions with their licence notice, and links from a source's entries to our objects.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import free_text
from app.domain.enums import ExternalSourceId
from app.models import Area, ExternalLink, Place, TextCredit
from app.services import areas, places, text_credits


@dataclass(frozen=True, slots=True)
class Credit:
    """«Текст: <label>, <license>» with a link to the source text."""

    label: str
    license: str
    url: str


@dataclass(slots=True)
class Keyed:
    """Places and areas by the keys enrichment snapshots use: `external_id` of imported objects,
    the `ref` of linked source entries, `seed:<key>` for the demo data."""

    places: dict[str, Place] = field(default_factory=dict)
    areas: dict[str, Area] = field(default_factory=dict)

    def merge(self, places_by_key: Mapping[str, Place], areas_by_key: Mapping[str, Area]) -> None:
        self.places.update(places_by_key)
        self.areas.update(areas_by_key)


async def keyed_objects(session: AsyncSession) -> Keyed:
    keyed = Keyed()
    keyed.places.update(
        (place.external_id, place)
        for place in await session.scalars(select(Place).where(Place.external_id.is_not(None)))
        if place.external_id
    )
    keyed.areas.update(
        (area.external_id, area)
        for area in await session.scalars(select(Area).where(Area.external_id.is_not(None)))
        if area.external_id
    )
    for row in await session.scalars(select(ExternalLink)):
        if row.place_id is not None and (place := await session.get(Place, row.place_id)) is not None:
            keyed.places[row.ref] = place
        if row.area_id is not None and (area := await session.get(Area, row.area_id)) is not None:
            keyed.areas[row.ref] = area
    return keyed


async def link(
    session: AsyncSession, ref: str, place: Place | None, area: Area | None, now: datetime
) -> ExternalLink:
    """Record (or update) which of our objects the source entry `ref` describes."""
    row = await session.scalar(select(ExternalLink).where(ExternalLink.ref == ref))
    if row is None:
        row = ExternalLink(ref=ref, created_at=now)
        session.add(row)
    row.place_id = place.id if place is not None else None
    row.area_id = area.id if area is not None else None
    return row


def _written_by_import(target: Place | Area) -> bool:
    return (
        isinstance(target, Place)
        and target.external_source is ExternalSourceId.OSM
        and not target.locally_edited
    )


def _set_description(target: Place | Area, text: str, now: datetime) -> None:
    target.description = text
    if isinstance(target, Place):
        target.search_text = places.build_search_text(target.title, text, target.address, target.tags)
        target.updated_at = now
    else:
        target.search_text = areas.build_search_text(target.title, text)


async def describe(
    session: AsyncSession,
    target: Place | Area,
    text: str,
    credit: Credit,
    now: datetime,
    *,
    replaces_imports: bool,
) -> bool:
    """Fill the description from a free source when the rules allow it; True when filled."""
    if not text or not free_text.may_fill_description(
        target.description,
        credited=await text_credits.credit_of(session, target) is not None,
        written_by_import=_written_by_import(target),
        replaces_imports=replaces_imports,
    ):
        return False
    _set_description(target, text, now)
    record_credit(session, target, credit, now)
    return True


def record_credit(session: AsyncSession, target: Place | Area, credit: Credit, now: datetime) -> None:
    owner = {"place_id": target.id} if isinstance(target, Place) else {"area_id": target.id}
    session.add(
        TextCredit(**owner, label=credit.label, license=credit.license, url=credit.url, created_at=now)
    )
