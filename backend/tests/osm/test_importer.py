"""OSM import into the database: trust, areas, duplicates, idempotence, community wins."""

from pathlib import Path
from typing import Any

from sqlalchemy import func, select, update

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.database import Database
from app.domain import trust
from app.domain.enums import ExternalSourceId, PlaceStatus, UserRole
from app.domain.interests import Topic
from app.domain.trust import VoteTotals
from app.models import Area, ExternalLink, Place, User
from app.seed.runner import run_seed
from app.services.interests import profile as interest_profile
from app.services.interests import recommendations
from app.services.interests import tagging as interest_tagging
from app.services.osm import importer
from app.services.osm.elements import OsmElement
from app.services.osm.importer import OsmReport
from tests.conftest import API, CENTER, World

LAT, LNG = CENTER["lat"], CENTER["lng"]
M_LAT, M_LNG = 1 / 111_320, 1 / 81_200


def square(side_m: float, north_m: float = 0, east_m: float = 0) -> dict[str, Any]:
    south, west = LAT + north_m * M_LAT, LNG + east_m * M_LNG
    north, east = south + side_m * M_LAT, west + side_m * M_LNG
    return {
        "type": "Polygon",
        "coordinates": [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    }


def node(osm_id: int, tags: dict[str, str], north_m: float = 0, east_m: float = 0) -> OsmElement:
    return OsmElement("node", osm_id, tags, round(LAT + north_m * M_LAT, 6), round(LNG + east_m * M_LNG, 6))


def park(osm_id: int, name: str, side_m: float, north_m: float = 0, east_m: float = 0) -> OsmElement:
    return OsmElement(
        "way", osm_id, {"leisure": "park", "name": name}, LAT, LNG, outline=square(side_m, north_m, east_m)
    )


TOILET = node(1, {"amenity": "toilets", "fee": "no"}, north_m=1000)
PLAYGROUND = node(2, {"leisure": "playground"}, north_m=50, east_m=50)
EMPTY_PARK = park(20, "Сквер Пустой", 100, north_m=2000)
PARK = park(10, "Сквер Тестовый", 200)


async def run(world: World, *elements: OsmElement) -> OsmReport:
    async with world.session() as session:
        return await importer.run_import(session, list(elements), utcnow())


async def by_external_id(world: World, external_id: str) -> dict[str, Any]:
    async with world.session() as session:
        place_id = await session.scalar(select(Place.id).where(Place.external_id == external_id))
    return (await world.http.get(f"{API}/places/{place_id}")).json()


async def test_objects_become_preliminary_places_inside_osm_territories(world: World) -> None:
    report = await run(world, TOILET, PLAYGROUND, PARK, EMPTY_PARK)
    assert (report.places_created, report.areas_created) == (2, 2)

    toilet = await by_external_id(world, "osm:node/1")
    assert (toilet["title"], toilet["status"], toilet["attributes"]) == (
        "Общественный туалет",
        "preliminary",
        {"free": True},
    )
    assert toilet["external"] == {
        "source": "osm",
        "label": "OpenStreetMap",
        "url": "https://www.openstreetmap.org/node/1",
    }
    assert (toilet["author"]["display_name"], toilet["area"]) == ("OpenStreetMap", None)
    login = await world.http.post(f"{API}/auth/login", json={"email": "osm@mayak-vl.ru", "password": "!"})
    assert login.status_code == 401

    playground = await by_external_id(world, "osm:node/2")
    assert playground["category"]["slug"] == "playground"
    assert playground["area"]["title"] == "Сквер Тестовый"

    every = (await world.http.get(f"{API}/areas")).json()
    assert {item["title"] for item in every} == {"Сквер Тестовый", "Сквер Пустой"}
    assert all(item["external"]["source"] == "osm" for item in every)
    shown = (await world.http.get(f"{API}/areas", params={"min_places": 1})).json()
    assert [(item["title"], item["places_count"]) for item in shown] == [("Сквер Тестовый", 1)]
    assert (await world.http.get(f"{API}/areas", params={"min_places": -1})).status_code == 422


async def test_community_content_wins(world: World) -> None:
    resident = await world.actor("resident", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    own_toilet = await world.create_place(resident, "toilet", lat=TOILET.lat + 20 * M_LAT, lng=TOILET.lng)
    seeded = await moderator.post(
        "/areas", json={"title": "Сквер жителей", "kind": "park", "geometry": square(190, 5, 5)}
    )
    assert seeded.status_code == 201

    report = await run(world, TOILET, PLAYGROUND, PARK, node(3, {"leisure": "playground"}, north_m=1010))
    assert (report.places_duplicates, report.places_created) == (1, 2), (
        "toilet within 40 m of a resident's one"
    )
    assert (report.areas_duplicates, report.areas_created) == (1, 0), "the existing area wins"
    near_toilet = await by_external_id(world, "osm:node/3")
    assert near_toilet["category"]["slug"] == "playground", "another category is not a duplicate"
    playground = await by_external_id(world, "osm:node/2")
    assert playground["area"]["title"] == "Сквер жителей"
    assert (await world.http.get(f"{API}/places/{own_toilet['id']}")).json()["external"] is None


async def test_reimport_is_idempotent_and_never_overrides_the_community(world: World) -> None:
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    resident = await world.actor("resident", reputation=20)
    first, second, third = (
        node(4, {"amenity": "toilets"}),
        node(5, {"leisure": "playground"}, north_m=300),
        node(6, {"amenity": "library", "name": "Библиотека № 1"}, north_m=600),
    )
    gone, confirmed = (
        node(7, {"amenity": "toilets"}, north_m=900),
        node(8, {"amenity": "toilets"}, north_m=1200),
    )
    await run(world, first, second, third, gone, confirmed)

    edited = await by_external_id(world, "osm:node/4")
    assert (
        await moderator.patch(f"/places/{edited['id']}", json={"title": "Туалет у фонтана"})
    ).status_code == 200
    hidden = await by_external_id(world, "osm:node/5")
    async with world.session() as session:
        await session.execute(update(Place).where(Place.id == hidden["id"]).values(status=PlaceStatus.HIDDEN))
        await session.commit()
    voted = await by_external_id(world, "osm:node/8")
    await world.vote(resident, voted["id"])

    renamed = OsmElement(
        "node", 6, {"amenity": "library", "name": "Библиотека им. Горького"}, third.lat, third.lng
    )
    report = await run(world, node(4, {"amenity": "toilets", "fee": "no"}), second, renamed, confirmed)
    assert report.summary() == {
        "areas_created": 0,
        "areas_duplicates": 0,
        "areas_invalid": 0,
        "places_created": 0,
        "places_updated": 1,
        "places_duplicates": 0,
        "places_invalid": 0,
        "kept_local_edits": 1,
        "kept_closed": 1,
        "archived_gone": 1,
    }
    assert (await by_external_id(world, "osm:node/4"))["title"] == "Туалет у фонтана"
    assert (await by_external_id(world, "osm:node/6"))["title"] == "Библиотека им. Горького"
    async with world.session() as session:
        statuses = {
            row.external_id: row.status
            for row in await session.execute(select(Place.external_id, Place.status))
        }
    assert statuses["osm:node/5"] is PlaceStatus.HIDDEN, "never resurrected"
    assert statuses["osm:node/7"] is PlaceStatus.ARCHIVED, "deleted from OSM"
    assert statuses["osm:node/8"] is PlaceStatus.PRELIMINARY, "residents confirmed it, it stays"
    history = (await world.http.get(f"{API}/places/{voted['id']}/history")).json()
    assert history[-1]["message"] == "Публикация создана"

    again = await run(world, node(4, {"amenity": "toilets", "fee": "no"}), second, renamed, confirmed)
    assert (again.places_created, again.places_updated) == (0, 0)


async def test_imports_are_counted_apart_from_the_community_in_stats(world: World) -> None:
    resident = await world.actor("resident", reputation=20)
    await world.create_place(resident, "toilet")
    await run(world, TOILET, PLAYGROUND)
    playground = await by_external_id(world, "osm:node/2")
    await world.vote(resident, playground["id"])

    stats = (await world.http.get(f"{API}/stats")).json()
    totals = stats["totals"]
    assert (totals["places"], totals["imported_places"], totals["confirmed_imported"]) == (1, 2, 1)
    assert {item["source"]: item["count"] for item in stats["imported_by_source"]}["osm"] == 2
    assert sum(item["count"] for item in stats["by_layer"]) == 1
    assert stats["activity"][-1]["places"] == 1


def test_trust_baseline_is_per_source() -> None:
    def status(totals: VoteTotals) -> PlaceStatus:
        return trust.derive_status(
            totals=totals, author_prior=0.25, complaints_weight=0.0, disputing_absent=totals.absent
        ).status

    osm = trust.with_external_baseline(VoteTotals(), ExternalSourceId.OSM)
    assert (osm.present, osm.present_voters) == (1.0, 1)
    assert status(osm) is PlaceStatus.PRELIMINARY
    assert trust.imported_status(ExternalSourceId.OSM, 0.25) is PlaceStatus.PRELIMINARY
    assert trust.imported_status(ExternalSourceId.VL_RU, 0.25) is PlaceStatus.VERIFIED
    residents = VoteTotals(present=3.0, present_voters=3)
    assert status(trust.with_external_baseline(residents, ExternalSourceId.OSM)) is PlaceStatus.VERIFIED
    assert (
        status(trust.with_external_baseline(VoteTotals(absent=6.0), ExternalSourceId.OSM))
        is PlaceStatus.HIDDEN
    )
    vl_ru = trust.with_external_baseline(VoteTotals(), ExternalSourceId.VL_RU)
    assert trust.trust_score(0.25, vl_ru, utcnow(), utcnow()) > trust.trust_score(
        0.25, osm, utcnow(), utcnow()
    )


async def test_truncated_lists_keep_the_most_trusted_places(world: World) -> None:
    resident = await world.actor("resident", reputation=20)
    await run(world, node(31, {"amenity": "toilets"}), node(32, {"amenity": "toilets"}, north_m=500))
    confirmed = await by_external_id(world, "osm:node/31")
    await world.vote(resident, confirmed["id"])
    top = (await world.http.get(f"{API}/places", params={"limit": 1})).json()
    assert [item["id"] for item in top] == [confirmed["id"]]


async def test_the_seed_imports_the_committed_snapshots(tmp_path: Path) -> None:
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'seed.db'}",
        media_dir=tmp_path / "media",
        twogis_api_key="",
        openrouter_api_key="",
    )
    database = Database(settings.database_url)
    await database.create_schema()
    try:
        async with database.session_factory() as session:
            await run_seed(session, settings)
            counts = dict(
                (
                    await session.execute(
                        select(Place.external_source, func.count()).group_by(Place.external_source)
                    )
                ).all()
            )
            osm_areas = await session.scalar(
                select(func.count()).select_from(Area).where(Area.external_source == ExternalSourceId.OSM)
            )
            links = await session.scalar(select(func.count()).select_from(ExternalLink))
            # What the start-up pass does next: a fresh install shows «Для вас» to the demo account.
            await interest_tagging.tag_stale(session, utcnow())
            demo = await session.scalar(select(User).where(User.email == "demo@mayak-vl.ru"))
            demo_profile = await interest_profile.load(session, demo.id)
            for_demo = await recommendations.recommend(
                session, demo, demo_profile, recommendations.RecommendationQuery()
            )
    finally:
        await database.dispose()
    assert counts[ExternalSourceId.OSM] > 3000
    assert counts[None] > 70, "the community's own seed is still there"
    assert osm_areas > 30
    assert counts[ExternalSourceId.WIKIVOYAGE] >= 10, "the travel guide's listings"
    assert links >= 10, "listings that describe existing places enrich them instead"
    assert set(demo_profile) == {Topic.SEA, Topic.VIEWS, Topic.HISTORY}
    assert for_demo.personalized
    assert len(for_demo.items) >= 9
    assert {item.topics[0] for item in for_demo.items} >= {Topic.SEA, Topic.VIEWS, Topic.HISTORY}
