"""CLI: `uv run python -m app.wikivoyage_import [--fetch]` imports the Wikivoyage listings (SPEC §21).

Without `--fetch` the committed snapshot is applied to the configured database — idempotent, safe
on a database that has been running for a while. With it, the articles are requested once each
(a few requests in total), the snapshot is rewritten, and then applied.
"""

import argparse
import asyncio

from app.core.clock import utcnow
from app.core.config import get_settings
from app.core.database import Database
from app.domain import geo
from app.seed.runner import WIKIVOYAGE_SNAPSHOT_FILE
from app.services.wikivoyage import importer, snapshot
from app.services.wikivoyage.client import WikivoyageClient
from app.services.wikivoyage.parser import Listing, parse_listings

ARTICLES = ("Владивосток", "Остров Русский")
"""The city article and the sub-articles of its districts that have listings."""


async def _refresh_snapshot() -> bool:
    client = WikivoyageClient()
    listings: dict[str, Listing] = {}
    try:
        for article in ARTICLES:
            wikitext = await client.wikitext(article)
            if wikitext is None:
                print(f"Викигид: статья «{article}» недоступна, снимок не изменён.")
                return False
            for listing in parse_listings(article, wikitext):
                listings.setdefault(listing.listing_id, listing)
    finally:
        await client.aclose()
    snapshot.write(WIKIVOYAGE_SNAPSHOT_FILE, ARTICLES, list(listings.values()), utcnow())
    print(
        f"Снимок Викигида обновлён: {len(listings)} объектов из {len(ARTICLES)} статей, "
        f"запросов {client.requests_made} → {WIKIVOYAGE_SNAPSHOT_FILE.name}"
    )
    return True


async def _main(fetch: bool) -> None:
    settings = get_settings()
    if fetch and not await _refresh_snapshot():
        return
    database = Database(settings.database_url)
    try:
        await database.create_schema()
        async with database.session_factory() as session:
            bbox = geo.parse_south_west_north_east(settings.osm_bbox)
            report = await importer.run_import(
                session, snapshot.read(WIKIVOYAGE_SNAPSHOT_FILE), bbox, utcnow()
            )
    finally:
        await database.dispose()
    print(f"Викигид: {report.summary()}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Импорт мест из путеводителя Викигид.")
    parser.add_argument("--fetch", action="store_true", help="заново прочитать статьи и обновить снимок")
    asyncio.run(_main(parser.parse_args().fetch))


if __name__ == "__main__":
    main()
