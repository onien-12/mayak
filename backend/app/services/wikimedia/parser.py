"""Pure readers of Wikimedia API answers: Commons `imageinfo` pages, Wikidata entities and
Wikipedia pages (coordinates, page image, the first paragraph). Every answer is untrusted data:
only typed fields are taken and texts are reduced to plain text."""

import math
import re
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from selectolax.lexbor import LexborHTMLParser

from app.domain import free_text

ALLOWED_MIME = frozenset({"image/jpeg", "image/png"})
MIN_SIDE_PX = 600
MAX_AUTHOR_LENGTH = 200
MAX_LICENSE_LENGTH = 60
FREE_LICENSE = re.compile(r"^(cc[ -]by|cc0|public domain|pd\b|attribution|gfdl|fal\b)", re.IGNORECASE)
IRRELEVANT_TITLE = re.compile(
    r"(\bmap\b|карта|схема|\bplan\b|план |logo|логотип|\bflag\b|флаг|coat of arms|герб|diagram|"
    r"диаграмма|icon|иконка|signature|подпись|poster|афиша|screenshot|скриншот|locator|location map)",
    re.IGNORECASE,
)
UNKNOWN_AUTHOR = "автор не указан"
WIKIPEDIA_URL = "https://ru.wikipedia.org/wiki/{title}"
MAX_ARTICLE_TITLE_LENGTH = 250
_FILE_PREFIX = "File:"
_CATEGORY_PREFIX = "Category:"
_WIKIDATA_ID = re.compile(r"^Q\d{1,12}$")


@dataclass(frozen=True, slots=True)
class CommonsPhoto:
    file: str
    """`File:…` title on Commons; identifies the photo across targets."""
    url: str
    """Hot-linked thumbnail (≤ 1280 px wide)."""
    width: int
    height: int
    author: str
    license: str
    source_url: str
    """The file's description page on Commons."""
    lat: float | None = None
    lng: float | None = None


