"""Version 1 of the HTTP API: thin routers that parse input and delegate to services."""

from fastapi import APIRouter, Depends

from app.api.v1 import (
    areas,
    auth,
    catalog,
    collections,
    complaints,
    events,
    interests,
    moderation,
    notes,
    notifications,
    outages,
    places,
    routes,
    stats,
    uploads,
    users,
)
from app.core import viewer
from app.core.deps import OptionalUser, SessionDep, SettingsDep
from app.services import combined_ratings
from app.services.experimental.external_reviews.router import router as external_reviews_router


async def _bind_combined_ratings(session: SessionDep, settings: SettingsDep) -> None:
    """Blended ratings (SPEC §22) exist only while the external reviews are enabled."""
    combined_ratings.enable(session, settings.external_reviews_enabled)


async def _bind_viewer(user: OptionalUser) -> None:
    """Responses mask profanity for everyone but the author of a text and moderators (SPEC §24.5)."""
    viewer.bind(user)


api_router = APIRouter(dependencies=[Depends(_bind_combined_ratings), Depends(_bind_viewer)])
for module in (
    auth,
    users,
    catalog,
    areas,
    places,
    events,
    uploads,
    routes,
    notes,
    outages,
    complaints,
    collections,
    notifications,
    moderation,
    stats,
    interests,
):
    api_router.include_router(module.router)
# External reviews (SPEC §20); cards read their cached ratings through `combined_ratings` (§22).
api_router.include_router(external_reviews_router)
