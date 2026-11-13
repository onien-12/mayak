"""Run independent providers concurrently within the same card response deadline."""

import asyncio

from app.services.experimental.external_reviews.schemas import ExternalReviews, SourceName
from app.services.experimental.external_reviews.service import ExternalReviewsService, Target


class ReviewsHub:
    def __init__(self, services: list[ExternalReviewsService]) -> None:
        self._services = services

    async def _answer(self, target: Target, *, cached_only: bool) -> ExternalReviews:
        answers = await asyncio.gather(
            *(
                service.cached_for(target) if cached_only else service.reviews_for(target)
                for service in self._services
            )
        )
        return ExternalReviews(
            enabled=True,
            sources=[source for answer in answers for source in answer.sources],
            pending=any(answer.pending for answer in answers),
            pending_sources=[source for answer in answers for source in answer.pending_sources],
        )

    async def cached_for(self, target: Target) -> ExternalReviews:
        return await self._answer(target, cached_only=True)

    async def reviews_for(self, target: Target) -> ExternalReviews:
        return await self._answer(target, cached_only=False)

    def service_for(self, source: SourceName) -> ExternalReviewsService | None:
        return next((service for service in self._services if service.source == source), None)
