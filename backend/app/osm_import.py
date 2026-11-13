"""CLI: `uv run python -m app.osm_import [--fetch]` imports the OpenStreetMap layer (SPEC §18).

Without `--fetch` the committed snapshot is imported into the configured database. With it,
Overpass is queried once for `OSM_BBOX`, the snapshot is rewritten, and then imported.
"""

import argparse
import asyncio

from app.core.clock import utcnow
from app.core.config import get_settings
from app.core.database import Database
from app.domain import geo
from app.seed.runner import OSM_SNAPSHOT_FILE
from app.services.osm import client as overpass
from app.services.osm import elements, importer, snapshot


async def _refresh_snapshot(raw_bbox: str) -> bool:
    bbox = geo.parse_south_west_north_east(raw_bbox)
    client = overpass.OverpassClient()
    try:
        payload = await client.fetch(bbox)
    finally:
        await client.aclose()
    if payload is None:
        print("Overpass недоступен, снимок не изменён.")
        return False
    fetched = elements.parse_overpass(payload)
    snapshot.write(OSM_SNAPSHOT_FILE, fetched, bbox, utcnow())
    print(f"Снимок OpenStreetMap обновлён: {len(fetched)} объектов → {OSM_SNAPSHOT_FILE.name}")
    return True


async def _main(fetch: bool) -> None:
    settings = get_settings()
    if fetch and not await _refresh_snapshot(settings.osm_bbox):
        return
    database = Database(settings.database_url)
    try:
        await database.create_schema()
        async with database.session_factory() as session:
            report = await importer.run_import(session, snapshot.read(OSM_SNAPSHOT_FILE), utcnow())
    finally:
        await database.dispose()
    print(f"OpenStreetMap: {report.summary()}")
    print(f"  новые точки по категориям: {dict(sorted(report.created_by_category.items()))}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Импорт базового слоя OpenStreetMap.")
    parser.add_argument("--fetch", action="store_true", help="заново запросить Overpass и обновить снимок")
    asyncio.run(_main(parser.parse_args().fetch))


if __name__ == "__main__":
    main()
