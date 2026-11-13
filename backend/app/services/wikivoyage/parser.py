"""Pure reader of Wikivoyage wikitext: `{{listing}}` templates → typed listings (SPEC §21).

Wikitext is written by anyone and is untrusted: templates are matched by counting braces (they
nest), every value is reduced to plain text — links, files, references, markup and unknown
templates are dropped — and only typed fields leave this module. Nothing is ever evaluated.
"""

import hashlib
import html
import math
import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass

from app.domain import free_text

LISTING_TEMPLATES = frozenset({"listing", "see", "do", "buy", "eat", "drink", "sleep", "go"})
"""`{{listing|type=see}}` and its short forms `{{see}}`, `{{do}}`, …"""
LAT_KEYS = ("lat", "la", "latitude")
LNG_KEYS = ("long", "lon", "lng", "longitude")
"""Typos such as `la=` / `lon=` occur in the source and are accepted."""
DESCRIPTION_KEYS = ("description", "content")
MAX_NAME_LENGTH = 120
MAX_FIELD_LENGTH = 200
MAX_DESCRIPTION_LENGTH = 3000
MAX_TEMPLATE_LENGTH = 20_000
"""A listing longer than this is a broken template swallowing the page; it is skipped."""
ALL_DAYS = "ежедневно"
_WIKIDATA_ID = re.compile(r"^Q\d{1,12}$")
_COMMENT = re.compile(r"<!--.*?(-->|\Z)", re.DOTALL)
_REFERENCE = re.compile(r"<ref\b[^>/]*/>|<ref\b[^>]*>.*?(</ref\s*>|\Z)", re.DOTALL | re.IGNORECASE)
_LINE_BREAK = re.compile(r"<\s*(br|p|/p)\b[^>]*>", re.IGNORECASE)
_TAG = re.compile(r"<[^<>]{0,500}>")
_INNER_TEMPLATE = re.compile(r"\{\{[^{}]*\}\}")
_INNER_LINK = re.compile(r"\[\[([^\[\]]*)\]\]")
_EXTERNAL_LINK = re.compile(r"\[(?:https?:)?//[^\s\]]+\s*([^\]]*)\]")
_EMPHASIS = re.compile(r"'{2,}")
_FILE_PREFIXES = ("файл:", "file:", "image:", "изображение:", "категория:", "category:")
_MAX_PASSES = 32
"""Nesting depth handled when templates and links are unwrapped from the inside out."""


@dataclass(frozen=True, slots=True)
class Listing:
    listing_id: str
    """The Wikidata id when the listing has one, else a stable hash of article and name."""
    article: str
    kind: str
    """`see`, `do`, `eat`, `drink`, `buy`, `sleep`, `go` or anything else the author wrote."""
    name: str
    alt: str
    lat: float | None
    lng: float | None
    wikidata: str | None
    image: str | None
    """A Commons file name (`File:…`)."""
    address: str
    hours: str
    description: str


def _hours_value(parts: list[str]) -> str:
    """`{{hours|Пн|Пт|10||22}}` → «Пн–Пт 10:00–22:00»; empty days mean every day."""
    fields = [part.strip() for part in parts[1:]] + [""] * 6
    day_from, day_to, open_h, open_m, close_h, close_m = fields[:6]
    try:
        times = [int(value or "0") for value in (open_h, open_m, close_h, close_m)]
    except ValueError:
        return ""
    if not open_h or not close_h or not all(0 <= hour <= 24 for hour in times[::2]):
        return ""
    if not all(0 <= minute < 60 for minute in times[1::2]):
        return ""
    days = "–".join(day for day in (day_from, day_to) if day) or ALL_DAYS
    return f"{days} {times[0]}:{times[1]:02d}–{times[2]}:{times[3]:02d}"


def _render_template(match: re.Match[str]) -> str:
    """Known inline templates keep their meaning; anything else is dropped."""
    parts = match.group(0)[2:-2].split("|")
    return _hours_value(parts) if parts[0].strip().casefold() == "hours" else ""


def _render_link(match: re.Match[str]) -> str:
    target, _, label = match.group(1).partition("|")
    if target.strip().casefold().startswith(_FILE_PREFIXES):
        return ""
    return (label or target).strip()


def _unwrap(pattern: re.Pattern[str], replace: Callable[[re.Match[str]], str], text: str) -> str:
    """Replace innermost constructs first, so nested ones unwrap pass by pass."""
    for _ in range(_MAX_PASSES):
        text, count = pattern.subn(replace, text)
        if not count:
            break
    return text


