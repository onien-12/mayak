"""One provider's service as the router and the warm-up build it from the settings."""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.services.experimental.external_reviews.client import (
    GoogleMapsClient,
    HttpPagesClient,
    YandexMapsClient,
)
from app.services.experimental.external_reviews.config import ReviewsSettings
from app.services.experimental.external_reviews.google import GoogleProvider
from app.services.experimental.external_reviews.judge import OpenRouterJudge
from app.services.experimental.external_reviews.providers import Provider, YandexProvider
from app.services.experimental.external_reviews.resolver import Resolver
from app.services.experimental.external_reviews.schemas import SourceName
from app.services.experimental.external_reviews.service import ExternalReviewsService
from app.services.experimental.external_reviews.twogis import TwoGisProvider

PROVIDERS: dict[SourceName, tuple[type[Provider], type[HttpPagesClient]]] = {
    "yandex": (YandexProvider, YandexMapsClient),
    "2gis": (TwoGisProvider, HttpPagesClient),
    "google": (GoogleProvider, GoogleMapsClient),
}


def resolver(settings: ReviewsSettings, openrouter_api_key: str) -> Resolver:
    """The matcher's rules, with the judge when an OpenRouter key is configured and not switched off."""
    if not settings.judge_active(openrouter_api_key):
        return Resolver()
    return Resolver(OpenRouterJudge(openrouter_api_key, settings.llm_model))


def service(
    session_factory: async_sessionmaker[AsyncSession],
    settings: ReviewsSettings,
    source: SourceName,
    shared_resolver: Resolver,
) -> ExternalReviewsService:
    provider, transport = PROVIDERS[source]
    return ExternalReviewsService(
        session_factory,
        transport.from_settings(settings),
        provider=provider(),
        resolver=shared_resolver,
        daily_cap=settings.daily_request_cap,
        failure_dump_dir=settings.failure_dump_dir,
    )
