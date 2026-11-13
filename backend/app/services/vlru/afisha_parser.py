"""Pure parsers of VL.ru afisha pages (SPEC §11). Input is untrusted HTML; output is typed data."""

import json
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from selectolax.lexbor import LexborHTMLParser, LexborNode

from app.services.vlru.common import CITY_TZ, collapse_spaces, day_and_month, hour_and_minute

EVENT_PATH = "/afisha/vladivostok/event/{event_id}"
MAX_DESCRIPTION_LENGTH = 600
DEFAULT_DURATION = timedelta(hours=2)
END_OF_DAY = time(23, 59)

CATEGORY_BY_SOURCE_SLUG: dict[str, str] = {
    "concert": "culture",
    "theatre": "culture",
    "exhibition": "culture",
    "city-event": "city",
    "child": "city",
    "extreme": "sport",
    "sport": "sport",
    "masterclasses": "education",
    "education": "education",
    "tours": "education",
    "standup": "entertainment",
    "party": "entertainment",
    "quest": "entertainment",
}
DEFAULT_CATEGORY = "entertainment"

_EVENT_LINK_RE = re.compile(r"/afisha/vladivostok/event/(\d+)")
_CATEGORY_LINK_RE = re.compile(r"/events/by-category-([a-z-]+)")
_LOCATION_RE = re.compile(r"window\.EVENT_LOCATION\s*=\s*\{\s*locations\s*:\s*(\[.*?\])\s*\}", re.DOTALL)
_PRICE_RE = re.compile(r"(?:от\s+)?(\d[\d\s]*)(?:\s*до\s+\d[\d\s]*)?\s*₽", re.IGNORECASE)
_FREE_RE = re.compile(r"бесплатн|вход\s+свободн", re.IGNORECASE)
_AGE_RE = re.compile(r"(\d{1,2})\s*\+")


@dataclass(frozen=True, slots=True)
class ListingCard:
    event_id: int
    category_slug: str | None


@dataclass(frozen=True, slots=True)
class EventSession:
    day: date
    start: time | None


@dataclass(frozen=True, slots=True)
class ParsedEvent:
    title: str
    start_date: date
    end_date: date
    sessions: tuple[EventSession, ...]
    venue: str
    address: str
    lat: float | None
    lng: float | None
    image_url: str | None
    description: str
    age_limit: int | None
    price: int | None
    price_note: str | None


def parse_listing(html: str) -> list[ListingCard]:
    """Events linked from a listing page, in page order, each with the category shown on its card."""
    cards: dict[int, ListingCard] = {}
    tree = LexborHTMLParser(html)
    for item in tree.css("li.event-list__item"):
        link = next(
            (a for a in item.css("a[href]") if _EVENT_LINK_RE.search(a.attributes.get("href") or "")), None
        )
        if link is None:
            continue
        event_id = int(_EVENT_LINK_RE.search(link.attributes["href"]).group(1))
        category = item.css_first("a.event-list__item-category")
        match = _CATEGORY_LINK_RE.search((category.attributes.get("href") or "") if category else "")
        cards.setdefault(event_id, ListingCard(event_id, match.group(1) if match else None))
    return list(cards.values())


def map_category(source_slug: str | None) -> str:
    return CATEGORY_BY_SOURCE_SLUG.get(source_slug or "", DEFAULT_CATEGORY)


