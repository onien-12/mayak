from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.v1 import params
from app.core.deps import CurrentUser, OptionalUser, SessionDep
from app.domain.interests import Profile, Topic
from app.schemas.common import UtcDatetime
from app.schemas.interest import InterestsIn, MyInterests, Recommendations, SearchSignalIn, TopicOut
from app.services.interests import profile, recommendations, signals
from app.services.interests.recommendations import RecommendationQuery, Scope

router = APIRouter(tags=["interests"])


async def viewer_profile(viewer: OptionalUser, session: SessionDep, topics: str | None = None) -> Profile:
    """The caller's interest profile, or the `topics` a visitor without one picked (csv)."""
    return await profile.resolve(session, viewer, params.csv_enums(topics, Topic, "topics"))


ViewerProfile = Annotated[Profile, Depends(viewer_profile)]


@router.get("/interests/topics")
async def list_topics() -> list[TopicOut]:
    return profile.catalogue()


@router.get("/me/interests")
async def get_my_interests(user: CurrentUser, session: SessionDep) -> MyInterests:
    return await profile.my_interests(session, user)


@router.put("/me/interests")
async def set_my_interests(payload: InterestsIn, user: CurrentUser, session: SessionDep) -> MyInterests:
    return await profile.set_chosen(session, user, payload.topics)


@router.delete("/me/interests/noticed")
async def forget_noticed(user: CurrentUser, session: SessionDep) -> MyInterests:
    return await profile.forget_learned(session, user)


@router.post("/me/interests/signals", status_code=status.HTTP_204_NO_CONTENT)
async def record_signal(payload: SearchSignalIn, user: CurrentUser, session: SessionDep) -> None:
    await signals.on_search(session, user, payload.q)


def recommendation_query(
    scope: Scope = Scope.MAP,
    bbox: str | None = None,
    starts_from: Annotated[UtcDatetime | None, Query(alias="from")] = None,
    ends_to: Annotated[UtcDatetime | None, Query(alias="to")] = None,
    limit: Annotated[int, Query(ge=1, le=recommendations.MAX_LIMIT)] = recommendations.DEFAULT_LIMIT,
) -> RecommendationQuery:
    return RecommendationQuery(
        scope=scope, bbox=params.bbox(bbox), starts_from=starts_from, ends_to=ends_to, limit=limit
    )


@router.get("/recommendations")
async def get_recommendations(
    query: Annotated[RecommendationQuery, Depends(recommendation_query)],
    viewer: OptionalUser,
    interests: ViewerProfile,
    session: SessionDep,
) -> Recommendations:
    return await recommendations.recommend(session, viewer, interests, query)
