"""The anonymous 2GIS web client's HTTP interface (verified 2026-11-11).

Public keys come from the homepage, not the project's paid Places subscription. Requests use
fixed service hosts; neither remote configuration nor pagination links can redirect this client.
Up to 30 reviews come with one request; a map object's further reviews can be paged on demand
(the organisations' address has no paging parameter verified yet). Review authors, replies and
profiles are discarded here.

The catalogue holds organisations (`branch`) and map objects — bridges, squares, embankments,
hills (`building`, `adm_div`, `attraction`). Organisations are searched first; when none is ours,
map objects are searched. Their reviews live at another address of the same service. When the
rules accept neither, the judge sees both answers together, so the quarter «Миллионка» (`adm_div`)
can win over the restaurant of the same name.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field, replace
from typing import TYPE_CHECKING, Any
from urllib.parse import urlencode

from app.services.experimental.external_reviews import client, matcher, parser
from app.services.experimental.external_reviews.parser import Organization, Review, UnexpectedPageError
from app.services.experimental.external_reviews.providers import FetchedReviews, GetPage, Lookup, ReviewPage
from app.services.experimental.external_reviews.resolver import (
    EXPLICIT_ID,
    EXPLICIT_ID_REJECTED,
    Resolver,
    Verdict,
)
from app.services.experimental.external_reviews.schemas import SourceName

if TYPE_CHECKING:
    from app.services.experimental.external_reviews.service import Target

HOME_URL = "https://2gis.ru/"
CATALOGUE_URL = "https://catalog.api.2gis.ru/3.0/"
REVIEWS_URL = "https://public-api.reviews.2gis.com/2.0/branches/{org_id}/reviews"
GEO_REVIEWS_URL = "https://public-api.reviews.2gis.com/3.0/geo/{org_id}/reviews"
GEO_SEARCH_TYPES = "attraction,adm_div.place,adm_div.district,building"
GEO_KINDS = frozenset({"attraction", "adm_div", "building"})
"""Item types of map objects in catalogue answers; stops and streets carry no reviews."""
CONFIG_TTL_S = 24 * 60 * 60
PAGE_SIZE = 50
"""Reviews per further page, as the web client asks the map objects' address."""
SEARCH_RESULTS = 20
# The public web client's catalogue request checksum, from its rM/48442 modules.
REQUEST_SEED = "baf4c54e9dae"
_ID = re.compile(r"[0-9]{1,32}\Z")
_SEARCH_ID = re.compile(r"([0-9]{1,32})(?:_[a-zA-Z0-9_-]+)?\Z")


@dataclass(frozen=True, slots=True)
class WebConfig:
    catalogue_key: str = field(repr=False)
    review_key: str = field(repr=False)


def parse_config(html: str) -> WebConfig:
    values = []
    for name in ("webApiKey", "reviewApiKey"):
        match = re.search(r'"' + name + r'"\s*:\s*"([a-zA-Z0-9_-]{1,256})"', html)
        if match is None:
            raise UnexpectedPageError("missing 2GIS web configuration")
        values.append(match.group(1))
    return WebConfig(*values)


def request_checksum(path: str, params: dict[str, str]) -> str:
    """The web bundle's unsigned hash over sorted values, using JS UTF-16 code units."""

    def hash_text(text: str, value: int = 5381) -> int:
        raw = text.encode("utf-16-le")
        for offset in range(0, len(raw), 2):
            value = (value * 33 + int.from_bytes(raw[offset : offset + 2], "little")) & 0xFFFFFFFF
        return value

    return str(hash_text(REQUEST_SEED, hash_text(path + "".join(params[key] for key in sorted(params)))))


def catalogue_url(config: WebConfig, target: Target, *, geo: bool = False) -> str:
    """By the bound ID when there is one; otherwise a search for organisations or map objects."""
    params = {"key": config.catalogue_key, "fields": "items.point,items.reviews", "locale": "ru_RU"}
    if target.object_id:
        if not _ID.fullmatch(target.object_id):
            raise UnexpectedPageError("invalid 2GIS object ID")
        endpoint = "items/byid"
        params["id"] = target.object_id
    else:
        endpoint = "items"
        subject = target.subject
        params.update(
            q=client.search_query(subject.title),
            location=f"{subject.lng},{subject.lat}",
            type=GEO_SEARCH_TYPES if geo else "branch",
            page_size=str(SEARCH_RESULTS),
        )
    params["r"] = request_checksum("/3.0/" + endpoint, params)
    return CATALOGUE_URL + endpoint + "?" + urlencode(params)


