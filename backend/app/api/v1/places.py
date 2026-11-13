from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.v1 import params
from app.core.deps import CurrentUser, Moderator, OptionalUser, SessionDep
from app.core.errors import FieldValidationError
from app.core.rate_limit import limit_by_user
from app.domain import attributes, limits
from app.domain.enums import AiTarget, Layer
from app.schemas.common import UtcDatetime
from app.schemas.feedback import CommentIn, CommentOut, ReviewIn, ReviewOut
from app.schemas.place import (
    AppealIn,
    AppealOut,
    HistoryEntry,
    OfficialInfoIn,
    PhotoIdsIn,
    PlaceCard,
    PlaceDetail,
    PlaceInput,
    PlaceUpdate,
    VoteIn,
)
from app.services import comments, favorites, issues, moderation, places, reviews, verification
from app.services.ai_moderation.screener import AiScreener, get_ai_screener
from app.services.external_ratings import RatingRefresher, get_rating_refresher
from app.services.places import MinStatus, Origin, PlaceFilters

router = APIRouter(tags=["places"])

Screener = Annotated[AiScreener, Depends(get_ai_screener)]
Ratings = Annotated[RatingRefresher, Depends(get_rating_refresher)]

_vote_limit = limit_by_user(
    "votes",
    limit=limits.VOTES_PER_HOUR,
    window=limits.HOUR,
    message="Слишком много голосов за час. Сделайте паузу и продолжайте позже.",
)
_comment_limit = limit_by_user(
    "comments",
    limit=limits.COMMENTS_PER_HOUR,
    window=limits.HOUR,
    message="Слишком много комментариев за час. Попробуйте позже.",
)


def _attr_filters(raw: str | None) -> dict[str, str]:
    try:
        return attributes.parse_attr_filters(raw or "")
    except ValueError:
        raise FieldValidationError("attrs", "Ожидается список пар ключ:значение через запятую.") from None


def place_filters(
    bbox: str | None = None,
    layers: str | None = None,
    categories: str | None = None,
    min_status: MinStatus = MinStatus.ANY,
    q: Annotated[str | None, Query(max_length=100)] = None,
    tags: str | None = None,
    attrs: str | None = None,
    event_from: UtcDatetime | None = None,
    event_to: UtcDatetime | None = None,
    include_past_events: bool = False,
    include_resolved: bool = False,
    author_id: int | None = None,
    area_id: int | None = None,
    origin: Origin | None = None,
    near: str | None = None,
    radius_m: Annotated[int, Query(ge=1, le=places.MAX_NEAR_RADIUS_M)] = places.DEFAULT_NEAR_RADIUS_M,
    limit: Annotated[int, Query(ge=1, le=places.MAX_LIST_LIMIT)] = places.DEFAULT_LIST_LIMIT,
) -> PlaceFilters:
    return PlaceFilters(
        bbox=params.bbox(bbox),
        layers=params.csv_enums(layers, Layer, "layers"),
        category_ids=params.csv_ints(categories, "categories"),
        min_status=min_status,
        query=q.strip() if q else None,
        tags=tuple(tag.lower() for tag in params.split_csv(tags)),
        attrs=_attr_filters(attrs),
        event_from=event_from,
        event_to=event_to,
        include_past_events=include_past_events,
        include_resolved=include_resolved,
        author_id=author_id,
        area_id=area_id,
        origin=origin,
        near=params.lat_lng(near, "near"),
        radius_m=radius_m,
        limit=limit,
    )


@router.get("/places")
async def list_places(
    filters: Annotated[PlaceFilters, Depends(place_filters)], viewer: OptionalUser, session: SessionDep
) -> list[PlaceCard]:
    return await places.list_places(session, viewer, filters)


@router.post("/places", status_code=status.HTTP_201_CREATED)
async def create_place(
    payload: PlaceInput, user: CurrentUser, session: SessionDep, screener: Screener
) -> PlaceDetail:
    detail = await places.create_place(session, user, payload)
    await screener.submit(AiTarget.PLACE, detail.id)
    return detail


