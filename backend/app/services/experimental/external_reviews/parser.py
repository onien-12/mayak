"""Pure readers of Yandex Maps pages: the JSON state embedded as `<script class="state-view">`.

The state is deep and undocumented, so it is searched by key names, never by fixed paths. It is
untrusted input: only typed fields are taken, texts are reduced to plain text and truncated, and
everything about reviewers (names, avatars, profiles) is dropped right here.
"""

import json
import math
import re
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from selectolax.lexbor import LexborHTMLParser

MAX_REVIEWS = 30
"""Stored and served per source: what one request of the source gives, up to this many."""
MAX_PHOTOS = 8
MAX_TEXT_LENGTH = 600
MAX_TITLE_LENGTH = 200
PHOTO_SIZE = "L"
_PHOTO_HOST = "https://avatars.mds.yandex.net/"
_ORG_ID = re.compile(r"^\d{1,20}$")
_CAPTCHA_MARKERS = ("checkcaptcha", "showcaptcha", "smartcaptcha")
_MAX_DEPTH = 64


class UnexpectedPageError(ValueError):
    """Not an ordinary page with the embedded state: a captcha, a stub or a changed layout."""


class CaptchaError(UnexpectedPageError):
    """The source asks to prove we are human; it is not asked again for a day."""


@dataclass(frozen=True, slots=True)
class Organization:
    org_id: str
    title: str
    lat: float
    lng: float
    rating: float | None
    ratings_count: int | None
    reviews_count: int | None
    photos: tuple[str, ...]
    kind: str | None = None
    """The catalogue's own type of the entry (2GIS: branch, building, adm_div, attraction)."""


@dataclass(frozen=True, slots=True)
class Review:
    rating: int | None
    text: str
    published_at: datetime | None


def plain_text(value: Any, limit: int) -> str:
    """Visible text only, control characters removed, line breaks kept, cut to `limit`."""
    if not isinstance(value, str):
        return ""
    text = value
    if "<" in text:
        tree = LexborHTMLParser(text)
        tree.strip_tags(["script", "style"])
        text = tree.text()
    lines = (" ".join("".join(ch for ch in line if ch.isprintable()).split()) for line in text.splitlines())
    text = "\n".join(line for line in lines if line)
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def state_of(html: str) -> Any:
    """The embedded JSON state; `UnexpectedPageError` for a captcha or any other page."""
    tree = LexborHTMLParser(html)
    script = tree.css_first('script.state-view[type="application/json"]')
    if script is None:
        lowered = html.lower()
        marker = next((marker for marker in _CAPTCHA_MARKERS if marker in lowered), None)
        if marker is not None:
            raise CaptchaError(marker)
        raise UnexpectedPageError("no state")
    try:
        return json.loads(script.text())
    except ValueError as error:
        raise UnexpectedPageError("broken state") from error


def _dicts_with(value: Any, key: str) -> Iterator[dict[str, Any]]:
    """Every dictionary inside `value` that has `key`, in document order (iterative, bounded)."""
    stack: list[tuple[Any, int]] = [(value, 0)]
    while stack:
        node, depth = stack.pop()
        if depth > _MAX_DEPTH:
            continue
        if isinstance(node, dict):
            if key in node:
                yield node
            stack.extend((child, depth + 1) for child in reversed(list(node.values())))
        elif isinstance(node, list):
            stack.extend((child, depth + 1) for child in reversed(node))


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        return None
    return float(value)


def _count(value: Any) -> int | None:
    number = _number(value)
    return int(number) if number is not None and number >= 0 and number.is_integer() else None


def _photos(item: dict[str, Any]) -> tuple[str, ...]:
    photos = item.get("photos")
    entries = photos.get("items") if isinstance(photos, dict) else None
    urls: list[str] = []
    for entry in entries if isinstance(entries, list) else ():
        template = entry.get("urlTemplate") if isinstance(entry, dict) else None
        if isinstance(template, str) and template.startswith(_PHOTO_HOST) and template.count("%s") == 1:
            urls.append(template.replace("%s", PHOTO_SIZE))
    return tuple(dict.fromkeys(urls))[:MAX_PHOTOS]


