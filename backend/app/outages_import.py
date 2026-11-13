"""CLI: `uv run python -m app.outages_import` imports current VL.ru outages once (SPEC §15)."""

import asyncio

from app.core.clock import utcnow
from app.core.config import get_settings
from app.core.database import Database
from app.services.vlru import outages_importer
from app.services.vlru.client import VlRuClient


async def _main() -> None:
    database = Database(get_settings().database_url)
    client = VlRuClient()
    try:
        await database.create_schema()
        async with database.session_factory() as session:
            report = await outages_importer.run_import(session, client, utcnow())
    finally:
        await client.aclose()
        await database.dispose()
    if report is None:
        print("Отключения VL.ru: источник недоступен, данные не изменены.")
        return
    print(f"Отключения VL.ru: {report.summary()}")
    print(f"  без расписания в списке отключений: {list(report.without_schedule)[:20]}")


if __name__ == "__main__":
    asyncio.run(_main())