def plain_text(html: str, limit: int) -> str:
    """Commons metadata is HTML written by anyone: keep the visible text only."""
    if "<" in html:
        tree = LexborHTMLParser(html)
        tree.strip_tags(["script", "style"])
        html = tree.text(separator=" ")
    text = " ".join(html.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _meta(info: Mapping[str, Any], key: str) -> str:
    value = (info.get("extmetadata") or {}).get(key) or {}
    raw = value.get("value") if isinstance(value, dict) else None
    return raw if isinstance(raw, str) else ""


def _positive_int(value: Any) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else 0


def _https(value: Any) -> str | None:
    return value if isinstance(value, str) and value.startswith("https://") and len(value) <= 1000 else None


def _coordinates(page: Mapping[str, Any]) -> tuple[float | None, float | None]:
    coordinates = page.get("coordinates")
    first = coordinates[0] if isinstance(coordinates, list) and coordinates else {}
    lat, lng = first.get("lat"), first.get("lon")
    if isinstance(lat, int | float) and isinstance(lng, int | float):
        return float(lat), float(lng)
    return None, None


def make_photo(
    *,
    file: Any,
    url: Any,
    width: Any,
    height: Any,
    author: Any,
    license_name: Any,
    source_url: Any,
    lat: float | None = None,
    lng: float | None = None,
) -> CommonsPhoto | None:
    """A photo whose every field is safe to show; None when it is not free, not https or irrelevant.

    Used both for API answers and for rows read back from the snapshot.
    """
    url, source_url = _https(url), _https(source_url)
    width, height = _positive_int(width), _positive_int(height)
    license_text = plain_text(license_name, MAX_LICENSE_LENGTH) if isinstance(license_name, str) else ""
    if (
        not isinstance(file, str)
        or not file.startswith(_FILE_PREFIX)
        or IRRELEVANT_TITLE.search(file)
        or not FREE_LICENSE.search(license_text)
        or url is None
        or source_url is None
        or not width
        or not height
    ):
        return None
    author_text = plain_text(author, MAX_AUTHOR_LENGTH) if isinstance(author, str) else ""
    return CommonsPhoto(
        file=file,
        url=url,
        width=width,
        height=height,
        author=author_text or UNKNOWN_AUTHOR,
        license=license_text,
        source_url=source_url,
        lat=lat,
        lng=lng,
    )


def photo_from_page(page: Any) -> CommonsPhoto | None:
    """A usable photo of an `imageinfo` page: a JPEG or PNG at least 600 px on its short side."""
    if not isinstance(page, dict) or not isinstance(page.get("imageinfo"), list) or not page["imageinfo"]:
        return None
    info = page["imageinfo"][0] if isinstance(page["imageinfo"][0], dict) else {}
    original_side = min(_positive_int(info.get("width")), _positive_int(info.get("height")))
    if info.get("mime") not in ALLOWED_MIME or original_side < MIN_SIDE_PX:
        return None
    lat, lng = _coordinates(page)
    return make_photo(
        file=page.get("title"),
        url=info.get("thumburl") or info.get("url"),
        width=info.get("thumbwidth") or info.get("width"),
        height=info.get("thumbheight") or info.get("height"),
        author=_meta(info, "Artist"),
        license_name=_meta(info, "LicenseShortName"),
        source_url=info.get("descriptionurl"),
        lat=lat,
        lng=lng,
    )


def photos_from_query(payload: Any) -> Iterator[CommonsPhoto]:
    """Photos of an `action=query` answer (`formatversion=2`), in the order Commons gave them."""
    pages = (payload.get("query") or {}).get("pages") if isinstance(payload, dict) else None
    for page in pages if isinstance(pages, list) else ():
        photo = photo_from_page(page)
        if photo is not None:
            yield photo


@dataclass(frozen=True, slots=True)
class Entity:
    """What a Wikidata item says about pictures and articles."""

    image: str | None
    """Main image (P18) as `File:…`."""
    commons_category: str | None
    """Commons category (P373) as `Category:…`."""
    article: str | None
    """Title of the Russian Wikipedia article."""


@dataclass(frozen=True, slots=True)
class Article:
    """A geotagged Wikipedia article."""

    title: str
    lat: float
    lng: float


@dataclass(frozen=True, slots=True)
class Page:
    title: str
    wikidata: str | None
    image: str | None
    """The article's free lead image as `File:…`."""
    summary: str
    """The first paragraph of the introduction, plain text, at most 600 characters."""


def file_title(name: str) -> str:
    """`Foo.jpg` or `File:Foo.jpg` → `File:Foo.jpg`."""
    name = " ".join(name.replace("_", " ").split())
    return name if name.startswith(_FILE_PREFIX) else _FILE_PREFIX + name


def category_title(name: str) -> str:
    name = " ".join(name.replace("_", " ").split())
    return name if name.startswith(_CATEGORY_PREFIX) else _CATEGORY_PREFIX + name


def wikipedia_url(title: str) -> str:
    return WIKIPEDIA_URL.format(title=quote(title.replace(" ", "_")))


def is_wikidata_id(value: Any) -> bool:
    return isinstance(value, str) and bool(_WIKIDATA_ID.match(value))


def _claim(entity: Mapping[str, Any], prop: str) -> str | None:
    try:
        value = entity["claims"][prop][0]["mainsnak"]["datavalue"]["value"]
    except (KeyError, IndexError, TypeError):
        return None
    return (
        value if isinstance(value, str) and value.strip() and len(value) <= MAX_ARTICLE_TITLE_LENGTH else None
    )


def _title(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    title = " ".join(value.split())
    return title if title and len(title) <= MAX_ARTICLE_TITLE_LENGTH else None


def entities(payload: Any) -> dict[str, Entity]:
    """Entities of a `wbgetentities` answer (claims and the `ruwiki` sitelink), by Q-id."""
    raw = payload.get("entities") if isinstance(payload, dict) else None
    found: dict[str, Entity] = {}
    for entity_id, entity in (raw if isinstance(raw, dict) else {}).items():
        if not is_wikidata_id(entity_id) or not isinstance(entity, dict) or "missing" in entity:
            continue
        image, category = _claim(entity, "P18"), _claim(entity, "P373")
        sitelink = (
            (entity.get("sitelinks") or {}).get("ruwiki")
            if isinstance(entity.get("sitelinks"), dict)
            else None
        )
        found[entity_id] = Entity(
            image=file_title(image) if image else None,
            commons_category=category_title(category) if category else None,
            article=_title(sitelink.get("title")) if isinstance(sitelink, dict) else None,
        )
    return found


def _finite(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        return None
    return float(value)


def articles_near(payload: Any) -> list[Article]:
    """Articles of a `list=geosearch` answer."""
    query = payload.get("query") if isinstance(payload, dict) else None
    rows = query.get("geosearch") if isinstance(query, dict) else None
    found: list[Article] = []
    for row in rows if isinstance(rows, list) else ():
        if not isinstance(row, dict):
            continue
        title, lat, lng = _title(row.get("title")), _finite(row.get("lat")), _finite(row.get("lon"))
        if title is not None and lat is not None and lng is not None:
            found.append(Article(title, lat, lng))
    return found


def first_paragraph(extract: Any) -> str:
    """The first non-empty paragraph of a plain-text introduction, clipped at a sentence."""
    if not isinstance(extract, str):
        return ""
    paragraph = next((line for line in map(free_text.single_line, extract.splitlines()) if line), "")
    return free_text.clip_at_sentence(paragraph, free_text.MAX_SUMMARY_LENGTH)


def _resolved(query: Mapping[str, Any]) -> dict[str, str]:
    """One step of title resolution: `normalized` (spelling) and `redirects` (another article)."""
    steps: dict[str, str] = {}
    for key in ("normalized", "redirects"):
        for step in query.get(key) or ():
            if (
                isinstance(step, dict)
                and isinstance(step.get("from"), str)
                and isinstance(step.get("to"), str)
            ):
                steps[step["from"]] = step["to"]
    return steps


def pages(payload: Any, requested: Sequence[str]) -> dict[str, Page]:
    """Pages of a Wikipedia `prop=extracts|pageimages|pageprops` answer, by the requested title."""
    query = payload.get("query") if isinstance(payload, dict) else None
    if not isinstance(query, dict):
        return {}
    by_title: dict[str, Page] = {}
    for raw in query.get("pages") or ():
        if not isinstance(raw, dict) or raw.get("missing") or _title(raw.get("title")) is None:
            continue
        wikidata = (
            (raw.get("pageprops") or {}).get("wikibase_item")
            if isinstance(raw.get("pageprops"), dict)
            else None
        )
        image = raw.get("pageimage")
        by_title[raw["title"]] = Page(
            title=raw["title"],
            wikidata=wikidata if is_wikidata_id(wikidata) else None,
            image=file_title(image) if isinstance(image, str) and image.strip() else None,
            summary=first_paragraph(raw.get("extract")),
        )
    steps = _resolved(query)
    found: dict[str, Page] = {}
    for title in requested:
        final = steps.get(steps.get(title, title), steps.get(title, title))
        if final in by_title:
            found[title] = by_title[final]
    return found
