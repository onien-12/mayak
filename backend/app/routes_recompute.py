"""CLI: `uv run python -m app.routes_recompute` redraws the stored paths of all `roads` routes
with the configured routing providers (`ROUTING_PROVIDERS`), e.g. after switching providers."""

import asyncio

from app.core.config import get_settings
from app.core.database import Database
from app.services import routes
from app.services.route_planner import build_planner


async def _main() -> None:
    settings = get_settings()
    database = Database(settings.database_url)
    planner = build_planner(settings)
    try:
        await database.create_schema()
        async with database.session_factory() as session:
            report = await routes.recompute_paths(session, planner)
    finally:
        await planner.aclose()
        await database.dispose()
    providers = ", ".join(settings.routing_provider_list) or "без маршрутизатора"
    print(f"Маршруты по дорогам ({providers}): {report.summary()}")


if __name__ == "__main__":
    asyncio.run(_main())
