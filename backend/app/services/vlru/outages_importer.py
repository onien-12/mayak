"""Imports current utility outages from VL.ru as verified `issue` places with their houses (SPEC §15)."""

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.domain import addresses, outages
from app.domain.enums import ExternalSourceId, IssueStage, Layer, OutageResource, PlaceStatus
from app.domain.outages import House
from app.models import Category, IssueDetails, OutageBuilding, Place, User
from app.schemas.place import IssueInput, PlaceInput
from app.services import areas, issues, places
from app.services.imports import record_run, system_author
from app.services.places import ExternalRef
from app.services.vlru import outages_parser
from app.services.vlru.client import BASE_URL, VlRuClient
from app.services.vlru.outages_parser import ListedOutage, OutageMap

logger = logging.getLogger(__name__)

MAP_PATH = "/off/summary/map"
BLACKOUTS_PATH = "/off/summary/blackouts"
SOURCE_URL = f"{BASE_URL}/off/"
UTILITIES_CATEGORY = "utilities"
_NOW_PARAMS = {"date": "now"}
_FALLBACK_DESCRIPTION = "Отключение по данным VL.ru."


@dataclass(frozen=True, slots=True)
class Outage:
    """One current outage with everything needed to put it on the map."""

    number: str
    resource: OutageResource
    description: str
    houses: tuple[House, ...]
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    initiator: str | None = None
    complaints_count: int = 0


@dataclass(frozen=True, slots=True)
class OutagesReport:
    outages: int
    houses: int
    created: int
    updated: int
    resolved: int
    without_schedule: tuple[str, ...]

    def summary(self) -> dict[str, int]:
        return {
            "outages": self.outages,
            "houses": self.houses,
            "created": self.created,
            "updated": self.updated,
            "resolved": self.resolved,
            "without_schedule": len(self.without_schedule),
        }


def external_id(number: str) -> str:
    return f"{ExternalSourceId.VL_RU_OFF.value}:{number}"


def outage_url(number: str) -> str:
    """A link for people; the importer itself never requests it (robots.txt)."""
    return f"{BASE_URL}/off/blackout/{number}.html"


def merge_sources(outage_map: OutageMap, listed: list[ListedOutage]) -> list[Outage]:
    """Combine the map (houses) with the list (schedule, initiator). Outages without houses
    cannot be placed and are dropped."""
    houses: dict[str, list[House]] = defaultdict(list)
    complaints: dict[str, int] = defaultdict(int)
    for building in outage_map.buildings:
        for number in building.blackout_numbers:
            houses[number].append(building.house)
            complaints[number] += building.complaints_count
    schedule = {item.number: item for item in listed}
    merged: list[Outage] = []
    for number, blackout in outage_map.blackouts.items():
        if not houses[number]:
            continue
        row = schedule.get(number)
        merged.append(
            Outage(
                number=number,
                resource=blackout.resource,
                description=blackout.description or (row.description if row else ""),
                houses=tuple(houses[number]),
                starts_at=row.starts_at if row else None,
                ends_at=row.ends_at if row else None,
                initiator=row.initiator if row else None,
                complaints_count=max(complaints[number], row.complaints_count if row else 0),
            )
        )
    return merged


async def fetch_outages(client: VlRuClient, now: datetime) -> list[Outage] | None:
    """Network phase. None when the map could not be read: then nothing may be resolved."""
    map_html = await client.get(MAP_PATH, _NOW_PARAMS)
    outage_map = outages_parser.parse_map(map_html) if map_html else None
    if outage_map is None:
        return None
    missing = set(OutageResource) - {blackout.resource for blackout in outage_map.blackouts.values()}
    for resource in sorted(missing):
        html = await client.get(MAP_PATH, {**_NOW_PARAMS, "resourceType": resource.value})
        extra = outages_parser.parse_map(html) if html else None
        if extra is not None:
            outage_map = OutageMap(
                {**extra.blackouts, **outage_map.blackouts},
                tuple(
                    {
                        building.house: building for building in (*extra.buildings, *outage_map.buildings)
                    }.values()
                ),
            )
    list_html = await client.get(BLACKOUTS_PATH, _NOW_PARAMS)
    listed = outages_parser.parse_blackouts(list_html, now) if list_html else []
    return merge_sources(outage_map, listed)


def _apply_lifecycle(issue: IssueDetails, outage: Outage) -> None:
    source, _ = outages.source_and_stage(outage.initiator)
    issue.source = source
    issue.responsible_org = outage.initiator
    issue.expected_fix_at = outage.ends_at
    issue.detected_at = outage.starts_at or issue.detected_at
    issue.severity = outages.severity_for(len(outage.houses))
    issue.outage_number = outage.number
    issue.outage_resource = outage.resource
    issue.outage_buildings_count = len(outage.houses)
    issue.outage_complaints_count = outage.complaints_count


