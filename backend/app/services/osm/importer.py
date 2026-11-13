"""Imports the OpenStreetMap snapshot (SPEC §18): territories become areas, objects become
`preliminary` places of the system author «OpenStreetMap».

Idempotent by `external_id = osm:<type>/<id>`. Community content always wins: a new object is
skipped when a non-OSM place of the same category stands within 40 m, places the community
hid or archived are never brought back, places a moderator edited are never overwritten, and a
description filled from a free source (it carries a text credit) is kept.
Built for thousands of objects: memberships and area summaries are computed in bulk.
"""

import logging
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime

from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import attributes as attribute_rules
from app.domain import content_check, geo, geometry, levels, trust
from app.domain.enums import PUBLIC_STATUSES, ExternalSourceId, HistoryKind, PlaceStatus, VoteKind
from app.domain.geometry import TerritoryIndex
from app.models import Area, Category, Place, TextCredit, User, Vote
from app.schemas.area import AreaInput
from app.schemas.place import PlaceInput
from app.services import areas, history, places
from app.services.imports import record_run, system_author
from app.services.interests import tagging as interest_tagging
from app.services.osm.elements import OsmElement
from app.services.osm.normaliser import AreaDraft, PlaceDraft, normalise
from app.services.places import ExternalRef

logger = logging.getLogger(__name__)

SOURCE = ExternalSourceId.OSM
DEDUP_RADIUS_M = 40.0
_GONE_MESSAGE = "Объект удалён из OpenStreetMap"


@dataclass(slots=True)
class OsmReport:
    areas_created: int = 0
    areas_duplicates: int = 0
    areas_invalid: int = 0
    places_created: int = 0
    places_updated: int = 0
    places_duplicates: int = 0
    places_invalid: int = 0
    kept_local_edits: int = 0
    kept_closed: int = 0
    archived_gone: int = 0
    created_by_category: dict[str, int] = field(default_factory=lambda: defaultdict(int))

    def summary(self) -> dict[str, int]:
        return {
            "areas_created": self.areas_created,
            "areas_duplicates": self.areas_duplicates,
            "areas_invalid": self.areas_invalid,
            "places_created": self.places_created,
            "places_updated": self.places_updated,
            "places_duplicates": self.places_duplicates,
            "places_invalid": self.places_invalid,
            "kept_local_edits": self.kept_local_edits,
            "kept_closed": self.kept_closed,
            "archived_gone": self.archived_gone,
        }


async def _import_areas(
    session: AsyncSession, author: User, drafts: Sequence[AreaDraft], report: OsmReport, now: datetime
) -> None:
    """New territories only, largest first; an existing (seeded or user) area always wins."""
    known = set(await session.scalars(select(Area.external_id).where(Area.external_source == SOURCE)))
    candidates: list[tuple[AreaDraft, geometry.Territory]] = []
    for draft in drafts:
        if draft.external_id in known:
            continue
        try:
            candidates.append((draft, geometry.parse_territory(draft.outline)))
        except geometry.InvalidGeometryError:
            report.areas_invalid += 1
    for draft, territory in sorted(candidates, key=lambda item: -item[1].area_m2):
        if await areas.find_duplicate(session, territory, None) is not None:
            report.areas_duplicates += 1
            continue
        try:
            payload = AreaInput(title=draft.title, kind=draft.kind, geometry=draft.outline)
        except ValidationError:
            report.areas_invalid += 1
            continue
        area = areas.build_area(author, payload, territory, now)
        area.external_source, area.external_id, area.external_url = SOURCE, draft.external_id, draft.url
        session.add(area)
        await session.flush()
        report.areas_created += 1


def _payload(draft: PlaceDraft, category: Category) -> PlaceInput:
    return PlaceInput(
        layer=category.layer,
        category_id=category.id,
        title=draft.title,
        description=draft.description,
        lat=draft.lat,
        lng=draft.lng,
        address=draft.address,
    )


def _attributes(draft: PlaceDraft, category: Category) -> dict[str, attribute_rules.AttributeValue]:
    try:
        return attribute_rules.coerce_attributes(category.fields, draft.attributes)
    except attribute_rules.InvalidAttributeError:
        return {}


class _CommunityPlaces:
    """Positions of every non-OSM place by category, for the 40 m duplicate rule."""

    def __init__(self, rows: Sequence[tuple[int, float, float]]) -> None:
        self._by_category: dict[int, list[tuple[float, float]]] = defaultdict(list)
        for category_id, lat, lng in rows:
            self._by_category[category_id].append((lat, lng))

    def has_near(self, category_id: int, lat: float, lng: float) -> bool:
        return any(
            geo.haversine_m(lat, lng, other_lat, other_lng) <= DEDUP_RADIUS_M
            for other_lat, other_lng in self._by_category[category_id]
        )


def _refresh(
    place: Place,
    category: Category,
    payload: PlaceInput,
    attributes: dict[str, attribute_rules.AttributeValue],
    now: datetime,
    *,
    keep_description: bool,
) -> bool:
    """Bring an untouched OSM place in line with the source; True when anything changed."""
    fresh = {
        "title": payload.title,
        "description": place.description if keep_description else payload.description,
        "lat": payload.lat,
        "lng": payload.lng,
        "address": payload.address,
        "attributes": attributes,
    }
    if place.category_id == category.id and all(getattr(place, key) == value for key, value in fresh.items()):
        return False
    place.category = category
    for key, value in fresh.items():
        setattr(place, key, value)
    place.search_text = places.build_search_text(place.title, place.description, place.address, place.tags)
    place.title_key = content_check.normalize_title(place.title)
    place.updated_at = now
    return True