def _json_ld_event(tree: LexborHTMLParser) -> dict[str, Any] | None:
    for script in tree.css('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.text() or "")
        except ValueError:
            continue
        if isinstance(data, dict) and data.get("@type") == "Event":
            return data
    return None


def _iso_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _location(html: str) -> tuple[str, str, float | None, float | None]:
    """Venue title, address and coordinates from `window.EVENT_LOCATION` (parsed as JSON, never run)."""
    match = _LOCATION_RE.search(html)
    try:
        first = json.loads(match.group(1))[0] if match else {}
        lat, lng = float(first["latitude"]), float(first["longitude"])
    except (ValueError, KeyError, IndexError, TypeError):
        return "", "", None, None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return "", "", None, None
    return str(first.get("title") or ""), str(first.get("address") or ""), lat, lng


def _session_day(day: int, month: int, start_date: date, end_date: date) -> date | None:
    """Schedule rows carry no year: pick the one that puts the day inside the event's date range."""
    for year in dict.fromkeys((start_date.year, end_date.year)):
        try:
            candidate = date(year, month, day)
        except ValueError:
            continue
        if start_date <= candidate <= end_date:
            return candidate
    return None


def _sessions(tree: LexborHTMLParser, start_date: date, end_date: date) -> tuple[EventSession, ...]:
    sessions: dict[tuple[date, time | None], EventSession] = {}
    for row in tree.css(".info-program__item"):
        date_node = row.css_first(".info-program__item-date")
        parsed_day = day_and_month(date_node.text() if date_node else "")
        day = _session_day(*parsed_day, start_date, end_date) if parsed_day else None
        if day is None:
            continue
        time_node = row.css_first(".info-program__item-time")
        clock = hour_and_minute(time_node.text() if time_node else "")
        start = time(*clock) if clock else None
        sessions.setdefault((day, start), EventSession(day, start))
    return tuple(sorted(sessions.values(), key=lambda item: (item.day, item.start or time.min)))


def _text(node: LexborNode | None) -> str:
    return collapse_spaces(node.text(separator=" ")) if node else ""


def _price(tree: LexborHTMLParser) -> tuple[int | None, str | None]:
    text = _text(tree.css_first(".event-header__price-and-conditions strong")) or _text(
        tree.css_first(".event-header__price-and-conditions")
    )
    match = _PRICE_RE.search(text)
    if match:
        return int(re.sub(r"\s", "", match.group(1))), collapse_spaces(match.group(0))
    if _FREE_RE.search(text):
        return 0, None
    return None, None


def _age_limit(tree: LexborHTMLParser) -> int | None:
    match = _AGE_RE.search(_text(tree.css_first(".description-age-restrictions")))
    return int(match.group(1)) if match else None


def _https_url(value: Any) -> str | None:
    return value if isinstance(value, str) and value.startswith("https://") else None


def parse_event(html: str) -> ParsedEvent | None:
    """An event page as typed data; None when the page has no usable JSON-LD event."""
    tree = LexborHTMLParser(html)
    data = _json_ld_event(tree)
    if data is None:
        return None
    title = collapse_spaces(str(data.get("name") or ""))
    start_date = _iso_date(data.get("startDate"))
    end_date = _iso_date(data.get("endDate")) or start_date
    if not title or start_date is None or end_date is None or end_date < start_date:
        return None
    place = data.get("location") if isinstance(data.get("location"), dict) else {}
    venue, address, lat, lng = _location(html)
    price, price_note = _price(tree)
    return ParsedEvent(
        title=title,
        start_date=start_date,
        end_date=end_date,
        sessions=_sessions(tree, start_date, end_date),
        venue=venue or collapse_spaces(str(place.get("name") or "")),
        address=address or collapse_spaces(str(place.get("address") or "")),
        lat=lat,
        lng=lng,
        image_url=_https_url(data.get("image")),
        description=_text(tree.css_first(".event__description-content"))[:MAX_DESCRIPTION_LENGTH],
        age_limit=_age_limit(tree),
        price=price,
        price_note=price_note,
    )


def event_window(event: ParsedEvent, now: datetime) -> tuple[datetime, datetime] | None:
    """`(starts_at, ends_at)` of the next upcoming session in local time; None for a finished event.

    Multi-day events end at the end of their last day; a single session lasts two hours.
    """
    local_now = now.astimezone(CITY_TZ)
    if event.end_date < local_now.date():
        return None
    upcoming = [
        datetime.combine(session.day, session.start or time.min, CITY_TZ)
        for session in event.sessions
        if datetime.combine(session.day, session.start or END_OF_DAY, CITY_TZ) >= local_now
    ]
    starts_at = min(upcoming) if upcoming else datetime.combine(event.start_date, time.min, CITY_TZ)
    if event.end_date > starts_at.date():
        ends_at = datetime.combine(event.end_date, END_OF_DAY, CITY_TZ)
    else:
        ends_at = starts_at + DEFAULT_DURATION
    return (starts_at, ends_at) if ends_at > local_now else None
