"""HTTP entry points of the external reviews; registered in `app/api/v1/__init__.py` (SPEC §20)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.core.deps import OptionalUser, SessionDep
from app.core.errors import ConflictError
from app.services import areas, place_queries
from app.services.experimental.external_reviews import assembly, catalogues, targets
from app.services.experimental.external_reviews.config import ReviewsSettings
from app.services.experimental.external_reviews.hub import ReviewsHub
from app.services.experimental.external_reviews.schemas import (
    ExternalReviews,
    ExternalReviewSourceOut,
    SourceName,
)
from app.services.experimental.external_reviews.service import (
    DISABLED,
    NOTHING,
    ExternalReviewsService,
    Target,
)

router = APIRouter(tags=["experimental"])


def get_service(request: Request) -> ExternalReviewsService | ReviewsHub | None:
    """None while the experiment is switched off; created on first use otherwise."""
    if not request.app.state.settings.external_reviews_enabled:
        return None
    service = getattr(request.app.state, "external_reviews", None)
    if service is None:
        settings = ReviewsSettings()
        factory = request.app.state.database.session_factory
        resolver = assembly.resolver(settings, request.app.state.settings.openrouter_api_key)
        enabled = {"yandex": True, "2gis": settings.twogis_enabled, "google": settings.google_enabled}
        services = [
            assembly.service(factory, settings, source, resolver)
            for source in assembly.PROVIDERS
            if enabled[source]
        ]
        service = ReviewsHub(services)
        request.app.state.external_reviews = service
    return service


Service = Annotated[ExternalReviewsService | ReviewsHub | None, Depends(get_service)]


async def _answer(
    service: ExternalReviewsService | ReviewsHub,
    target: Target,
    cached_only: bool,
) -> ExternalReviews:
    """`cached_only` serves the card's summary row: what is known, never a request to the source."""
    return await (service.cached_for(target) if cached_only else service.reviews_for(target))


@router.get("/places/{place_id}/external-reviews", response_model_exclude_defaults=True)
async def place_reviews(
    place_id: int, viewer: OptionalUser, session: SessionDep, service: Service, cached_only: bool = False
) -> ExternalReviews:
    if service is None:
        return DISABLED
    target = targets.for_place(await place_queries.get_visible_place(session, place_id, viewer))
    if target is None:
        return NOTHING
    return await catalogues.combined(session, target, await _answer(service, target, cached_only))


@router.get("/areas/{area_id}/external-reviews", response_model_exclude_defaults=True)
async def area_reviews(
    area_id: int, session: SessionDep, service: Service, cached_only: bool = False
) -> ExternalReviews:
    if service is None:
        return DISABLED
    target = targets.for_area(await areas.get_area(session, area_id))
    return await catalogues.combined(session, target, await _answer(service, target, cached_only))


async def _more(
    service: ExternalReviewsService | ReviewsHub | None, target: Target | None, source: SourceName
) -> ExternalReviewSourceOut:
    """«Показать ещё»: the next page of one source; never a first lookup (see `service.more`)."""
    provider = service.service_for(source) if isinstance(service, ReviewsHub) else service
    if target is None or provider is None or provider.source != source:
        raise ConflictError("Больше отзывов из этого источника нет.", code="no_more_reviews")
    return await provider.more(target)


@router.get("/places/{place_id}/external-reviews/more", response_model_exclude_defaults=True)
async def more_place_reviews(
    place_id: int, source: SourceName, viewer: OptionalUser, session: SessionDep, service: Service
) -> ExternalReviewSourceOut:
    place = await place_queries.get_visible_place(session, place_id, viewer)
    return await _more(service, targets.for_place(place), source)


@router.get("/areas/{area_id}/external-reviews/more", response_model_exclude_defaults=True)
async def more_area_reviews(
    area_id: int, source: SourceName, session: SessionDep, service: Service
) -> ExternalReviewSourceOut:
    return await _more(service, targets.for_area(await areas.get_area(session, area_id)), source)
