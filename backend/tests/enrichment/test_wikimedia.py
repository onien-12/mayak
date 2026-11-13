"""Wikimedia enrichment: parsing, batched collection, refusal handling, photos and texts in the API."""

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import httpx

from app.core.clock import utcnow
from app.core.http import USER_AGENT
from app.domain import free_text
from app.domain.geo import parse_south_west_north_east
from app.models import Area, Place
from app.services import areas, enrichment
from app.services.wikimedia import apply, collector, parser, snapshot
from app.services.wikimedia.client import WikimediaClient
from app.services.wikimedia.collector import Harvest, Summary, Target
from app.services.wikimedia.parser import Article, CommonsPhoto, Entity, Page
from tests.conftest import API, World

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "wikimedia"
LIGHTHOUSE = (43.0738, 131.8455)
SUMMARY = Summary(
    "Токаревский маяк — один из старейших маяков Дальнего Востока.",
    "Токаревский маяк",
    "https://ru.wikipedia.org/wiki/%D0%A2%D0%BE%D0%BA%D0%B0%D1%80%D0%B5%D0%B2%D1%81%D0%BA%D0%B8%D0%B9_%D0%BC%D0%B0%D1%8F%D0%BA",
)


def fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def photo(file: str, lat: float | None = None, lng: float | None = None) -> CommonsPhoto:
    return CommonsPhoto(
        file=file,
        url=f"https://upload.wikimedia.org/{file}",
        width=1280,
        height=960,
        author="Автор",
        license="CC BY-SA 4.0",
        source_url=f"https://commons.wikimedia.org/wiki/{file}",
        lat=lat,
        lng=lng,
    )


def test_only_free_large_relevant_https_photos_survive() -> None:
    found = list(parser.photos_from_query(fixture("geosearch.json")))
    assert [item.file for item in found] == [
        "File:Tokarevsky lighthouse.jpg",
        "File:Lighthouse at dusk.png",
        "File:Script author.jpg",
    ]
    first, second, third = found
    assert (first.author, first.license, first.width, first.height) == (
        "Иван Фотограф",
        "CC BY-SA 4.0",
        1280,
        960,
    )
    assert first.source_url == "https://commons.wikimedia.org/wiki/File:Tokarevsky_lighthouse.jpg"
    assert (first.lat, first.lng) == LIGHTHOUSE
    assert second.author == parser.UNKNOWN_AUTHOR
    assert third.author == "Пётр Снимков", "markup and scripts are reduced to plain text"
    assert list(parser.photos_from_query({"error": "x"})) == []


def test_wikidata_entities_give_image_category_and_article() -> None:
    assert parser.entities(fixture("wikidata.json")) == {
        "Q1": Entity("File:Tokarevsky lighthouse.jpg", "Category:Tokarevsky Lighthouse", "Токаревский маяк"),
        "Q2": Entity(None, None, None),
        "Q4": Entity(None, None, None),
    }


def test_wikipedia_articles_and_pages() -> None:
    assert parser.articles_near(fixture("wikipedia_geosearch.json")) == [
        Article("Николаевские триумфальные ворота", 43.114009, 131.891842),
        Article("С-56", 43.113444, 131.891222),
        Article("Площадь Борцов Революции (Владивосток)", 43.115, 131.886),
    ]
    requested = ["токаревский маяк", "Николаевские ворота", "Несуществующая статья", "Без свойств"]
    pages = parser.pages(fixture("wikipedia_pages.json"), requested)
    assert set(pages) == {"токаревский маяк", "Николаевские ворота", "Без свойств"}
    lighthouse = pages["токаревский маяк"]
    assert (lighthouse.title, lighthouse.wikidata, lighthouse.image) == (
        "Токаревский маяк",
        "Q1",
        "File:Tokarevsky lighthouse.jpg",
    )
    assert lighthouse.summary == (
        "Токаревский маяк — один из старейших маяков Дальнего Востока. "
        "Расположен на мысе Токаревского во Владивостоке."
    ), "the first paragraph only"
    assert pages["Николаевские ворота"].summary.startswith(
        "Николаевские триумфальные ворота — триумфальная арка"
    )
    assert pages["Без свойств"] == Page("Без свойств", None, None, "")


