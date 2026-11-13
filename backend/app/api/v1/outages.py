from typing import Annotated

from fastapi import APIRouter, Query

from app.api.v1 import params
from app.core.deps import SessionDep
from app.domain.enums import OutageResource
from app.schemas.outage import OutageAddressMatch, OutageBuildingPoint, OutageSummary
from app.services import outages

router = APIRouter(prefix="/outages", tags=["outages"])


@router.get("/summary")
async def get_summary(session: SessionDep) -> OutageSummary:
    return await outages.summary(session)


@router.get("/buildings")
async def list_buildings(
    session: SessionDep, bbox: str, resource: str | None = None
) -> list[OutageBuildingPoint]:
    resources = params.csv_enums(resource, OutageResource, "resource")
    return await outages.list_buildings(session, params.bbox(bbox), resources)


@router.get("/check")
async def check_address(
    session: SessionDep, q: Annotated[str, Query(max_length=200)] = ""
) -> list[OutageAddressMatch]:
    return await outages.check_address(session, q)