def plain_text(wikitext: str, limit: int) -> str:
    """Visible text of a wikitext fragment: paragraphs kept, everything else flattened."""
    text = _REFERENCE.sub("", _COMMENT.sub("", wikitext))
    text = _LINE_BREAK.sub("\n", text)
    text = _unwrap(_INNER_TEMPLATE, _render_template, text)
    text = _unwrap(_INNER_LINK, _render_link, text)
    text = _EXTERNAL_LINK.sub(lambda match: match.group(1), text)
    text = _TAG.sub("", text).replace("{{", "").replace("}}", "").replace("[[", "").replace("]]", "")
    text = html.unescape(_EMPHASIS.sub("", text))
    lines = (free_text.single_line(line) for line in text.splitlines())
    text = "\n".join(line for line in lines if line)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,.;:-") + "…"


def _templates(wikitext: str) -> Iterator[str]:
    """Bodies of the top-level listing templates, braces balanced, in page order."""
    position = 0
    while (start := wikitext.find("{{", position)) != -1:
        depth, index = 0, start
        for token in re.finditer(r"\{\{|\}\}", wikitext[start : start + MAX_TEMPLATE_LENGTH]):
            depth += 1 if token.group(0) == "{{" else -1
            if depth == 0:
                index = start + token.end()
                break
        else:
            position = start + 2
            continue
        body = wikitext[start + 2 : index - 2]
        name = re.split(r"[|}]", body, maxsplit=1)[0].strip().casefold()
        if name in LISTING_TEMPLATES:
            yield body
            position = index
        else:
            position = start + 2


def _fields(body: str) -> tuple[str, dict[str, str]]:
    """Template name and `key=value` parameters split at top-level pipes only."""
    parts: list[str] = []
    depth, current = 0, []
    for token in re.split(r"(\{\{|\}\}|\[\[|\]\]|\|)", body):
        if token in ("{{", "[["):
            depth += 1
        elif token in ("}}", "]]"):
            depth = max(depth - 1, 0)
        elif token == "|" and depth == 0:
            parts.append("".join(current))
            current = []
            continue
        current.append(token)
    parts.append("".join(current))
    fields: dict[str, str] = {}
    for part in parts[1:]:
        key, separator, value = part.partition("=")
        if separator:
            fields.setdefault(key.strip().casefold(), value.strip())
    return parts[0].strip().casefold(), fields


def _first(fields: dict[str, str], keys: tuple[str, ...]) -> str:
    return next((fields[key] for key in keys if fields.get(key)), "")


def _coordinate(raw: str, bound: float) -> float | None:
    try:
        value = float(raw.replace(",", ".").strip())
    except ValueError:
        return None
    return value if math.isfinite(value) and abs(value) <= bound else None


def _file(raw: str) -> str | None:
    name = plain_text(raw, MAX_FIELD_LENGTH).replace("_", " ")
    if not name or "/" in name or name.startswith(("http:", "https:")):
        return None
    for prefix in _FILE_PREFIXES:
        if name.casefold().startswith(prefix):
            name = name[len(prefix) :]
    return f"File:{name.strip()}" if name.strip() else None


def listing_id(article: str, name: str, wikidata: str | None) -> str:
    if wikidata:
        return wikidata
    digest = hashlib.sha1(f"{article}|{name.casefold()}".encode()).hexdigest()
    return f"h{digest[:12]}"


def _listing(article: str, body: str) -> Listing | None:
    template, fields = _fields(body)
    kind = (fields.get("type") or template).strip().casefold()
    name = plain_text(fields.get("name", ""), MAX_NAME_LENGTH)
    if not name:
        return None
    lat = _coordinate(_first(fields, LAT_KEYS), 90)
    lng = _coordinate(_first(fields, LNG_KEYS), 180)
    wikidata = fields.get("wdid", "").strip().upper()
    wikidata_id = wikidata if _WIKIDATA_ID.match(wikidata) else None
    return Listing(
        listing_id=listing_id(article, name, wikidata_id),
        article=article,
        kind=kind,
        name=name,
        alt=plain_text(fields.get("alt", ""), MAX_NAME_LENGTH),
        lat=lat if lng is not None else None,
        lng=lng if lat is not None else None,
        wikidata=wikidata_id,
        image=_file(fields.get("image", "")),
        address=plain_text(fields.get("address", ""), MAX_FIELD_LENGTH),
        hours=plain_text(fields.get("hours", ""), MAX_FIELD_LENGTH),
        description=plain_text(_first(fields, DESCRIPTION_KEYS), MAX_DESCRIPTION_LENGTH),
    )


def parse_listings(article: str, wikitext: str) -> list[Listing]:
    """Listings of an article in page order; commented-out ones are ignored, duplicates of an
    earlier listing (same id) are dropped."""
    found: dict[str, Listing] = {}
    for body in _templates(_COMMENT.sub("", wikitext)):
        listing = _listing(article, body)
        if listing is not None:
            found.setdefault(listing.listing_id, listing)
    return list(found.values())
