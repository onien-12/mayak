from datetime import datetime

from app.domain.enums import OutageResource
from app.schemas.common import ApiModel
from app.schemas.place import PlaceCard


class OutageTotals(ApiModel):
    outages: int
    buildings: int


class ResourceTotals(OutageTotals):
    resource: OutageResource


class OutageSummary(ApiModel):
    updated_at: datetime | None
    source_url: str
    totals: OutageTotals
    by_resource: list[ResourceTotals]


class OutageBuildingPoint(ApiModel):
    address: str
    lat: float
    lng: float
    resources: list[OutageResource]
    place_ids: list[int]


class OutageAddressMatch(ApiModel):
    address: str
    lat: float
    lng: float
    outages: list[PlaceCard]
