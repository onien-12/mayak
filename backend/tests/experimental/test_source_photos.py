"""Photos that come with the answers the lookups already read: 2GIS and Google (SPEC §20)."""

import json
from copy import deepcopy
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

from app.services.experimental.external_reviews import google, parser, twogis
from app.services.experimental.external_reviews.client import SourceRefusedError
from app.services.experimental.external_reviews.matcher import Subject
from app.services.experimental.external_reviews.parser import Organization
from app.services.experimental.external_reviews.resolver import Resolver
from app.services.experimental.external_reviews.service import Target
from tests.experimental.test_google import envelope
from tests.experimental.test_twogis import CATALOGUE, CONFIG, ORG_ID, REVIEWS

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_2gis_keeps_the_photos_visitors_attached_to_shown_reviews() -> None:
    organization = Organization(
        "70000001024450259", "Приморский океанариум", 43.01, 131.93, None, None, None, ()
    )
    found = twogis.parse_reviews(json.dumps(fixture("twogis/reviews_with_photos.json")), organization)
    photos = found.organization.photos
    assert len(found.reviews) == 4
    assert len(photos) == 5, "the hidden photo and the one on a foreign host are left out"
    assert all(url.startswith("https://cachizer3.2gis.com/reviews-photos/") for url in photos)
    assert all(url.endswith("?w=1920") for url in photos), "the viewer size of preview_urls"
    assert len(set(photos)) == len(photos)
    assert "avatar" not in repr(found)


def test_2gis_reviews_hidden_from_readers_lend_no_photos() -> None:
    answer = fixture("twogis/reviews_with_photos.json")
    for review in answer["reviews"]:
        review["is_hidden"] = True
    answer["meta"]["total_count"] = 0
    organization = Organization("70000001024450259", "Океанариум", 43.01, 131.93, None, None, None, ())
    found = twogis.parse_reviews(json.dumps(answer), organization)
    assert found.organization.photos == ()


def test_google_main_photo_comes_with_the_search_and_review_photos_with_the_feed() -> None:
    found = google.parse_search(")]}'\n" + json.dumps(fixture("google/search_with_photos.json")))
    ocean = found[0]
    assert ocean.title == "Приморский океанариум Научно-образовательный комплекс"
    [main] = ocean.photos
    assert main.startswith("https://lh3.googleusercontent.com/grass-cs/")
    assert main.endswith(google.PHOTO_SIZE), "asked at the viewer's size, not the list's 145 px"

    result = google.parse_reviews(envelope(fixture("google/reviews_with_photos.json")), ocean)
    photos = result.organization.photos
    assert photos[0] == main, "the main photo first"
    assert len(photos) == 1 + 9
    assert all("SYNTHETIC-PLACE-PHOTO" in url for url in photos[1:])
    assert not any("/a/" in url or "/a-/" in url for url in photos), "never a reviewer's avatar"
    assert len(result.reviews) == 3


def test_google_photos_are_capped_and_only_from_its_image_host() -> None:
    assert google.photo_url("https://evil.example/grass-cs/x=k-no") is None
    assert google.photo_url("https://lh3.googleusercontent.com/a-/ALV-avatar=s120-c") is None
    assert google.photo_url("javascript:alert(1)") is None
    feed = fixture("google/reviews_with_photos.json")
    template = feed[2][0][0][2][2][0]
    feed[2][0][0][2][2] = [
        [
            f"p{index}",
            [*template[1][:6], [f"https://lh3.googleusercontent.com/grass-cs/PHOTO-{index:04d}=k-no"]],
        ]
        for index in range(parser.MAX_PHOTOS + 10)
    ]
    ocean = google.parse_search(")]}'\n" + json.dumps(fixture("google/search_with_photos.json")))[0]
    assert len(google.parse_reviews(envelope(feed), ocean).organization.photos) == parser.MAX_PHOTOS


def test_2gis_catalogue_names_the_main_photo_of_the_objects_own_album() -> None:
    answer = json.dumps(fixture("twogis/catalogue_with_photos.json"))
    [branch] = twogis.parse_catalogue(answer)
    assert branch.photos == ("https://i8.photo.2gis.com/main/branch/25/70000001024450259/common",)
    by_id = {item.org_id: item for item in twogis.parse_catalogue(answer, geo=True)}
    assert by_id["70030076460363066"].photos == (
        "https://i8.photo.2gis.com/main/geo/25/70030076460363066/view",
    )
    assert by_id["3519124403650895"].photos == (), "a park without an album of its own"

    found = twogis.parse_reviews(json.dumps(fixture("twogis/reviews_with_photos.json")), branch)
    assert found.organization.photos[0] == branch.photos[0], "the album's main photo first"
    assert len(found.organization.photos) == 1 + 5


def test_the_catalogue_is_asked_for_the_album_in_the_same_request() -> None:
    config = twogis.WebConfig("catalogue-key", "review-key")
    url = twogis.catalogue_url(config, Target(Subject("Приморский океанариум", 43.01, 131.93)))
    assert "items.external_content" in parse_qs(urlsplit(url).query)["fields"][0]


class AlbumPages:
    """2GIS answers for a bound object whose search answer and reviews carry no photo."""

    def __init__(self, *, album_refused: bool = False) -> None:
        self.requests: list[str] = []
        self.album_refused = album_refused

    async def get(self, url: str) -> str:
        self.requests.append(url)
        if url == twogis.HOME_URL:
            return CONFIG
        parts = urlsplit(url)
        query = {key: value[0] for key, value in parse_qs(parts.query).items()}
        if parts.hostname == "catalog.api.2gis.ru" and query["fields"] == "items.external_content":
            if self.album_refused:
                raise SourceRefusedError("HTTP 403")
            return json.dumps(fixture("twogis/catalogue_with_photos.json"))
        if parts.hostname == "catalog.api.2gis.ru":
            return json.dumps(CATALOGUE)
        reviews = deepcopy(REVIEWS)
        for review in reviews["reviews"]:
            review.pop("photos", None)
        return json.dumps(reviews)


OCEANARIUM = Target(Subject("Приморский океанариум", 43.01417, 131.930253), place_id=1, object_id=ORG_ID)


async def test_a_2gis_match_without_photos_asks_once_for_its_album() -> None:
    pages = AlbumPages()
    lookup = await twogis.TwoGisProvider().fetch(OCEANARIUM, pages.get, Resolver())
    assert lookup.found is not None
    assert lookup.found.organization.photos == (
        "https://i8.photo.2gis.com/main/branch/25/70000001024450259/common",
    )
    assert len(pages.requests) == 4, "keys, the object, its reviews and then its album"
    assert len(pages.requests) <= twogis.TwoGisProvider.max_requests


async def test_a_refused_album_leaves_the_match_without_photos() -> None:
    pages = AlbumPages(album_refused=True)
    lookup = await twogis.TwoGisProvider().fetch(OCEANARIUM, pages.get, Resolver())
    assert lookup.found is not None
    assert lookup.found.organization.photos == ()
    assert len(lookup.found.reviews) == 1, "the reviews stay"
    assert len(pages.requests) == 4, "never asked again, by another route or otherwise"
