"""Address-level view of the imported utility outages (SPEC §15)."""

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.domain import addresses
from app.domain.enums import PUBLIC_STATUSES, ExternalSourceId, IssueStage, OutageResource
from app.domain.geo import BBox
from app.models import ImportRun, IssueDetails, OutageBuilding, Place
from app.schemas.outage import (
    OutageAddressMatch,
    OutageBuildingPoint,
    OutageSummary,
    OutageTotals,
    ResourceTotals,
)
from app.services import mappers, place_queries
from app.services.vlru.outages_importer import SOURCE_URL

MAX_BUILDINGS = 2000
MAX_ADDRESS_MATCHES = 10
_MATCH_SCAN_LIMIT = 500

_IS_CURRENT = (
    Place.external_source == ExternalSourceId.VL_RU_OFF,
    Place.status.in_(PUBLIC_STATUSES),
    IssueDetails.stage != IssueStage.RESOLVED,
)


def _current_buildings() -> Select[tuple[OutageBuilding, OutageResource]]:
    """Houses of the outages that are still going on, with the resource of each outage."""
    return (
        select(OutageBuilding, IssueDetails.outage_resource)
        .join(Place, Place.id == OutageBuilding.place_id)
        .join(IssueDetails, IssueDetails.place_id == Place.id)
        .where(*_IS_CURRENT)
        .order_by(OutageBuilding.address_key, OutageBuilding.place_id)
    )


async def summary(session: AsyncSession) -> OutageSummary:
    updated_at = await session.scalar(
        select(func.max(ImportRun.finished_at)).where(ImportRun.source == ExternalSourceId.VL_RU_OFF)
    )
    outages: dict[OutageResource, set[int]] = {resource: set() for resource in OutageResource}
    houses: dict[OutageResource, set[str]] = {resource: set() for resource in OutageResource}
    for building, resource in await session.execute(_current_buildings()):
        outages[resource].add(building.place_id)
        houses[resource].add(building.address_key)
    return OutageSummary(
        updated_at=updated_at,
        source_url=SOURCE_URL,
        totals=OutageTotals(
            outages=len(set().union(*outages.values())), buildings=len(set().union(*houses.values()))
        ),
        by_resource=[
            ResourceTotals(resource=resource, outages=len(outages[resource]), buildings=len(houses[resource]))
            for resource in OutageResource
        ],
    )


async def list_buildings(
    session: AsyncSession, bbox: BBox, resources: tuple[OutageResource, ...]
) -> list[OutageBuildingPoint]:
    """One point per house with all its current outages."""
    statement = _current_buildings().where(
        OutageBuilding.lat.between(bbox.min_lat, bbox.max_lat),
        OutageBuilding.lng.between(bbox.min_lng, bbox.max_lng),
    )
    if resources:
        statement = statement.where(IssueDetails.outage_resource.in_(resources))
    points: dict[str, OutageBuildingPoint] = {}
    for building, resource in await session.execute(statement):
        point = points.get(building.address_key)
        if point is None:
            if len(points) >= MAX_BUILDINGS:
                break
            point = points[building.address_key] = OutageBuildingPoint(
                address=building.address, lat=building.lat, lng=building.lng, resources=[], place_ids=[]
            )
        if resource not in point.resources:
            point.resources.append(resource)
        point.place_ids.append(building.place_id)
    return list(points.values())


async def check_address(session: AsyncSession, query: str) -> list[OutageAddressMatch]:
    """Houses whose normalised address contains every token of the query, with their outages."""
    tokens = addresses.address_tokens(query)
    if not tokens:
        return []
    statement = _current_buildings().where(
        *(OutageBuilding.address_key.like(addresses.token_pattern(token)) for token in tokens)
    )
    houses: dict[str, tuple[OutageBuilding, list[int]]] = {}
    for building, _ in await session.execute(statement.limit(_MATCH_SCAN_LIMIT)):
        if building.address_key not in houses and len(houses) >= MAX_ADDRESS_MATCHES:
            continue
        houses.setdefault(building.address_key, (building, []))[1].append(building.place_id)
    place_ids = {place_id for _, ids in houses.values() for place_id in ids}
    if not place_ids:
        return []
    now = utcnow()
    cards = {
        # Issues are never looked up in the catalogues, so they have no blend.
        place.id: mappers.place_card(place, now, combined_rating=None)
        for place in await session.scalars(place_queries.card_query().where(Place.id.in_(place_ids)))
    }
    return [
        OutageAddressMatch(
            address=building.address,
            lat=building.lat,
            lng=building.lng,
            outages=[cards[place_id] for place_id in ids],
        )
        for building, ids in houses.values()
    ]
