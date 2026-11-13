from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.v1 import params
from app.api.v1.interests import ViewerProfile
from app.core.deps import CurrentUser, OptionalUser, SessionDep, get_moderator
from app.core.errors import FieldValidationError, ForbiddenError
from app.core.rate_limit import limit_by_user
from app.domain import limits
from app.domain.enums import AreaKind
from app.schemas.area import AreaCard, AreaDetail, AreaGeometryCandidate, AreaInput, AreaUpdate
from app.schemas.common import Latitude, Longitude
from app.services import areas
from app.services.areas import AreaFilters
from app.services.external_ratings import RatingRefresher, get_rating_refresher
from app.services.geometry_lookup import GeometryLookup, get_geometry_lookup

router = APIRouter(prefix="/areas", tags=["areas"])

_lookup_limit = limit_by_user(
    "geometry-lookup",
    limit=limits.GEOMETRY_LOOKUPS_PER_HOUR,
    window=limits.HOUR,
    message="Слишком много запросов контура. Попробуйте позже или нарисуйте территорию вручную.",
)


def area_filters(
    bbox: str | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    kind: str | None = None,
    object_id: Annotated[str | None, Query(max_length=64)] = None,
    min_places: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=areas.MAX_LIMIT)] = areas.DEFAULT_LIMIT,
) -> AreaFilters:
    return AreaFilters(
        bbox=params.bbox(bbox),
        query=q.strip() if q else None,
        kinds=params.csv_enums(kind, AreaKind, "kind"),
        object_id=object_id,
        min_places=min_places,
        limit=limit,
    )


@router.get("")
async def list_areas(
    filters: Annotated[AreaFilters, Depends(area_filters)], interests: ViewerProfile, session: SessionDep
) -> list[AreaCard]:
    return await areas.list_areas(session, filters, interests)


@router.get("/geometry-lookup", dependencies=[Depends(_lookup_limit)])
async def lookup_geometry(
    user: CurrentUser,
    lookup: Annotated[GeometryLookup, Depends(get_geometry_lookup)],
    object_id: Annotated[str | None, Query(max_length=64)] = None,
    q: Annotated[str | None, Query(min_length=2, max_length=120)] = None,
    lat: Latitude | None = None,
    lng: Longitude | None = None,
) -> list[AreaGeometryCandidate]:
    if not areas.can_create(user):
        raise ForbiddenError("Поиск контуров доступен с уровня «Доверенный житель».")
    if (object_id is None) == (q is None):
        raise FieldValidationError("q", "Укажите ровно один параметр: object_id или q.")
    if object_id is not None:
        return await lookup.by_object(object_id)
    near = (lat, lng) if lat is not None and lng is not None else None
    return await lookup.by_query(q, near)


@router.get("/{area_id}")
async def get_area(
    area_id: int,
    viewer: OptionalUser,
    session: SessionDep,
    ratings: Annotated[RatingRefresher, Depends(get_rating_refresher)],
    interests: ViewerProfile,
) -> AreaDetail:
    return await areas.get_detail(session, area_id, viewer, ratings, interests)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_area(payload: AreaInput, user: CurrentUser, session: SessionDep) -> AreaDetail:
    return await areas.create_area(session, user, payload)


@router.patch("/{area_id}")
async def update_area(
    area_id: int, payload: AreaUpdate, user: CurrentUser, session: SessionDep
) -> AreaDetail:
    return await areas.update_area(session, user, area_id, payload)


@router.delete("/{area_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(get_moderator)])
async def delete_area(area_id: int, session: SessionDep) -> None:
    await areas.delete_area(session, area_id)
