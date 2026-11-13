"""Anonymous Google Maps search and qv9Egd review preview; no browser or API key.

The observed anonymous feed is limited to five reviews. We never paginate it or claim it is
the complete review history. For some places it is empty although the search shows a rating and
a count: such a place is still ours, with the rating and without texts. Cookies come only
from Google's ordinary public responses. Photos come with the same two answers (verified
2026-11-13): the place's main photo in the search result and the photos visitors attached to the
previewed reviews — never a reviewer's avatar.
"""

from __future__ import annotations

import json
import re
from dataclasses import replace
from typing import TYPE_CHECKING, Any
from urllib.parse import urlencode

from app.services.experimental.external_reviews import client, parser
from app.services.experimental.external_reviews.google_protocol import SEARCH_PB
from app.services.experimental.external_reviews.parser import Organization, Review, UnexpectedPageError
from app.services.experimental.external_reviews.providers import FetchedReviews, GetPage, Lookup
from app.services.experimental.external_reviews.resolver import Resolver
from app.services.experimental.external_reviews.schemas import SourceName

if TYPE_CHECKING:
    from app.services.experimental.external_reviews.service import Target

HOME_URL = "https://www.google.com/maps?hl=ru&gl=ru"
SEARCH_URL = "https://www.google.com/search"
RPC_URL = "https://www.google.com/maps/_/MapsWizUi/data/batchexecute"
RPC_ID = "qv9Egd"
_FID = re.compile(r"0x[0-9a-f]{1,16}:0x[0-9a-f]{1,16}\Z")
_PHOTO = re.compile(
    r"(https://lh[0-9]\.googleusercontent\.com/(?!a/|a-/)[A-Za-z0-9_/-]{10,800})(?:=[\w-]*)?\Z"
)
"""A place photo of Google's image host (not an account avatar under `/a/`), with or without
its size options."""
PHOTO_SIZE = "=w1280-k-no"
"""The size options asked of the image host: 1280 px wide (the answers' own ask for 512 or less)."""


def _at(value: Any, *path: int) -> Any:
    for index in path:
        if not isinstance(value, list) or index >= len(value):
            return None
        value = value[index]
    return value


def photo_url(raw: Any) -> str | None:
    """The photo at its viewer size, or None for anything but a place photo of Google's host."""
    match = _PHOTO.match(raw) if isinstance(raw, str) else None
    return match.group(1) + PHOTO_SIZE if match else None


def search_url(target: Target) -> str:
    subject = target.subject
    query = client.search_query(subject.title)
    pb = (
        SEARCH_PB.replace("{QUERY}", query.replace("*", "*2A").replace("!", "*21"))
        .replace("{LAT}", str(subject.lat))
        .replace("{LNG}", str(subject.lng))
    )
    return (
        SEARCH_URL
        + "?"
        + urlencode({"tbm": "map", "authuser": "0", "hl": "ru", "gl": "ru", "q": query, "pb": pb})
    )


def parse_search(text: str) -> list[Organization]:
    try:
        root = json.loads(text.removeprefix(")]}'\n"))
    except ValueError as error:
        raise UnexpectedPageError("invalid Google search JSON") from error
    if not isinstance(root, list) or len(root) < 65:
        raise UnexpectedPageError("missing Google search envelope")
    entries = _at(root, 64)
    single = _at(root, 0, 1, 0, 14)
    if not entries and isinstance(_at(single, 11), str):
        entries = [[None, single]]
    if entries is None:
        # Google's result list slot exists, but contains no matches.
        return []
    if not isinstance(entries, list):
        raise UnexpectedPageError("malformed Google results")
    found = []
    for entry in entries:
        node = _at(entry, 1)
        identifier = _at(node, 10)
        title = parser.plain_text(_at(node, 11), parser.MAX_TITLE_LENGTH)
        lat, lng = parser._number(_at(node, 9, 2)), parser._number(_at(node, 9, 3))
        if not isinstance(identifier, str) or not _FID.fullmatch(identifier) or not title:
            raise UnexpectedPageError("malformed Google organisation")
        if lat is None or lng is None or not -90 <= lat <= 90 or not -180 <= lng <= 180:
            raise UnexpectedPageError("invalid Google organisation position")
        rating = parser._number(_at(node, 4, 7))
        count = parser._count(_at(node, 4, 8))
        main_photo = photo_url(_at(node, 37, 0, 0, 6, 0))
        found.append(
            Organization(
                identifier,
                title,
                lat,
                lng,
                rating if rating is not None and 0 < rating <= 5 else None,
                None,
                count,
                (main_photo,) if main_photo else (),
            )
        )
    return found


