"""«Потеряшки» (SPEC §26): posts, matches, search and responses."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.api.v1 import params
from app.core.deps import CurrentUser, Moderator, OptionalUser, SessionDep
from app.core.errors import FieldValidationError
from app.domain.enums import AiTarget
from app.domain.lost_found import RADII_M, LostCategory, LostKind
from app.schemas.lost_found import (
    LostAcceptIn,
    LostItemCard,
    LostItemIn,
    LostItemOut,
    LostMatchOut,
    LostResponseIn,
    LostResponseOut,
)
from app.services.ai_moderation.screener import AiScreener, get_ai_screener
from app.services.lost_found import items, matches, responses
from app.services.lost_found.judge import LostMatcher

router = APIRouter(prefix="/lost", tags=["lost-found"])


def get_lost_matcher(request: Request) -> LostMatcher:
    return request.app.state.lost_matcher


Matcher = Annotated[LostMatcher, Depends(get_lost_matcher)]
Screener = Annotated[AiScreener, Depends(get_ai_screener)]


def item_filters(
    kind: LostKind | None = None,
    category: str | None = None,
    since: date | None = None,
    bbox: str | None = None,
) -> items.ItemFilters:
    return items.ItemFilters(
        kind=kind,
        categories=params.csv_enums(category, LostCategory, "category"),
        since=since,
        bbox=params.bbox(bbox),
    )


@router.get("")
async def list_items(
    filters: Annotated[items.ItemFilters, Depends(item_filters)],
    viewer: OptionalUser,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=items.MAX_LIMIT)] = items.DEFAULT_LIMIT,
) -> list[LostItemCard]:
    return await items.list_items(session, viewer, filters, limit)


@router.get("/mine")
async def list_mine(user: CurrentUser, session: SessionDep) -> list[LostItemCard]:
    return await items.list_mine(session, user)


@router.get("/search")
async def search(
    viewer: OptionalUser,
    session: SessionDep,
    q: Annotated[str, Query(max_length=200)] = "",
    category: LostCategory | None = None,
    near: str | None = None,
    radius_m: int | None = None,
    lost_on: date | None = None,
) -> list[LostMatchOut]:
    if radius_m is not None and (near is None or radius_m not in RADII_M):
        raise FieldValidationError("radius_m", "Радиус — 300, 1000 или 3000 м, вместе с точкой near.")
    point = params.lat_lng(near, "near")
    query = matches.SearchQuery(
        text=q.strip(), category=category, near=point, radius_m=radius_m, lost_on=lost_on
    )
    return await matches.search(session, viewer, query)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_item(
    payload: LostItemIn, user: CurrentUser, session: SessionDep, screener: Screener, matcher: Matcher
) -> LostItemOut:
    item = await items.create_item(session, user, payload)
    await screener.submit(AiTarget.LOST_ITEM, item.id)
    matcher.submit(item.id)
    return item


@router.get("/{item_id}")
async def get_item(item_id: int, viewer: OptionalUser, session: SessionDep) -> LostItemOut:
    return await items.get_item(session, item_id, viewer)


@router.get("/{item_id}/matches")
async def list_matches(item_id: int, viewer: OptionalUser, session: SessionDep) -> list[LostMatchOut]:
    item = await items.get_visible(session, item_id, viewer)
    return await matches.list_matches(session, item, viewer)


@router.post("/{item_id}/close")
async def close_item(item_id: int, user: CurrentUser, session: SessionDep) -> LostItemOut:
    return await items.close_item(session, user, item_id)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: int, user: CurrentUser, session: SessionDep) -> None:
    await items.delete_item(session, user, item_id)


@router.post("/{item_id}/report", status_code=status.HTTP_204_NO_CONTENT)
async def report_item(item_id: int, user: CurrentUser, session: SessionDep) -> None:
    await items.report_item(session, user, item_id)


@router.post("/{item_id}/hide")
async def hide_item(item_id: int, moderator: Moderator, session: SessionDep) -> LostItemOut:
    return await items.set_hidden(session, moderator, item_id, hidden=True)


@router.post("/{item_id}/unhide")
async def unhide_item(item_id: int, moderator: Moderator, session: SessionDep) -> LostItemOut:
    return await items.set_hidden(session, moderator, item_id, hidden=False)


@router.get("/{item_id}/responses")
async def list_responses(item_id: int, user: CurrentUser, session: SessionDep) -> list[LostResponseOut]:
    item = await items.get_visible(session, item_id, user)
    return await responses.list_responses(session, item, user)


@router.post("/{item_id}/responses", status_code=status.HTTP_201_CREATED)
async def create_response(
    item_id: int, payload: LostResponseIn, user: CurrentUser, session: SessionDep, screener: Screener
) -> LostResponseOut:
    item = await items.get_visible(session, item_id, user)
    response = await responses.create_response(session, user, item, payload.message, payload.contact)
    await screener.submit(AiTarget.LOST_RESPONSE, response.id)
    return response


@router.post("/responses/{response_id}/accept")
async def accept_response(
    response_id: int, payload: LostAcceptIn, user: CurrentUser, session: SessionDep
) -> LostResponseOut:
    return await responses.decide(session, user, response_id, accept=True, contact=payload.contact)


@router.post("/responses/{response_id}/decline")
async def decline_response(response_id: int, user: CurrentUser, session: SessionDep) -> LostResponseOut:
    return await responses.decide(session, user, response_id, accept=False)