def test_first_paragraph_is_clipped_at_a_sentence() -> None:
    sentence = "Предложение номер один про маяк. "
    text = sentence * 30
    clipped = parser.first_paragraph(text)
    assert len(clipped) <= free_text.MAX_SUMMARY_LENGTH
    assert clipped.endswith("маяк.")
    assert free_text.clip_at_sentence("слово " * 200, 50).endswith("…")


def test_search_centres_cover_the_service_area() -> None:
    bbox = parse_south_west_north_east("42.95,131.80,43.25,132.05")
    centers = collector.search_centers(bbox)
    assert len(centers) == 6
    assert all(bbox.contains(lat, lng) for lat, lng in centers)


def test_targets_are_matched_to_articles_by_name_and_distance() -> None:
    articles = [
        Article("Николаевские триумфальные ворота", 43.114009, 131.891842),
        Article("С-56", 43.113444, 131.891222),
    ]
    arch = Target("osm:node/1", "Николаевские триумфальные ворота", 43.1141, 131.8919)
    assert collector.match_article(arch, articles) == articles[0]
    far = Target("osm:node/2", "Николаевские триумфальные ворота", 43.1200, 131.8919)
    assert collector.match_article(far, articles) is None, "about 660 m away"
    park = Target("seed-area:x", "Триумфальные ворота", 43.1180, 131.8919, is_area=True, radius_m=300)
    assert collector.match_article(park, articles) == articles[0], "an area reaches its radius plus a margin"


def test_a_photo_belongs_to_its_nearest_target_and_linked_photos_come_first() -> None:
    lighthouse = Target("osm:node/1", "Маяк", *LIGHTHOUSE, wikidata="Q1")
    plaque = Target("osm:node/2", "Табличка", LIGHTHOUSE[0] + 0.001, LIGHTHOUSE[1])
    cape = Target("osm:way/3", "Мыс", LIGHTHOUSE[0] + 0.0005, LIGHTHOUSE[1], is_area=True)
    near_lighthouse = photo("File:A.jpg", *LIGHTHOUSE)
    near_plaque = photo("File:B.jpg", LIGHTHOUSE[0] + 0.001, LIGHTHOUSE[1])
    linked = photo("File:Linked.jpg")
    nearby = {
        "osm:node/1": [near_plaque, near_lighthouse, linked],
        "osm:node/2": [near_lighthouse, near_plaque],
        "osm:way/3": [near_lighthouse, *(photo(f"File:{index}.jpg", *LIGHTHOUSE) for index in range(9))],
    }
    result = collector.assign([lighthouse, plaque, cape], {"osm:node/1": [linked]}, nearby)
    assert [item.file for item in result["osm:node/1"]] == ["File:Linked.jpg", "File:A.jpg"]
    assert [item.file for item in result["osm:node/2"]] == ["File:B.jpg"]
    assert len(result["osm:way/3"]) == collector.MAX_AREA_PHOTOS
    assert result["osm:way/3"][0].file == "File:A.jpg", "areas are assigned independently of places"