def review_request(identifier: str) -> client.FormPost:
    if not _FID.fullmatch(identifier):
        raise UnexpectedPageError("invalid Google feature ID")
    # The page's feed request: place ID, a ten-item preview and no pagination cursor.
    proto = [
        [[identifier], None, None, None, None, [None, None, None, [[1], [3]]]],
        [10, ""],
        None,
        None,
        [None, None, None, None, None, None, 81],
        None,
        None,
        [None, 1, 1, None, 1, None, 1, None, None, None, None, [1, 1, None, [[1]]]],
        None,
        None,
        [3, 1, None, None, None, [2]],
        None,
        [1],
    ]
    return client.FormPost(
        RPC_URL
        + "?"
        + urlencode(
            {"rpcids": RPC_ID, "source-path": "/maps", "hl": "ru", "gl": "ru", "_reqid": "1", "rt": "c"}
        ),
        {"f.req": json.dumps([[[RPC_ID, json.dumps(proto), None, "generic"]]])},
        {
            "X-Same-Domain": "1",
            "x-maps-diversion-context-bin": "CAE=",
            "Referer": "https://www.google.com/maps",
        },
    )


def _feed(text: str) -> list[Any]:
    for line in text.splitlines():
        if not line.startswith("["):
            continue
        try:
            rows = json.loads(line)
            if not isinstance(rows, list):
                continue
            for row in rows:
                if isinstance(row, list) and row[:2] == ["wrb.fr", RPC_ID]:
                    data = _at(row, 2)
                    payload = json.loads(data) if isinstance(data, str) else None
                    # Reviews sit in the third slot; a place with a couple of reviews gets no
                    # more slots, and a place without a preview gets an empty list.
                    if not isinstance(payload, list) or 0 < len(payload) < 3:
                        raise UnexpectedPageError("missing Google review payload")
                    return payload
        except json.JSONDecodeError as error:
            raise UnexpectedPageError("invalid Google review payload") from error
    raise UnexpectedPageError("missing Google reviews RPC")


def parse_reviews(text: str, organization: Organization) -> FetchedReviews:
    payload = _feed(text)
    entries = _at(payload, 2)
    if entries is None:
        entries = []
    if not isinstance(entries, list):
        raise UnexpectedPageError("malformed Google review preview")
    reviews = []
    photos = list(organization.photos)
    seen = set()
    low_id = int(organization.org_id.split(":")[1], 16)
    for entry in entries:
        raw = _at(entry, 0)
        identifier, business = _at(raw, 0), _at(raw, 1, 0)
        if (
            not isinstance(business, str)
            or not _FID.fullmatch(business)
            or int(business.split(":")[1], 16) != low_id
        ):
            raise UnexpectedPageError("Google review business mismatch")
        if not isinstance(identifier, str):
            raise UnexpectedPageError("missing Google review ID")
        text = _at(raw, 2, 15, 0, 0)
        if text is not None and not isinstance(text, str):
            raise UnexpectedPageError("malformed Google review text")
        text = parser.plain_text(text, parser.MAX_TEXT_LENGTH)
        if not text or identifier in seen:
            continue
        seen.add(identifier)
        attached = _at(raw, 2, 2)
        for photo in attached if isinstance(attached, list) else ():
            if (url := photo_url(_at(photo, 1, 6, 0))) is not None:
                photos.append(url)
        rating = parser._count(_at(raw, 2, 0, 0))
        # Relative date strings cannot safely become a precise publication timestamp.
        reviews.append(Review(rating if rating is not None and 1 <= rating <= 5 else None, text, None))
    if entries and not reviews and organization.reviews_count:
        raise UnexpectedPageError("Google returned ratings without review texts")
    organization = replace(organization, photos=tuple(dict.fromkeys(photos))[: parser.MAX_PHOTOS])
    return FetchedReviews(
        organization, reviews[: parser.MAX_REVIEWS], f"https://www.google.com/maps?cid={low_id}"
    )


class GoogleProvider:
    name: SourceName = "google"
    label = "Google Maps"
    max_requests = 3
    pages = False
    """The anonymous feed is a five-review preview."""

    def __init__(self) -> None:
        self._warmed = False

    async def fetch(self, target: Target, get: GetPage, resolver: Resolver) -> Lookup:
        try:
            if not self._warmed:
                await get(HOME_URL)
                self._warmed = True
            verdict = await resolver.resolve(target.subject, parse_search(await get(search_url(target))))
            found = verdict.organization
            if found is None:
                return Lookup(verdict)
            return Lookup(verdict, parse_reviews(await get(review_request(found.org_id)), found))
        except (client.SourceUnavailableError, UnexpectedPageError):
            self._warmed = False
            raise