@router.get("/places/{place_id}")
async def get_place(
    place_id: int, viewer: OptionalUser, session: SessionDep, ratings: Ratings
) -> PlaceDetail:
    return await places.get_detail(session, place_id, viewer, ratings)


@router.patch("/places/{place_id}")
async def update_place(
    place_id: int, payload: PlaceUpdate, user: CurrentUser, session: SessionDep, screener: Screener
) -> PlaceDetail:
    detail = await places.update_place(session, user, place_id, payload)
    await screener.submit(AiTarget.PLACE, detail.id)
    await screener.submit_all(AiTarget.PHOTO, payload.photo_ids or [])
    return detail


@router.delete("/places/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_place(place_id: int, user: CurrentUser, session: SessionDep) -> None:
    await places.archive_place(session, user, place_id)


@router.get("/places/{place_id}/history")
async def list_history(place_id: int, viewer: OptionalUser, session: SessionDep) -> list[HistoryEntry]:
    return await places.list_history(session, place_id, viewer)


@router.post("/places/{place_id}/votes", dependencies=[Depends(_vote_limit)])
async def cast_vote(place_id: int, payload: VoteIn, user: CurrentUser, session: SessionDep) -> PlaceDetail:
    return await verification.cast_vote(session, user, place_id, payload)


@router.delete("/places/{place_id}/votes", dependencies=[Depends(_vote_limit)])
async def withdraw_vote(place_id: int, user: CurrentUser, session: SessionDep) -> PlaceDetail:
    return await verification.withdraw_vote(session, user, place_id)


@router.get("/places/{place_id}/reviews")
async def list_reviews(place_id: int, viewer: OptionalUser, session: SessionDep) -> list[ReviewOut]:
    return await reviews.list_place_reviews(session, place_id, viewer)


@router.post("/places/{place_id}/reviews")
async def review_place(
    place_id: int, payload: ReviewIn, user: CurrentUser, session: SessionDep, screener: Screener
) -> ReviewOut:
    review = await reviews.review_place(session, user, place_id, payload)
    await screener.submit(AiTarget.REVIEW, review.id)
    return review


@router.get("/places/{place_id}/comments")
async def list_comments(place_id: int, viewer: OptionalUser, session: SessionDep) -> list[CommentOut]:
    return await comments.list_comments(session, place_id, viewer)


@router.post(
    "/places/{place_id}/comments", status_code=status.HTTP_201_CREATED, dependencies=[Depends(_comment_limit)]
)
async def add_comment(
    place_id: int, payload: CommentIn, user: CurrentUser, session: SessionDep, screener: Screener
) -> CommentOut:
    comment = await comments.add_comment(session, user, place_id, payload)
    await screener.submit(AiTarget.COMMENT, comment.id)
    return comment


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(comment_id: int, user: CurrentUser, session: SessionDep) -> None:
    await comments.delete_comment(session, user, comment_id)


@router.post("/places/{place_id}/photos")
async def add_photos(
    place_id: int, payload: PhotoIdsIn, user: CurrentUser, session: SessionDep, screener: Screener
) -> PlaceDetail:
    detail = await places.add_photos(session, user, place_id, payload.photo_ids)
    await screener.submit_all(AiTarget.PHOTO, payload.photo_ids)
    return detail


@router.put("/places/{place_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
async def add_favorite(place_id: int, user: CurrentUser, session: SessionDep) -> None:
    await favorites.add_favorite(session, user, place_id)


@router.delete("/places/{place_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(place_id: int, user: CurrentUser, session: SessionDep) -> None:
    await favorites.remove_favorite(session, user, place_id)


@router.post("/places/{place_id}/appeal", status_code=status.HTTP_201_CREATED)
async def file_appeal(place_id: int, payload: AppealIn, user: CurrentUser, session: SessionDep) -> AppealOut:
    return AppealOut(case_id=await moderation.file_appeal(session, user, place_id, payload.text))


@router.patch("/places/{place_id}/issue/official")
async def update_official_info(
    place_id: int, payload: OfficialInfoIn, moderator: Moderator, session: SessionDep
) -> PlaceDetail:
    return await issues.update_official_info(session, moderator, place_id, payload)