def _payload(text: str) -> dict[str, Any]:
    try:
        payload = json.loads(text)
    except ValueError as error:
        raise UnexpectedPageError("invalid 2GIS JSON") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("meta"), dict):
        raise UnexpectedPageError("missing 2GIS response metadata")
    return payload


def reviews_url(
    config: WebConfig, org_id: str, *, geo: bool = False, offset: int = 0, limit: int = parser.MAX_REVIEWS
) -> str:
    """The first page of an organisation's reviews, or any page of a map object's: our own
    `offset`/`limit` on the fixed host, never the answer's `next_link`."""
    if geo:
        params = {
            "key": config.review_key,
            "limit": limit,
            "offset": offset,
            "locale": "ru_RU",
            "fields": "meta.geo_rating,meta.geo_reviews_count,meta.total_count",
        }
        return GEO_REVIEWS_URL.format(org_id=org_id) + "?" + urlencode(params)
    params = {
        "key": config.review_key,
        "limit": parser.MAX_REVIEWS,
        "sort_by": "date_created",
        "rated": "true",
        "locale": "ru_RU",
        "fields": "meta.branch_rating,meta.branch_reviews_count,meta.total_count",
    }
    return REVIEWS_URL.format(org_id=org_id) + "?" + urlencode(params)


def parse_catalogue(text: str, *, geo: bool = False) -> list[Organization]:
    """Organisations of the answer, or its map objects with `geo`."""
    payload = _payload(text)
    if payload["meta"].get("code") == 404:
        return []
    if payload["meta"].get("code") != 200:
        raise UnexpectedPageError("2GIS catalogue rejected the request")
    result = payload.get("result")
    items = result.get("items") if isinstance(result, dict) else None
    if not isinstance(items, list):
        raise UnexpectedPageError("missing 2GIS catalogue items")
    found = []
    for item in items:
        if not isinstance(item, dict):
            raise UnexpectedPageError("malformed 2GIS catalogue item")
        kind = item.get("type")
        if not (kind in GEO_KINDS if geo else kind == "branch"):
            continue
        identifier, point, rating = item.get("id"), item.get("point"), item.get("reviews")
        if geo and (not item.get("name") or not isinstance(point, dict)):
            # Unnamed structures and outlines without a pin cannot be anybody's match.
            continue
        match = _SEARCH_ID.fullmatch(identifier) if isinstance(identifier, str) else None
        if match is None or not isinstance(point, dict):
            raise UnexpectedPageError("malformed 2GIS organisation")
        identifier = match.group(1)
        lat, lng = parser._number(point.get("lat")), parser._number(point.get("lon"))
        title = parser.plain_text(item.get("name"), parser.MAX_TITLE_LENGTH)
        if lat is None or lng is None or not -90 <= lat <= 90 or not -180 <= lng <= 180 or not title:
            raise UnexpectedPageError("invalid 2GIS organisation position or name")
        rating = rating if isinstance(rating, dict) else {}
        value = parser._number(rating.get("general_rating"))
        found.append(
            Organization(
                identifier,
                title,
                lat,
                lng,
                value if value is not None and 0 < value <= 5 else None,
                parser._count(rating.get("general_review_count_with_stars")),
                parser._count(rating.get("general_review_count")),
                (),
                kind,
            )
        )
    return found


def _page(text: str, org_id: str, *, geo: bool, offset: int) -> tuple[dict[str, Any], ReviewPage]:
    """The validated metadata and the reviews of one answer of a reviews address."""
    payload = _payload(text)
    meta, raw_reviews = payload["meta"], payload.get("reviews")
    subject = "geo" if geo else "branch"
    count = parser._count(meta.get(f"{subject}_reviews_count"))
    total = parser._count(meta.get("total_count"))
    # The map objects' address answers without a status code of its own.
    denied = not geo and meta.get("code") != 200
    if denied or not isinstance(raw_reviews, list) or count is None or total is None:
        raise UnexpectedPageError("missing 2GIS review results")
    if not raw_reviews and total > offset:
        raise UnexpectedPageError("inconsistent 2GIS review count")
    reviews: list[Review] = []
    seen = set()
    for raw in raw_reviews:
        if not isinstance(raw, dict) or not isinstance(raw.get("object"), dict):
            raise UnexpectedPageError("malformed 2GIS review")
        if raw["object"].get("id") != org_id or (raw["object"].get("type") == "branch") == geo:
            raise UnexpectedPageError("2GIS review business mismatch")
        if raw.get("is_hidden") is True or raw.get("on_moderation") is True:
            continue
        if geo and raw.get("text") is None:
            continue
        if not isinstance(raw.get("text"), str) or not isinstance(raw.get("id"), str):
            raise UnexpectedPageError("malformed 2GIS review text or ID")
        text = parser.plain_text(raw["text"], parser.MAX_TEXT_LENGTH)
        key = (str(raw.get("provider", "")), raw["id"])
        if not text or key in seen:
            continue
        seen.add(key)
        rating = parser._count(raw.get("rating"))
        reviews.append(
            Review(
                rating if rating is not None and 1 <= rating <= 5 else None,
                text,
                parser._published_at(raw.get("date_created")),
            )
        )
    end = offset + len(raw_reviews)
    # Only map objects page (`reviews_url`); an answer that brings nothing ends the paging.
    return meta, ReviewPage(reviews, end if geo and raw_reviews and end < total else None)


