"""Application factory: wiring of settings, database, routing, errors, CORS and static media."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1 import api_router
from app.core.clock import utcnow
from app.core.config import Settings, get_settings
from app.core.database import Database
from app.core.errors import register_exception_handlers
from app.core.rate_limit import SlidingWindowLimiter
from app.domain import geo
from app.seed.runner import seed_if_empty
from app.services import areas, uploads, verification
from app.services.ai_moderation.client import OpenRouterClient
from app.services.ai_moderation.screener import AiScreener, ScreeningSweeper
from app.services.external_ratings import RatingRefresher
from app.services.geometry_lookup import GeometryLookup, NominatimClient
from app.services.interests import tagging as interest_tagging
from app.services.interests.classifier import ClassifierLoop, InterestClassifier, OpenRouterClassifierClient
from app.services.route_planner import build_planner
from app.services.twogis_places import TwoGisPlacesClient
from app.services.vlru import scheduler as vlru_scheduler
from app.services.vlru.client import VlRuClient

API_PREFIX = "/api/v1"
LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def _configure_logging() -> None:
    """Show the application's own INFO messages (imports, pre-screening) next to uvicorn's."""
    app_logger = logging.getLogger("app")
    if not app_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(LOG_FORMAT))
        app_logger.addHandler(handler)
        app_logger.setLevel(logging.INFO)
        app_logger.propagate = False


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Prepare the database, then start the background helpers; none of them can block startup."""
    settings: Settings = app.state.settings
    database: Database = app.state.database
    route_planner = build_planner(settings)
    ai_client = (
        OpenRouterClient(settings.openrouter_api_key, settings.llm_moderation_model)
        if settings.llm_moderation_active
        else None
    )
    places_client = TwoGisPlacesClient(settings.twogis_api_key)
    boundary_client = NominatimClient(geo.parse_south_west_north_east(settings.osm_bbox))
    app.state.route_planner = route_planner
    app.state.geometry_lookup = GeometryLookup(places_client, boundary_client)
    app.state.rating_refresher = RatingRefresher(places_client, settings.twogis_rating_daily_limit)
    app.state.ai_screener = AiScreener(ai_client, database.session_factory, settings)
    await database.create_schema()
    async with database.session_factory() as session:
        if settings.seed_on_startup:
            await seed_if_empty(session, settings)
        await verification.refresh_trust_scores(session, utcnow())
        await uploads.refresh_covers(session, settings.media_dir, utcnow())
        await areas.refresh_all(session, utcnow())
        await interest_tagging.tag_stale(session, utcnow())
        await session.commit()
    await app.state.ai_screener.resubmit_stuck()
    sweeper = ScreeningSweeper(lambda: app.state.ai_screener)
    sweeper.start()
    importer = vlru_scheduler.VlRuScheduler(
        database.session_factory, VlRuClient(), vlru_scheduler.enabled_jobs(settings)
    )
    importer.start()
    classifier_client = (
        OpenRouterClassifierClient(settings.openrouter_api_key, settings.interests_llm_model)
        if settings.interests_llm_active
        else None
    )
    classifier_loop = None
    if classifier_client is not None:
        classifier_loop = ClassifierLoop(
            InterestClassifier(
                classifier_client,
                database.session_factory,
                daily_cap=settings.interests_llm_daily_request_cap,
            )
        )
        classifier_loop.start()
    yield
    if classifier_loop is not None:
        await classifier_loop.stop()
    if classifier_client is not None:
        await classifier_client.aclose()
    await importer.stop()
    await sweeper.stop()
    await app.state.ai_screener.drain()
    if ai_client is not None:
        await ai_client.aclose()
    await route_planner.aclose()
    await places_client.aclose()
    await boundary_client.aclose()
    await database.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    _configure_logging()

    app = FastAPI(title="Маяк — народная карта Владивостока", version="1.0.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.database = Database(settings.database_url)
    app.state.rate_limiter = SlidingWindowLimiter()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )
    register_exception_handlers(app)
    app.include_router(api_router, prefix=API_PREFIX)
    app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")
    return app


app = create_app()
