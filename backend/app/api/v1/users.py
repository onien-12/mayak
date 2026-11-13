from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, OptionalUser, SessionDep
from app.schemas.favorites import FavoritesOut
from app.schemas.place import PlaceCard
from app.schemas.route import RouteCard
from app.schemas.user import (
    HomeIn,
    ReputationEventOut,
    SubscriptionIn,
    SubscriptionOut,
    UserBrief,
    UserMe,
    UserProfile,
    UserUpdate,
)
from app.services import events, favorites, reputation, routes, users

router = APIRouter(tags=["users"])


@router.get("/users/top")
async def list_top_users(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=users.MAX_TOP_LIMIT)] = users.DEFAULT_TOP_LIMIT,
) -> list[UserBrief]:
    return await users.list_top(session, limit)


@router.patch("/users/me")
async def update_me(payload: UserUpdate, user: CurrentUser, session: SessionDep) -> UserMe:
    return await users.update_me(session, user, payload)


@router.put("/users/me/home")
async def set_home(payload: HomeIn, user: CurrentUser, session: SessionDep) -> UserMe:
    return await users.set_home(session, user, payload)


@router.delete("/users/me/home")
async def remove_home(user: CurrentUser, session: SessionDep) -> UserMe:
    return await users.remove_home(session, user)


@router.get("/users/{user_id}")
async def get_profile(user_id: int, viewer: OptionalUser, session: SessionDep) -> UserProfile:
    return await users.get_profile(session, user_id, viewer)


@router.get("/users/{user_id}/places")
async def list_user_places(
    user_id: int,
    viewer: OptionalUser,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=users.MAX_PLACES_LIMIT)] = users.DEFAULT_PLACES_LIMIT,
) -> list[PlaceCard]:
    return await users.list_user_places(session, user_id, viewer, limit)


@router.get("/users/{user_id}/routes")
async def list_user_routes(user_id: int, viewer: OptionalUser, session: SessionDep) -> list[RouteCard]:
    return await routes.list_routes(
        session, viewer, routes.RouteFilters(author_id=user_id, limit=routes.MAX_LIMIT)
    )


@router.post("/users/{user_id}/respect")
async def send_respect(user_id: int, user: CurrentUser, session: SessionDep) -> UserProfile:
    return await users.send_respect(session, user, user_id)


@router.get("/me/reputation")
async def list_my_reputation(
    user: CurrentUser, session: SessionDep, limit: Annotated[int, Query(ge=1, le=200)] = 50
) -> list[ReputationEventOut]:
    return await reputation.list_events(session, user, limit=limit)


@router.get("/me/routes")
async def list_my_routes(user: CurrentUser, session: SessionDep) -> list[RouteCard]:
    return await routes.list_my_routes(session, user)


@router.get("/me/favorites")
async def list_my_favorites(user: CurrentUser, session: SessionDep) -> FavoritesOut:
    return await favorites.list_favorites(session, user)


@router.get("/me/events")
async def list_my_events(user: CurrentUser, session: SessionDep) -> list[PlaceCard]:
    return await events.list_my_events(session, user)


@router.get("/me/subscriptions")
async def list_my_subscriptions(user: CurrentUser, session: SessionDep) -> list[SubscriptionOut]:
    return await users.list_subscriptions(session, user)


@router.post("/me/subscriptions", status_code=status.HTTP_201_CREATED)
async def create_subscription(
    payload: SubscriptionIn, user: CurrentUser, session: SessionDep
) -> SubscriptionOut:
    return await users.create_subscription(session, user, payload)


@router.delete("/me/subscriptions/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription(subscription_id: int, user: CurrentUser, session: SessionDep) -> None:
    await users.delete_subscription(session, user, subscription_id)
