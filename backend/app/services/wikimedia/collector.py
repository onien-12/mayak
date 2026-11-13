"""The dev-time job: photos and a short description for each target place or area (SPEC §19).

Few, batched requests instead of one per target:

1. geotagged Russian Wikipedia articles around a handful of points cover the whole city, and
   targets without a Wikidata id are matched to them by name and distance;
2. Wikidata (fifty items a request) gives the main image, the Commons category and the article
   of every target with an id;
3. Wikipedia (twenty articles a request) gives the free lead image, the Wikidata id and the first
   paragraph of every article found — and Wikidata is asked once more about the new ids;
4. Commons (fifty files a request) gives author, licence and thumbnail of every named file;
5. only targets still without a photo are searched one by one, most notable first and within a
   fixed budget: their Commons category if they have one, else files geotagged around them.
"""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Protocol

from app.domain import geo, names
from app.domain.geo import BBox
from app.services.wikimedia import parser
from app.services.wikimedia.parser import Article, CommonsPhoto, Entity, Page

ARTICLE_SEARCH_RADIUS_M = 10_000
"""The largest radius Wikipedia's geosearch accepts."""
PLACE_ARTICLE_TOLERANCE_M = 200.0
AREA_ARTICLE_MARGIN_M = 300.0
PLACE_SEARCH_RADIUS_M = 150
MAX_AREA_SEARCH_RADIUS_M = 1000
SHARED_SEARCH_M = 60.0
"""Places this close to an already searched one reuse its search instead of asking again."""
MAX_SEARCHES = 150
MAX_PLACE_PHOTOS = 3
MAX_AREA_PHOTOS = 4


@dataclass(frozen=True, slots=True)
class Target:
    key: str
    """`seed:<key>` / `seed-area:<key>` for the demo data, `external_id` for imported objects."""
    title: str
    lat: float
    lng: float
    is_area: bool = False
    radius_m: int = 0
    wikidata: str | None = None
    files: tuple[str, ...] = ()
    """Commons files the source itself names (an OSM tag, the guide's image)."""
    commons_category: str | None = None
    rank: int | None = None
    """Order in the one-by-one search (lower first); None — never searched (an unnamed object)."""


@dataclass(frozen=True, slots=True)
class Summary:
    text: str
    title: str
    url: str


@dataclass(slots=True)
class Harvest:
    photos: dict[str, list[CommonsPhoto]] = field(default_factory=dict)
    summaries: dict[str, Summary] = field(default_factory=dict)


class Source(Protocol):
    async def nearby(self, lat: float, lng: float, radius_m: int) -> list[CommonsPhoto]: ...

    async def category(self, title: str) -> list[CommonsPhoto]: ...

    async def files(self, titles: Sequence[str]) -> list[CommonsPhoto]: ...

    async def entities(self, entity_ids: Sequence[str]) -> dict[str, Entity]: ...

    async def articles_near(self, lat: float, lng: float, radius_m: int) -> list[Article]: ...

    async def pages(self, titles: Sequence[str]) -> dict[str, Page]: ...


def search_centers(bbox: BBox, radius_m: float = ARTICLE_SEARCH_RADIUS_M) -> list[tuple[float, float]]:
    """Centres of a grid whose circles of `radius_m` cover the whole box."""
    height = geo.haversine_m(bbox.min_lat, bbox.min_lng, bbox.max_lat, bbox.min_lng)
    mid_lat = (bbox.min_lat + bbox.max_lat) / 2
    width = geo.haversine_m(mid_lat, bbox.min_lng, mid_lat, bbox.max_lng)
    cell = radius_m * math.sqrt(2)
    rows, columns = max(1, math.ceil(height / cell)), max(1, math.ceil(width / cell))
    step_lat = (bbox.max_lat - bbox.min_lat) / rows
    step_lng = (bbox.max_lng - bbox.min_lng) / columns
    return [
        (bbox.min_lat + step_lat * (row + 0.5), bbox.min_lng + step_lng * (column + 0.5))
        for row in range(rows)
        for column in range(columns)
    ]


def _tolerance(target: Target) -> float:
    return target.radius_m + AREA_ARTICLE_MARGIN_M if target.is_area else PLACE_ARTICLE_TOLERANCE_M


def match_article(target: Target, articles: Sequence[Article]) -> Article | None:
    """The nearest similarly named article within reach of the target."""
    near = [
        (distance, article.title, article)
        for article in articles
        if (distance := geo.haversine_m(target.lat, target.lng, article.lat, article.lng))
        <= _tolerance(target)
        and names.similar_names(target.title, article.title)
    ]
    return min(near)[2] if near else None


def _distance(target: Target, photo: CommonsPhoto) -> float:
    if photo.lat is None or photo.lng is None:
        return float("inf")
    return geo.haversine_m(target.lat, target.lng, photo.lat, photo.lng)