def parse_reviews(text: str, organization: Organization, *, geo: bool = False) -> FetchedReviews:
    meta, page = _page(text, organization.org_id, geo=geo, offset=0)
    subject = "geo" if geo else "branch"
    value = parser._number(meta.get(f"{subject}_rating"))
    organization = replace(
        organization,
        rating=value if value is not None and 0 < value <= 5 else None,
        reviews_count=parser._count(meta.get(f"{subject}_reviews_count")),
    )
    return FetchedReviews(
        organization,
        page.reviews[: parser.MAX_REVIEWS],
        f"https://2gis.ru/vladivostok/{'geo' if geo else 'firm'}/{organization.org_id}/tab/reviews",
        page.next_offset,
    )


def parse_review_page(text: str, org_id: str, offset: int) -> ReviewPage:
    """A further page of a map object's reviews."""
    return _page(text, org_id, geo=True, offset=offset)[1]


class TwoGisProvider:
    name: SourceName = "2gis"
    label = "2ГИС"
    max_requests = 4
    pages = True
    max_page_requests = 2
    """The public keys, when no longer cached, and the page."""

    def __init__(self) -> None:
        self._config: WebConfig | None = None
        self._config_at = 0.0

    async def _web_config(self, get: GetPage) -> WebConfig:
        if self._config is None or time.monotonic() - self._config_at >= CONFIG_TTL_S:
            self._config = parse_config(await get(HOME_URL))
            self._config_at = time.monotonic()
        return self._config

    async def fetch(self, target: Target, get: GetPage, resolver: Resolver) -> Lookup:
        config = await self._web_config(get)
        try:
            verdict = await self._find(config, target, get, resolver)
            found = verdict.organization
            if found is None:
                return Lookup(verdict)
            geo = found.kind in GEO_KINDS
            answer = await get(reviews_url(config, found.org_id, geo=geo))
            return Lookup(verdict, parse_reviews(answer, found, geo=geo))
        except (client.SourceUnavailableError, UnexpectedPageError):
            # A later permitted attempt must rediscover keys; never loop on rejected credentials.
            self._config = None
            raise

    async def next_page(self, org_id: str, offset: int, get: GetPage) -> ReviewPage:
        """`PAGE_SIZE` more reviews of a map object from `offset`, in one request while the public
        keys are cached (they are rediscovered first otherwise)."""
        config = await self._web_config(get)
        try:
            url = reviews_url(config, org_id, geo=True, offset=offset, limit=PAGE_SIZE)
            return parse_review_page(await get(url), org_id, offset)
        except (client.SourceUnavailableError, UnexpectedPageError):
            self._config = None
            raise

    async def _find(self, config: WebConfig, target: Target, get: GetPage, resolver: Resolver) -> Verdict:
        """Our object among the organisations, else among the map objects, else the judge's pick
        from both answers."""
        subject = target.subject
        if target.object_id:
            answer = await get(catalogue_url(config, target))
            for geo in (False, True):
                found = matcher.linked(subject, parse_catalogue(answer, geo=geo), target.object_id)
                if found is not None:
                    return Verdict(found, EXPLICIT_ID)
            return Verdict(None, EXPLICIT_ID_REJECTED)
        organisations = parse_catalogue(await get(catalogue_url(config, target)))
        verdict = resolver.by_rules(subject, organisations)
        if verdict is not None:
            return verdict
        objects = parse_catalogue(await get(catalogue_url(config, target, geo=True)), geo=True)
        return resolver.by_rules(subject, objects) or await resolver.by_judgement(
            subject, [*organisations, *objects]
        )
