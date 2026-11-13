"""Wikivoyage import into the database: new places, merges instead of duplicates, idempotence."""

from typing import Any

from sqlalchemy import func, select

from app.core.clock import utcnow
from app.domain.enums import ExternalSourceId
from app.domain.geo import parse_south_west_north_east
from app.models import ExternalLink, Place, TextCredit
from app.services.osm import importer as osm_importer
from app.services.osm.elements import OsmElement
from app.services.wikivoyage import importer, parser
from app.services.wikivoyage.importer import WikivoyageReport
from app.services.wikivoyage.parser import Listing
from tests.conftest import API, CENTER, World

LAT, LNG = CENTER["lat"], CENTER["lng"]
M_LAT = 1 / 111_320
BBOX = parse_south_west_north_east("42.95,131.80,43.25,132.05")
STORY = (
    "Построен в 1912 году в псевдорусском стиле по проекту архитектора Н. В. Коновалова. "
    "Внутри сохранились росписи потолков и фигурные перила."
)
CREDIT = {
    "label": "Викигид",
    "license": "CC BY-SA 4.0",
    "url": "https://ru.wikivoyage.org/wiki/%D0%92%D0%BB%D0%B0%D0%B4%D0%B8%D0%B2%D0%BE%D1%81%D1%82%D0%BE%D0%BA",
}


def listing(
    name: str, north_m: float = 0, *, kind: str = "see", description: str = STORY, **fields: Any
) -> Listing:
    values: dict[str, Any] = {
        "listing_id": parser.listing_id("Владивосток", name, fields.get("wikidata")),
        "article": "Владивосток",
        "kind": kind,
        "name": name,
        "alt": "",
        "lat": round(LAT + north_m * M_LAT, 6),
        "lng": LNG,
        "wikidata": None,
        "image": None,
        "address": "",
        "hours": "",
        "description": description,
    }
    return Listing(**{**values, **fields})


async def run(world: World, *listings: Listing) -> WikivoyageReport:
    async with world.session() as session:
        return await importer.run_import(session, list(listings), BBOX, utcnow())


async def place_by_external_id(world: World, external_id: str) -> dict[str, Any]:
    async with world.session() as session:
        place_id = await session.scalar(select(Place.id).where(Place.external_id == external_id))
    return (await world.http.get(f"{API}/places/{place_id}")).json()


async def test_a_described_listing_becomes_a_preliminary_place_with_its_credit(world: World) -> None:
    station = listing("Железнодорожный вокзал", wikidata="Q567308", hours="ежедневно 10:00–19:00")
    report = await run(world, station)
    assert report.places_created == 1

    place = await place_by_external_id(world, "wikivoyage:Q567308")
    assert (place["status"], place["category"]["slug"]) == ("preliminary", "architecture")
    assert place["external"] == {"source": "wikivoyage", "label": "Викигид", "url": CREDIT["url"]}
    assert place["author"]["display_name"] == "Викигид"
    assert place["description_credit"] == CREDIT
    assert place["attributes"] == {"hours": "ежедневно 10:00–19:00"}
    assert 0 < place["trust_score"] < 100

    again = await run(world, station)
    assert (again.places_created, again.places_updated) == (0, 0)
    async with world.session() as session:
        assert await session.scalar(select(func.count()).select_from(TextCredit)) == 1


async def test_a_listing_never_duplicates_a_residents_place_it_fills_what_is_missing(world: World) -> None:
    author = await world.actor("author", reputation=20)
    own = await world.create_place(
        author,
        "historic",
        title="Вокзал Владивостока",
        description="Наш вокзал, здесь всегда красиво.",
        lat=LAT,
        lng=LNG,
    )
    station = listing(
        "Железнодорожный вокзал Владивостока",
        north_m=50,
        hours="ежедневно 10:00–19:00",
        address="Алеутская ул. 2",
    )
    report = await run(world, station)
    assert (report.places_created, report.linked_to_places, report.descriptions_added) == (0, 1, 0)

    detail = (await world.http.get(f"{API}/places/{own['id']}")).json()
    assert detail["description"] == "Наш вокзал, здесь всегда красиво.", "resident text is never overwritten"
    assert detail["description_credit"] is None
    assert detail["attributes"]["hours"] == "ежедневно 10:00–19:00"
    assert detail["address"] is not None
    async with world.session() as session:
        link = await session.scalar(select(ExternalLink))
    assert (link.ref, link.place_id, link.area_id) == (f"wikivoyage:{station.listing_id}", own["id"], None)

    far = listing("Железнодорожный вокзал Владивостока", north_m=200, listing_id="hfar")
    assert (await run(world, far)).places_created == 1, "farther than 80 m it is another place"


async def test_an_osm_description_gives_way_to_the_guide_and_survives_osm_reimports(world: World) -> None:
    element = OsmElement(
        "node", 7, {"historic": "monument", "name": "Триумфальная арка", "description": "арка"}, LAT, LNG
    )
    async with world.session() as session:
        await osm_importer.run_import(session, [element], utcnow())
    report = await run(world, listing("Триумфальная арка", alt="Николаевские триумфальные ворота"))
    assert (report.linked_to_places, report.descriptions_added) == (1, 1)
    place = await place_by_external_id(world, "osm:node/7")
    assert place["description"] == STORY
    assert place["description_credit"] == CREDIT

    async with world.session() as session:
        await osm_importer.run_import(session, [element], utcnow())
    assert (await place_by_external_id(world, "osm:node/7"))["description"] == STORY


async def test_listings_of_areas_enrich_the_area(world: World) -> None:
    moderator = await world.actor("moderator", reputation=60)
    area = (
        await moderator.post(
            "/areas", json={"title": "Миллионка", "kind": "quarter", "lat": LAT, "lng": LNG, "radius_m": 300}
        )
    ).json()
    report = await run(world, listing("Миллионка", north_m=100))
    assert (report.places_created, report.linked_to_areas, report.descriptions_added) == (0, 1, 1)
    detail = (await world.http.get(f"{API}/areas/{area['id']}")).json()
    assert (detail["description"], detail["description_credit"]) == (STORY, CREDIT)


async def test_short_closed_or_unlocated_listings_only_enrich(world: World) -> None:
    report = await run(
        world,
        listing("Приморский океанариум", kind="do", description="Приморский Океанариум ДВО РАН"),
        listing(
            "Ресторан «Орлиное Гнездо»",
            kind="eat",
            description=f"{STORY} В настоящее время на реконструкции.",
        ),
        listing("Памятник Невельскому", lat=None, lng=None),
        listing("Хостел", kind="sleep"),
    )
    assert (report.places_created, report.unmatched) == (0, 2)
    async with world.session() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(Place)
            .where(Place.external_source == ExternalSourceId.WIKIVOYAGE)
        )
    assert count == 0