def assign(
    targets: Sequence[Target],
    linked: Mapping[str, Sequence[CommonsPhoto]],
    nearby: Mapping[str, Sequence[CommonsPhoto]],
) -> dict[str, list[CommonsPhoto]]:
    """Linked photos first, then nearby files each owned by its nearest target; capped per target.

    Places and areas are assigned independently: a park may show the photo of a monument in it.
    """
    by_key = {target.key: target for target in targets}
    taken = {photo.file for photos in linked.values() for photo in photos}
    owners: dict[tuple[bool, str], str] = {}
    for key, photos in nearby.items():
        target = by_key[key]
        for photo in photos:
            slot = (target.is_area, photo.file)
            current = owners.get(slot)
            if current is None or _distance(target, photo) < _distance(by_key[current], photo):
                owners[slot] = key
    result: dict[str, list[CommonsPhoto]] = {}
    for target in targets:
        own_nearby = sorted(
            (
                photo
                for photo in nearby.get(target.key, ())
                if photo.file not in taken and owners.get((target.is_area, photo.file)) == target.key
            ),
            key=lambda photo: _distance(target, photo),
        )
        chosen = list(dict.fromkeys([*linked.get(target.key, ()), *own_nearby]))
        limit = MAX_AREA_PHOTOS if target.is_area else MAX_PLACE_PHOTOS
        if chosen:
            result[target.key] = chosen[:limit]
    return result


@dataclass(slots=True)
class _Links:
    """What is known about each target after the batched steps."""

    articles: dict[str, str] = field(default_factory=dict)
    entities: dict[str, Entity] = field(default_factory=dict)
    pages: dict[str, Page] = field(default_factory=dict)

    def wikidata_of(self, target: Target) -> str | None:
        page = self.pages.get(self.articles.get(target.key, ""))
        return target.wikidata or (page.wikidata if page else None)

    def files_of(self, target: Target) -> list[str]:
        entity = self.entities.get(self.wikidata_of(target) or "")
        page = self.pages.get(self.articles.get(target.key, ""))
        named = [*target.files, entity.image if entity else None, page.image if page else None]
        return list(dict.fromkeys(file for file in named if file))

    def category_of(self, target: Target) -> str | None:
        entity = self.entities.get(self.wikidata_of(target) or "")
        return target.commons_category or (entity.commons_category if entity else None)


async def _links(source: Source, targets: Sequence[Target], centers: Sequence[tuple[float, float]]) -> _Links:
    links = _Links()
    articles = {
        article.title: article
        for lat, lng in centers
        for article in await source.articles_near(lat, lng, ARTICLE_SEARCH_RADIUS_M)
    }
    links.entities = await source.entities(sorted({target.wikidata for target in targets if target.wikidata}))
    for target in targets:
        entity = links.entities.get(target.wikidata or "")
        found = entity.article if entity and entity.article else None
        if found is None and target.wikidata is None:
            article = match_article(target, list(articles.values()))
            found = article.title if article else None
        if found is not None:
            links.articles[target.key] = found
    links.pages = await source.pages(sorted(set(links.articles.values())))
    new_ids = {page.wikidata for page in links.pages.values() if page.wikidata} - set(links.entities)
    links.entities.update(await source.entities(sorted(new_ids)))
    return links


async def _searched(
    source: Source, targets: Sequence[Target], links: _Links, have_photos: set[str], max_searches: int
) -> tuple[dict[str, list[CommonsPhoto]], dict[str, list[CommonsPhoto]]]:
    """Category files (linked) and geotagged files (nearby) for targets still without photos."""
    by_category: dict[str, list[CommonsPhoto]] = {}
    nearby: dict[str, list[CommonsPhoto]] = {}
    searched_places: list[Target] = []
    queue = sorted(
        (target for target in targets if target.rank is not None and target.key not in have_photos),
        key=lambda target: (target.rank, target.key),
    )
    searches = 0
    for target in queue:
        category = links.category_of(target)
        shared = next(
            (
                other
                for other in searched_places
                if geo.haversine_m(target.lat, target.lng, other.lat, other.lng) <= SHARED_SEARCH_M
            ),
            None,
        )
        if category is None and not target.is_area and shared is not None:
            nearby[target.key] = nearby[shared.key]
            continue
        if searches >= max_searches:
            break
        searches += 1
        if category is not None:
            by_category[target.key] = await source.category(category)
            continue
        radius = PLACE_SEARCH_RADIUS_M
        if target.is_area:
            radius = min(max(target.radius_m, PLACE_SEARCH_RADIUS_M), MAX_AREA_SEARCH_RADIUS_M)
        nearby[target.key] = await source.nearby(target.lat, target.lng, radius)
        if not target.is_area:
            searched_places.append(target)
    return by_category, nearby


async def collect(
    source: Source,
    targets: Sequence[Target],
    centers: Sequence[tuple[float, float]],
    max_searches: int = MAX_SEARCHES,
) -> Harvest:
    links = await _links(source, targets, centers)
    wanted = {target.key: links.files_of(target) for target in targets}
    titles = sorted({title for files in wanted.values() for title in files})
    found = {photo.file: photo for photo in await source.files(titles)} if titles else {}
    linked = {key: [found[title] for title in files if title in found] for key, files in wanted.items()}
    have_photos = {key for key, photos in linked.items() if photos}
    by_category, nearby = await _searched(source, targets, links, have_photos, max_searches)
    for key, photos in by_category.items():
        linked[key] = [*linked.get(key, ()), *photos]
    harvest = Harvest(photos=assign(targets, linked, nearby))
    for target in targets:
        page = links.pages.get(links.articles.get(target.key, ""))
        if page is not None and page.summary:
            harvest.summaries[target.key] = Summary(
                page.summary, page.title, parser.wikipedia_url(page.title)
            )
    return harvest
