from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.v1 import params
from app.core.deps import CurrentUser, OptionalUser, SessionDep, get_current_user
from app.domain import gpx
from app.domain.enums import AiTarget, RouteDifficulty, RouteKind
from app.schemas.feedback import ReviewIn, ReviewOut
from app.schemas.route import (
    RouteCard,
    RouteDetail,
    RouteInput,
    RoutePreviewIn,
    RoutePreviewOut,
    RouteUpdate,
)
from app.services import reviews, routes
from app.services.ai_moderation.screener import AiScreener, get_ai_screener
from app.services.route_planner import RoutePlanner, get_route_planner
from app.services.routes import RouteFilters, RouteSort

router = APIRouter(tags=["routes"])

PlannerDep = Annotated[RoutePlanner, Depends(get_route_planner)]
Screener = Annotated[AiScreener, Depends(get_ai_screener)]


def route_filters(
    kind: str | None = None,
    difficulty: str | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    author_id: int | None = None,
    sort: RouteSort = RouteSort.NEW,
    limit: Annotated[int, Query(ge=1, le=routes.MAX_LIMIT)] = routes.DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> RouteFilters:
    return RouteFilters(
        kinds=params.csv_enums(kind, RouteKind, "kind"),
        difficulties=params.csv_enums(difficulty, RouteDifficulty, "difficulty"),
        query=q.strip() if q else None,
        author_id=author_id,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.get("/routes")
async def list_routes(
    filters: Annotated[RouteFilters, Depends(route_filters)], viewer: OptionalUser, session: SessionDep
) -> list[RouteCard]:
    return await routes.list_routes(session, viewer, filters)


@router.post("/routes/preview", dependencies=[Depends(get_current_user)])
async def preview_route(payload: RoutePreviewIn, planner: PlannerDep) -> RoutePreviewOut:
    return await routes.preview(planner, payload)


@router.post("/routes", status_code=status.HTTP_201_CREATED)
async def create_route(
    payload: RouteInput, user: CurrentUser, session: SessionDep, planner: PlannerDep, screener: Screener
) -> RouteDetail:
    detail = await routes.create_route(session, planner, user, payload)
    await screener.submit(AiTarget.ROUTE, detail.id)
    return detail


@router.get("/routes/{route_id}")
async def get_route(route_id: int, viewer: OptionalUser, session: SessionDep) -> RouteDetail:
    return await routes.get_detail(session, route_id, viewer)


@router.get("/routes/{route_id}/gpx", response_class=Response)
async def export_route_gpx(route_id: int, viewer: OptionalUser, session: SessionDep) -> Response:
    document = await routes.export_gpx(session, route_id, viewer)
    headers = {"Content-Disposition": f'attachment; filename="mayak-route-{route_id}.gpx"'}
    return Response(document, media_type=gpx.MEDIA_TYPE, headers=headers)


@router.patch("/routes/{route_id}")
async def update_route(
    route_id: int,
    payload: RouteUpdate,
    user: CurrentUser,
    session: SessionDep,
    planner: PlannerDep,
    screener: Screener,
) -> RouteDetail:
    detail = await routes.update_route(session, planner, user, route_id, payload)
    await screener.submit(AiTarget.ROUTE, detail.id)
    return detail


@router.delete("/routes/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_route(route_id: int, user: CurrentUser, session: SessionDep) -> None:
    await routes.delete_route(session, user, route_id)


@router.put("/routes/{route_id}/save", status_code=status.HTTP_204_NO_CONTENT)
async def save_route(route_id: int, user: CurrentUser, session: SessionDep) -> None:
    await routes.save_route(session, user, route_id)


@router.delete("/routes/{route_id}/save", status_code=status.HTTP_204_NO_CONTENT)
async def unsave_route(route_id: int, user: CurrentUser, session: SessionDep) -> None:
    await routes.unsave_route(session, user, route_id)


@router.get("/routes/{route_id}/reviews")
async def list_route_reviews(route_id: int, viewer: OptionalUser, session: SessionDep) -> list[ReviewOut]:
    return await reviews.list_route_reviews(session, route_id, viewer)


@router.post("/routes/{route_id}/reviews")
async def review_route(
    route_id: int, payload: ReviewIn, user: CurrentUser, session: SessionDep, screener: Screener
) -> ReviewOut:
    review = await reviews.review_route(session, user, route_id, payload)
    await screener.submit(AiTarget.REVIEW, review.id)
    return review