async def _replace_buildings(session: AsyncSession, place: Place, houses: tuple[House, ...]) -> None:
    await session.execute(delete(OutageBuilding).where(OutageBuilding.place_id == place.id))
    session.add_all(
        OutageBuilding(
            place_id=place.id,
            address=house.address,
            address_key=addresses.address_key(house.address),
            lat=house.lat,
            lng=house.lng,
        )
        for house in houses
    )


def _place_input(category: Category, outage: Outage, now: datetime) -> PlaceInput:
    anchor = outages.anchor_house(outage.houses)
    return PlaceInput(
        layer=Layer.ISSUE,
        category_id=category.id,
        title=outages.outage_title(outage.resource, outage.houses),
        description=outage.description or _FALLBACK_DESCRIPTION,
        lat=anchor.lat,
        lng=anchor.lng,
        address=outages.street_summary(outage.houses, shown=3)[:200],
        issue=IssueInput(
            severity=outages.severity_for(len(outage.houses)),
            detected_at=outage.starts_at or now,
            radius_m=outages.affected_radius_m(anchor, outage.houses),
        ),
    )


async def _upsert(
    session: AsyncSession,
    author: User,
    category: Category,
    outage: Outage,
    existing: Place | None,
    now: datetime,
) -> Place:
    payload = _place_input(category, outage, now)
    _, stage = outages.source_and_stage(outage.initiator)
    if existing is None:
        place = await places.insert_place(
            session,
            author,
            category,
            payload,
            attributes={"service": outage.resource.value},
            status=PlaceStatus.VERIFIED,
            now=now,
            external=ExternalRef(
                ExternalSourceId.VL_RU_OFF, external_id(outage.number), outage_url(outage.number)
            ),
        )
        place.issue.stage = stage
    else:
        place = existing
        if not place.locally_edited:
            place.title, place.description, place.address = (
                payload.title,
                payload.description,
                payload.address,
            )
            place.lat, place.lng = payload.lat, payload.lng
            place.area = await areas.containing_area(session, place.lat, place.lng)
            place.search_text = places.build_search_text(
                place.title, place.description, place.address, place.tags
            )
            place.issue.radius_m = payload.issue.radius_m
        if place.issue.stage is not stage:
            await issues.set_stage(session, place, stage, now)
        place.updated_at = now
    _apply_lifecycle(place.issue, outage)
    await _replace_buildings(session, place, outage.houses)
    return place


async def apply_outages(session: AsyncSession, current: list[Outage], now: datetime) -> OutagesReport:
    """Database phase: upsert current outages, resolve the ones that left the source."""
    author = await system_author(session, ExternalSourceId.VL_RU_OFF, now)
    category = await session.scalar(select(Category).where(Category.slug == UTILITIES_CATEGORY))
    imported = {
        place.external_id: place
        for place in await session.scalars(
            select(Place)
            .where(Place.external_source == ExternalSourceId.VL_RU_OFF)
            .options(
                joinedload(Place.issue),
                joinedload(Place.author),
                joinedload(Place.category),
                joinedload(Place.area),
            )
        )
    }
    created = updated = resolved = 0
    for outage in current:
        existing = imported.pop(external_id(outage.number), None)
        await _upsert(session, author, category, outage, existing, now)
        created += existing is None
        updated += existing is not None
    for place in imported.values():
        if place.issue.stage is not IssueStage.RESOLVED:
            await issues.set_stage(session, place, IssueStage.RESOLVED, now)
            resolved += 1
    report = OutagesReport(
        outages=len(current),
        houses=len({house for outage in current for house in outage.houses}),
        created=created,
        updated=updated,
        resolved=resolved,
        without_schedule=tuple(outage.number for outage in current if outage.starts_at is None),
    )
    await areas.refresh_all(session, now)
    return report


async def run_import(session: AsyncSession, client: VlRuClient, now: datetime) -> OutagesReport | None:
    """Fetch first, then write in one short transaction. None when the source was unreadable."""
    current = await fetch_outages(client, now)
    if current is None:
        logger.warning("Outages import skipped: the map page could not be read")
        return None
    report = await apply_outages(session, current, now)
    record_run(session, ExternalSourceId.VL_RU_OFF, report.summary(), now)
    await session.commit()
    logger.info("Outages import: %s", report.summary())
    return report