def _organization(item: dict[str, Any]) -> Organization | None:
    org_id, coordinates, rating = item.get("id"), item.get("coordinates"), item.get("ratingData")
    if not isinstance(org_id, str) or not _ORG_ID.match(org_id):
        return None
    if not isinstance(coordinates, list) or len(coordinates) != 2:
        return None
    lng, lat = _number(coordinates[0]), _number(coordinates[1])
    title = plain_text(item.get("title"), MAX_TITLE_LENGTH)
    if lat is None or lng is None or not -90 <= lat <= 90 or not -180 <= lng <= 180 or not title:
        return None
    rating = rating if isinstance(rating, dict) else {}
    value = _number(rating.get("ratingValue"))
    return Organization(
        org_id=org_id,
        title=title,
        lat=lat,
        lng=lng,
        rating=round(value, 2) if value is not None and 0 < value <= 5 else None,
        ratings_count=_count(rating.get("ratingCount")),
        reviews_count=_count(rating.get("reviewCount")),
        photos=_photos(item),
    )


def parse_search(html: str) -> list[Organization]:
    """Organisations of a search page in the order the source ranked them."""
    state = state_of(html)
    containers = (holder[key] for key in ("results", "response") for holder in _dicts_with(state, key))
    if not any(isinstance(item, dict) and isinstance(item.get("items"), list) for item in containers):
        raise UnexpectedPageError("missing search results")
    found: dict[Organization, None] = {}
    for item in _dicts_with(state, "ratingData"):
        organization = _organization(item)
        if organization is not None:
            # Remove identical embedded copies, retaining conflicting records for the matcher.
            found.setdefault(organization, None)
    return list(found)


def _published_at(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment.astimezone(UTC) if moment.tzinfo else moment.replace(tzinfo=UTC)


def _review(raw: Any) -> Review | None:
    """Rating, text and date; nothing else of the review is even read."""
    if not isinstance(raw, dict):
        return None
    text = plain_text(raw.get("text"), MAX_TEXT_LENGTH)
    rating = _count(raw.get("rating"))
    if not text:
        return None
    return Review(
        rating=rating if rating is not None and 1 <= rating <= 5 else None,
        text=text,
        published_at=_published_at(raw.get("updatedTime")),
    )


def parse_reviews(html: str, org_id: str | None = None, *, expected_count: int | None = None) -> list[Review]:
    """Reviews in source order, bound to the requested business when its ID is supplied.

    Missing/malformed data is an unavailable page, not an empty successful cache entry.
    `updatedTime` is the source's last edit time, not necessarily the original publication date.
    """
    empty_found = False
    for holder in _dicts_with(state_of(html), "reviewResults"):
        if org_id is not None and holder.get("id") != org_id:
            continue
        results = holder["reviewResults"]
        reviews = results.get("reviews") if isinstance(results, dict) else None
        if not isinstance(reviews, list):
            continue
        if not reviews:
            empty_found = True
            continue
        parsed: list[Review] = []
        seen: set[str | tuple[str, datetime | None, int | None]] = set()
        for raw in reviews:
            if not isinstance(raw, dict):
                raise UnexpectedPageError("malformed review")
            if not isinstance(raw.get("text"), str):
                raise UnexpectedPageError("malformed review text")
            if org_id is not None and raw.get("businessId", org_id) != org_id:
                raise UnexpectedPageError("review business mismatch")
            review = _review(raw)
            if review is None:
                continue
            identifier = raw.get("reviewId")
            key = (
                identifier
                if isinstance(identifier, str)
                else (review.text, review.published_at, review.rating)
            )
            if key not in seen:
                seen.add(key)
                parsed.append(review)
        return parsed[:MAX_REVIEWS]
    if empty_found and not expected_count:
        return []
    raise UnexpectedPageError("missing or inconsistent review results")