class FakeSource:
    """Answers like Wikimedia would and records every call."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def articles_near(self, lat: float, lng: float, radius_m: int) -> list[Article]:
        self.calls.append("articles_near")
        return [Article("Токаревский маяк", *LIGHTHOUSE)]

    async def entities(self, entity_ids: Sequence[str]) -> dict[str, Entity]:
        self.calls.append(f"entities:{','.join(entity_ids)}")
        known = {
            "Q1": Entity("File:Q1.jpg", None, None),
            "Q2": Entity(None, "Category:Park", "Парк"),
            "Q9": Entity("File:Q9.jpg", None, None),
        }
        return {entity_id: known[entity_id] for entity_id in entity_ids if entity_id in known}

    async def pages(self, titles: Sequence[str]) -> dict[str, Page]:
        self.calls.append(f"pages:{len(titles)}")
        known = {
            "Токаревский маяк": Page("Токаревский маяк", "Q9", "File:Lead.jpg", SUMMARY.text),
            "Парк": Page("Парк", "Q2", None, ""),
        }
        return {title: known[title] for title in titles if title in known}

    async def files(self, titles: Sequence[str]) -> list[CommonsPhoto]:
        self.calls.append(f"files:{len(titles)}")
        return [photo(title) for title in titles]

    async def category(self, title: str) -> list[CommonsPhoto]:
        self.calls.append(f"category:{title}")
        return [photo("File:From category.jpg")]

    async def nearby(self, lat: float, lng: float, radius_m: int) -> list[CommonsPhoto]:
        self.calls.append(f"nearby:{radius_m}")
        return [photo("File:Near.jpg", lat, lng)]


async def test_collect_batches_every_step_and_searches_only_what_is_still_missing() -> None:
    source = FakeSource()
    targets = [
        Target("seed:lighthouse", "Токаревский маяк", *LIGHTHOUSE, rank=2),
        Target("osm:node/1", "Памятник", 43.2, 131.9, wikidata="Q1", files=("File:Tagged.jpg",), rank=4),
        Target("osm:way/2", "Парк", 43.1, 131.9, is_area=True, radius_m=400, wikidata="Q2", rank=1),
        Target("osm:node/3", "Скульптура", 43.15, 131.95, rank=4),
        Target("osm:node/4", "Скульптура рядом", 43.1503, 131.95, rank=4),
        Target("osm:node/5", "Видовая точка", 43.17, 131.95, rank=None),
    ]
    harvest = await collector.collect(source, targets, centers=[(43.1, 131.9), (43.2, 131.9)])
    assert source.calls == [
        "articles_near",
        "articles_near",
        "entities:Q1,Q2",
        "pages:2",
        "entities:Q9",
        "files:4",
        "category:Category:Park",
        "nearby:150",
    ], "the unnamed object is never searched and the close neighbour shares a search"
    assert [item.file for item in harvest.photos["seed:lighthouse"]] == ["File:Q9.jpg", "File:Lead.jpg"]
    assert [item.file for item in harvest.photos["osm:node/1"]] == ["File:Tagged.jpg", "File:Q1.jpg"]
    assert [item.file for item in harvest.photos["osm:way/2"]] == ["File:From category.jpg"]
    assert [item.file for item in harvest.photos["osm:node/3"]] == ["File:Near.jpg"]
    assert "osm:node/5" not in harvest.photos
    assert harvest.summaries == {"seed:lighthouse": SUMMARY}


async def test_the_search_budget_is_respected() -> None:
    source = FakeSource()
    targets = [
        Target(f"osm:node/{index}", f"Скульптура {index}", 43.0 + index / 100, 131.9, rank=4)
        for index in range(5)
    ]
    await collector.collect(source, targets, centers=[], max_searches=2)
    assert sum(call.startswith("nearby") for call in source.calls) == 2


async def test_a_refusal_stops_that_service_only_and_the_user_agent_is_fixed() -> None:
    seen: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.host == "commons.wikimedia.org":
            return httpx.Response(403, text="Please respect our robot policy")
        return httpx.Response(200, json=fixture("wikidata.json"))

    http = httpx.AsyncClient(transport=httpx.MockTransport(answer), headers={"User-Agent": USER_AGENT})
    client = WikimediaClient(http_client=http, min_interval_s=0)
    assert await client.nearby(*LIGHTHOUSE, 150) == []
    assert await client.files(["File:A.jpg"]) == []
    assert set(await client.entities([f"Q{index}" for index in range(1, 61)])) == {"Q1", "Q2", "Q4"}
    assert client.refused == {"commons"}
    assert dict(client.requests_made) == {"commons": 1, "wikidata": 2}, "sixty ids are two batches of fifty"
    assert all(request.headers["user-agent"] == USER_AGENT for request in seen)
    assert seen[0].url.params["ggsradius"] == "150"
    await client.aclose()


def test_the_snapshot_round_trip_drops_unsafe_rows(tmp_path: Path) -> None:
    file = tmp_path / "wikimedia.json"
    snapshot.write(file, Harvest({"seed:a": [photo("File:A.jpg")]}, {"seed:a": SUMMARY}), utcnow())
    document = json.loads(file.read_text(encoding="utf-8"))
    document["targets"]["seed:b"] = {
        "photos": [{**document["targets"]["seed:a"]["photos"][0], "url": "javascript:alert(1)"}],
        "summary": {"text": "x", "title": "y", "url": "https://evil.example/"},
    }
    file.write_text(json.dumps(document), encoding="utf-8")
    harvest = snapshot.read(file)
    assert set(harvest.photos) == {"seed:a"}
    assert harvest.summaries == {"seed:a": SUMMARY}
    assert snapshot.read(tmp_path / "absent.json") == Harvest()


async def test_photos_and_texts_never_push_residents_aside(world: World, client: httpx.AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    sight = await world.create_place(author, "viewpoint", title="Видовая у маяка", description="")
    told = await world.create_place(
        author, "historic", title="Маяк", description="Наш маяк.", lat=43.2, lng=131.95
    )
    moderator = await world.actor("moderator", reputation=60)
    area = (
        await moderator.post(
            "/areas",
            json={"title": "Мыс Эгершельд", "kind": "other", "lat": 43.2, "lng": 131.95, "radius_m": 200},
        )
    ).json()
    harvest = Harvest(
        photos={"sight": [photo("File:A.jpg"), photo("File:B.jpg")], "area": [photo("File:C.jpg")]},
        summaries={"sight": SUMMARY, "told": SUMMARY, "area": SUMMARY},
    )

    async def run() -> apply.WikimediaReport:
        async with world.session() as session:
            keyed = enrichment.Keyed(
                places={
                    "sight": await session.get_one(Place, sight["id"]),
                    "told": await session.get_one(Place, told["id"]),
                },
                areas={"area": await session.get_one(Area, area["id"])},
            )
            report = await apply.apply_snapshot(session, harvest, keyed, utcnow())
            await areas.refresh_all(session, utcnow())
            await session.commit()
        return report

    first = await run()
    assert first.summary() == {
        "photos_added": 3,
        "places_photographed": 1,
        "areas_photographed": 1,
        "descriptions_added": 2,
    }
    detail = (await client.get(f"{API}/places/{sight['id']}")).json()
    credit = {
        "author": "Автор",
        "license": "CC BY-SA 4.0",
        "source_url": "https://commons.wikimedia.org/wiki/File:A.jpg",
    }
    assert detail["photos"][0]["credit"] == credit
    assert (detail["cover_url"], detail["cover_credit"]) == (
        "https://upload.wikimedia.org/File:A.jpg",
        credit,
    )
    assert detail["description"] == SUMMARY.text
    assert detail["description_credit"] == {
        "label": "Википедия",
        "license": "CC BY-SA 4.0",
        "url": SUMMARY.url,
    }
    kept = (await client.get(f"{API}/places/{told['id']}")).json()
    assert (kept["description"], kept["description_credit"]) == ("Наш маяк.", None)

    uploaded = (
        await author.post("/uploads", files={"file": ("p.png", World.png((800, 600)), "image/png")})
    ).json()
    after = (await author.post(f"/places/{sight['id']}/photos", json={"photo_ids": [uploaded["id"]]})).json()
    assert [item["credit"] is None for item in after["photos"]] == [True, False, False], "user photos first"
    assert (after["cover_url"], after["cover_credit"]) == (uploaded["url"], None)

    area_detail = (await client.get(f"{API}/areas/{area['id']}")).json()
    assert [item["credit"]["source_url"] for item in area_detail["photos"]] == [
        "https://commons.wikimedia.org/wiki/File:C.jpg"
    ]
    assert area_detail["description_credit"]["label"] == "Википедия"
    assert (await run()).summary() == {
        "photos_added": 0,
        "places_photographed": 0,
        "areas_photographed": 0,
        "descriptions_added": 0,
    }, "idempotent"
