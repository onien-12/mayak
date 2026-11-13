"""CLI: `uv run python -m app.wikimedia_enrich [--fetch]` — photos and short descriptions from
Wikimedia (SPEC §19).

Without `--fetch` the committed snapshot is applied to the configured database: photos where a
place or area has none, Wikipedia summaries where the description is empty — idempotent, safe on
a long-running database. With it, the snapshot is first rebuilt with a few batched requests.
Targets are the seed's own tourism places and areas, the tourism places and territories of the
OpenStreetMap snapshot and the listings of the Wikivoyage snapshot; no database is needed for that.
"""

import argparse
import asyncio

from app.core.clock import utcnow
from app.core.config import get_settings
from app.core.database import Database
from app.domain import geo, geometry
from app.domain.enums import Layer
from app.seed import areas as area_data
from app.seed import catalog
from app.seed.lookup import ALL_PLACES, area_key, place_key, seed_objects
from app.seed.runner import (
    OSM_SNAPSHOT_FILE,
    WIKIMEDIA_SNAPSHOT_FILE,
    WIKIVOYAGE_SNAPSHOT_FILE,
    load_area_outlines,
)
from app.services import areas, enrichment
from app.services.interests import tagging as interest_tagging
from app.services.osm import snapshot as osm_snapshot
from app.services.osm.elements import OsmElement
from app.services.osm.mapping import UNNAMED_TITLES
from app.services.osm.normaliser import AreaDraft, PlaceDraft, normalise
from app.services.wikimedia import apply, collector, parser, snapshot
from app.services.wikimedia.client import WikimediaClient
from app.services.wikimedia.collector import Target
from app.services.wikivoyage import normaliser as guide
from app.services.wikivoyage import snapshot as guide_snapshot

TOURISM_CATEGORIES = frozenset(slug for slug, layer, *_ in catalog.CATEGORIES if layer is Layer.TOURISM)
SEED_AREA_RANK, OSM_AREA_RANK, SEED_PLACE_RANK, GUIDE_PLACE_RANK, OSM_PLACE_RANK = range(5)
"""Order of the one-by-one photo search: territories, the seed's sights, the guide's, OSM's."""
OSM_DUPLICATE_M = 40.0
"""The OSM importer skips objects this close to a seed place of the same category."""


def _territory(outline: object) -> geometry.Territory | None:
    try:
        return geometry.parse_territory(outline)
    except geometry.InvalidGeometryError:
        return None


def _seed_targets() -> list[Target]:
    outlines = load_area_outlines()
    places = [
        Target(place_key(spec.key), spec.title, spec.lat, spec.lng, rank=SEED_PLACE_RANK)
        for spec in ALL_PLACES
        if spec.category in TOURISM_CATEGORIES
    ]
    found: list[Target] = []
    for spec in area_data.AREAS:
        lat, lng, radius_m = spec.fallback_circle
        territory = _territory((outlines.get(spec.key) or {}).get("geometry"))
        if territory is not None:
            lat, lng, radius_m = territory.label_lat, territory.label_lng, territory.radius_m
        found.append(Target(area_key(spec.key), spec.title, lat, lng, True, radius_m, rank=SEED_AREA_RANK))
    return [*found, *places]


def _osm_target(element: OsmElement, seed_places: list[Target]) -> Target | None:
    draft = normalise(element)
    wikidata = element.tags.get("wikidata", "")
    commons = element.tags.get("wikimedia_commons", "")
    links = {
        "wikidata": wikidata if parser.is_wikidata_id(wikidata) else None,
        "files": (commons,) if commons.startswith("File:") else (),
        "commons_category": commons if commons.startswith("Category:") else None,
    }
    if isinstance(draft, AreaDraft):
        territory = _territory(draft.outline)
        if territory is None:
            return None
        return Target(
            draft.external_id,
            draft.title,
            territory.label_lat,
            territory.label_lng,
            True,
            territory.radius_m,
            rank=OSM_AREA_RANK,
            **links,
        )
    if not isinstance(draft, PlaceDraft) or draft.category not in TOURISM_CATEGORIES:
        return None
    duplicate = any(
        geo.haversine_m(draft.lat, draft.lng, seed.lat, seed.lng) <= OSM_DUPLICATE_M for seed in seed_places
    )
    named = draft.title not in UNNAMED_TITLES
    rank = OSM_PLACE_RANK if named and not duplicate else None
    return Target(draft.external_id, draft.title, draft.lat, draft.lng, rank=rank, **links)


def _guide_targets() -> list[Target]:
    """Every located listing: a new place of its own or the key of the place it enriches."""
    bbox = geo.parse_south_west_north_east(get_settings().osm_bbox)
    return [
        Target(
            draft.external_id,
            draft.title,
            draft.lat,
            draft.lng,
            wikidata=draft.wikidata,
            files=(draft.image,) if draft.image else (),
            rank=GUIDE_PLACE_RANK if draft.role is guide.Role.CREATE else None,
        )
        for draft in guide.normalise(guide_snapshot.read(WIKIVOYAGE_SNAPSHOT_FILE), bbox)
    ]


def targets() -> list[Target]:
    seed = _seed_targets()
    seed_places = [target for target in seed if not target.is_area]
    osm = [_osm_target(element, seed_places) for element in osm_snapshot.read(OSM_SNAPSHOT_FILE)]
    return [*seed, *(target for target in osm if target is not None), *_guide_targets()]


async def _refresh_snapshot() -> bool:
    bbox = geo.parse_south_west_north_east(get_settings().osm_bbox)
    wanted = targets()
    client = WikimediaClient()
    try:
        harvest = await collector.collect(client, wanted, collector.search_centers(bbox))
    finally:
        await client.aclose()
    requests = ", ".join(f"{service} {count}" for service, count in sorted(client.requests_made.items()))
    if client.refused:
        print(
            f"Wikimedia отказал ({', '.join(sorted(client.refused))}), запросы: {requests}; "
            "снимок не изменён."
        )
        return False
    snapshot.write(WIKIMEDIA_SNAPSHOT_FILE, harvest, utcnow())
    print(
        f"Wikimedia: целей {len(wanted)}, запросов: {requests}; фото у {len(harvest.photos)} целей, "
        f"описаний {len(harvest.summaries)} → {WIKIMEDIA_SNAPSHOT_FILE.name}"
    )
    return True


async def _main(fetch: bool) -> None:
    if fetch and not await _refresh_snapshot():
        return
    database = Database(get_settings().database_url)
    try:
        await database.create_schema()
        async with database.session_factory() as session:
            keyed = await enrichment.keyed_objects(session)
            seeded = await seed_objects(session)
            keyed.merge(seeded.places, seeded.areas)
            now = utcnow()
            report = await apply.apply_snapshot(session, snapshot.read(WIKIMEDIA_SNAPSHOT_FILE), keyed, now)
            await areas.refresh_all(session, now)
            await interest_tagging.tag_stale(session, now)
            await session.commit()
    finally:
        await database.dispose()
    print(f"Wikimedia: {report.summary()}")


def main() -> None:
    arguments = argparse.ArgumentParser(description="Фото и описания из Wikimedia для мест и локаций.")
    arguments.add_argument(
        "--fetch", action="store_true", help="заново собрать снимок (несколько пакетных запросов)"
    )
    asyncio.run(_main(arguments.parse_args().fetch))


if __name__ == "__main__":
    main()