async def _import_places(
    session: AsyncSession,
    author: User,
    drafts: Sequence[PlaceDraft],
    index: TerritoryIndex,
    report: OsmReport,
    now: datetime,
) -> set[str]:
    """Upsert places; returns the external ids present in the source."""
    categories = {category.slug: category for category in await session.scalars(select(Category))}
    imported = {
        place.external_id: place
        for place in await session.scalars(select(Place).where(Place.external_source == SOURCE))
    }
    community = _CommunityPlaces(
        list(
            await session.execute(
                select(Place.category_id, Place.lat, Place.lng).where(
                    or_(Place.external_source.is_(None), Place.external_source != SOURCE)
                )
            )
        )
    )
    areas_by_id = {area.id: area for area in await session.scalars(select(Area))}
    credited = set(await session.scalars(select(TextCredit.place_id).where(TextCredit.place_id.is_not(None))))
    status = trust.imported_status(SOURCE, levels.author_prior(author.level, author.role))
    created: list[Place] = []
    for draft in drafts:
        category = categories.get(draft.category)
        if category is None:
            report.places_invalid += 1
            continue
        try:
            payload = _payload(draft, category)
        except ValidationError:
            report.places_invalid += 1
            continue
        existing = imported.get(draft.external_id)
        if existing is not None:
            if existing.status in (PlaceStatus.HIDDEN, PlaceStatus.ARCHIVED):
                report.kept_closed += 1
            elif existing.locally_edited:
                report.kept_local_edits += 1
            elif _refresh(
                existing,
                category,
                payload,
                _attributes(draft, category),
                now,
                keep_description=existing.id in credited,
            ):
                report.places_updated += 1
            continue
        if community.has_near(category.id, draft.lat, draft.lng):
            report.places_duplicates += 1
            continue
        area_id = index.smallest_containing(draft.lat, draft.lng)
        created.append(
            places.build_place(
                author,
                category,
                payload,
                attributes=_attributes(draft, category),
                status=status,
                now=now,
                area=areas_by_id.get(area_id) if area_id is not None else None,
                external=ExternalRef(SOURCE, draft.external_id, draft.url),
            )
        )
        report.created_by_category[category.slug] += 1
    session.add_all(created)
    await session.flush()
    for place in created:
        places.record_creation(session, place, now)
    report.places_created = len(created)
    return {draft.external_id for draft in drafts}


async def _archive_gone(session: AsyncSession, present: set[str], report: OsmReport, now: datetime) -> None:
    """Objects deleted from OSM leave the map unless a moderator edited them or residents confirmed them."""
    confirmed = select(Vote.place_id).where(Vote.kind == VoteKind.PRESENT)
    gone = await session.scalars(
        select(Place).where(
            Place.external_source == SOURCE,
            Place.external_id.not_in(present),
            Place.status.in_(PUBLIC_STATUSES),
            Place.locally_edited.is_(False),
            Place.id.not_in(confirmed),
        )
    )
    for place in gone:
        history.record(
            session,
            place,
            HistoryKind.STATUS_CHANGED,
            _GONE_MESSAGE,
            now=now,
            old_status=place.status,
            new_status=PlaceStatus.ARCHIVED,
        )
        place.status = PlaceStatus.ARCHIVED
        place.updated_at = now
        report.archived_gone += 1


async def _reattach_all(session: AsyncSession, index: TerritoryIndex) -> None:
    """Automatic membership for every place the author did not pin, against all territories."""
    for place in await session.scalars(select(Place).where(Place.area_pinned.is_(False))):
        area_id = index.smallest_containing(place.lat, place.lng)
        if area_id != place.area_id:
            place.area_id = area_id
    await session.flush()


async def _territory_index(session: AsyncSession) -> TerritoryIndex:
    rows = await session.execute(select(Area.id, Area.geometry, Area.area_m2))
    return TerritoryIndex((row.id, row.geometry, row.area_m2) for row in rows)


async def apply_snapshot(session: AsyncSession, elements: Sequence[OsmElement], now: datetime) -> OsmReport:
    """Database phase. Commits nothing itself."""
    report = OsmReport()
    drafts = [draft for draft in map(normalise, elements) if draft is not None]
    author = await system_author(session, SOURCE, now)
    await _import_areas(
        session, author, [draft for draft in drafts if isinstance(draft, AreaDraft)], report, now
    )
    index = await _territory_index(session)
    present = await _import_places(
        session, author, [draft for draft in drafts if isinstance(draft, PlaceDraft)], index, report, now
    )
    await _archive_gone(session, present, report, now)
    await _reattach_all(session, index)
    await areas.refresh_all(session, now)
    return report


async def run_import(session: AsyncSession, elements: Sequence[OsmElement], now: datetime) -> OsmReport:
    report = await apply_snapshot(session, elements, now)
    await interest_tagging.tag_stale(session, now)
    record_run(session, SOURCE, report.summary(), now)
    await session.commit()
    logger.info("OSM import: %s", report.summary())
    return report
