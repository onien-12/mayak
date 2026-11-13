"""CLI: `uv run python -m app.afisha_import` imports the VL.ru afisha once (SPEC §11)."""

import asyncio

from app.core.clock import utcnow
from app.core.config import get_settings
from app.core.database import Database
from app.services.vlru import afisha_importer
from app.services.vlru.client import VlRuClient


async def _main() -> None:
    database = Database(get_settings().database_url)
    client = VlRuClient()
    try:
        await database.create_schema()
        async with database.session_factory() as session:
            report = await afisha_importer.run_import(session, client, utcnow())
    finally:
        await client.aclose()
        await database.dispose()
    print(f"Афиша VL.ru: {report.summary()}")
    for label, ids in (
        ("без координат (пропущены)", report.without_coordinates),
        ("без времени начала", report.without_time),
        ("без цены", report.without_price),
    ):
        print(f"  {label}: {len(ids)} {ids[:15]}")


if __name__ == "__main__":
    asyncio.run(_main())
