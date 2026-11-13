"""Which photo makes the best preview (SPEC §25). Pure rules, no neural networks.

A cover is shown in two shapes — a square thumbnail in lists and a wide strip at the top of a
card — so it is judged by how well it survives both crops, how large it is and, when the file is
ours to look at, by simple measurements of the picture itself: sharpness, exposure, contrast,
colour and whether it is a flat graphic (a screenshot, a document, a poster) rather than a photo.

The map services' own photos (SPEC §20) come last: only an object with no cover at all from its
own, archive or imported photos borrows one, and it is shown with the service's mark and link.
"""

from collections.abc import Collection, Sequence
from dataclasses import dataclass

from app.domain import names

SHAPE_SHARE = 0.4
SIZE_SHARE = 0.2
PICTURE_SHARE = 0.4
UNKNOWN_PICTURE = 0.5
"""A hot-linked photo cannot be measured: it is neither rewarded nor punished for it."""
USABLE_SIDE_PX = 320
"""A resident's photo at least this large on its shorter side keeps archive photos off the cover."""
UNKNOWN_COVER = 0.5
"""A cover we know nothing about (an image hot-linked without its size): the middle."""
COVER_CANDIDATES = 8
"""A location chooses among the covers of its best places, not among all of them."""
CATALOGUE_ORDER = ("yandex", "google", "2gis")
"""Which map service's photos a borrowed cover is taken from first. Yandex and Google lead with
the place's main photo; 2GIS gives only what visitors attached to their latest reviews."""

BEST_RATIO = (1.2, 1.8)
"""Width / height that crops well both to a square and to a wide strip: 5:4 … 16:9."""
SQUARE_SCORE = 0.7
PORTRAIT_RATIO = 0.7
PORTRAIT_SCORE = 0.25
PANORAMA_RATIO = 2.8
PANORAMA_SCORE = 0.3

FULL_SIDE_PX = 600
"""The shorter side from which a photo is large enough for the widest slot at 2× density."""
MIN_SIDE_PX = 160

SHARPNESS_SHARE = 0.35
EXPOSURE_SHARE = 0.25
CONTRAST_SHARE = 0.15
COLOUR_SHARE = 0.15
PHOTO_SHARE = 0.10


@dataclass(frozen=True, slots=True)
class Picture:
    """Measurements of the pixels, each 0..1 (1 = good); see `app/services/photo_metrics.py`."""

    sharpness: float
    exposure: float
    contrast: float
    colour: float
    photo: float
    """1 for a photograph, towards 0 for a flat graphic of a few colours."""


@dataclass(frozen=True, slots=True)
class Candidate:
    width: int
    height: int
    own: bool
    """Uploaded by a resident (not a freely licensed archive photo)."""
    picture: Picture | None = None


def _between(value: float, low: float, high: float, at_low: float, at_high: float) -> float:
    """Linear from `at_low` at `low` to `at_high` at `high`, clamped outside."""
    if high == low:
        return at_high
    share = min(max((value - low) / (high - low), 0.0), 1.0)
    return at_low + share * (at_high - at_low)


def shape_score(width: int, height: int) -> float:
    """1 inside the best range; a square is fine, a tall portrait or a thin panorama is not."""
    if width <= 0 or height <= 0:
        return 0.0
    ratio = width / height
    low, high = BEST_RATIO
    if ratio < 1.0:
        return _between(ratio, PORTRAIT_RATIO, 1.0, PORTRAIT_SCORE, SQUARE_SCORE)
    if ratio < low:
        return _between(ratio, 1.0, low, SQUARE_SCORE, 1.0)
    if ratio <= high:
        return 1.0
    return _between(ratio, high, PANORAMA_RATIO, 1.0, PANORAMA_SCORE)


def size_score(width: int, height: int) -> float:
    return _between(min(width, height), MIN_SIDE_PX, FULL_SIDE_PX, 0.0, 1.0)


def picture_score(picture: Picture | None) -> float:
    if picture is None:
        return UNKNOWN_PICTURE
    return (
        SHARPNESS_SHARE * picture.sharpness
        + EXPOSURE_SHARE * picture.exposure
        + CONTRAST_SHARE * picture.contrast
        + COLOUR_SHARE * picture.colour
        + PHOTO_SHARE * picture.photo
    )


def score(candidate: Candidate) -> float:
    """0..1: how good a preview this photo makes."""
    return (
        SHAPE_SHARE * shape_score(candidate.width, candidate.height)
        + SIZE_SHARE * size_score(candidate.width, candidate.height)
        + PICTURE_SHARE * picture_score(candidate.picture)
    )


def is_usable(candidate: Candidate) -> bool:
    """Large enough to be shown as a cover at all."""
    return min(candidate.width, candidate.height) >= USABLE_SIDE_PX


def best(candidates: Sequence[Candidate]) -> int | None:
    """Index of the best preview; the earlier one among equals, None for no candidates.

    Residents' photos come first (SPEC §19): while there is a usable one, archive photos do not
    compete — the best of the residents' wins. Otherwise the best of everything.
    """
    if not candidates:
        return None
    own = [index for index, item in enumerate(candidates) if item.own and is_usable(item)]
    pool = own or range(len(candidates))
    return max(pool, key=lambda index: (score(candidates[index]), -index))


@dataclass(frozen=True, slots=True)
class CataloguePhotos:
    """Hot-linked photos a map service shows for the object, in the service's own order."""

    source: str
    urls: tuple[str, ...]
    page_url: str
    """The object's page at the service: where the photo's mark links to."""


@dataclass(frozen=True, slots=True)
class CatalogueCover:
    source: str
    url: str
    page_url: str


def catalogue_cover(
    current_cover: str | None, offers: Sequence[Sequence[CataloguePhotos]]
) -> CatalogueCover | None:
    """A cover borrowed from a map service, only for an object that has none of its own.

    `offers` come most fitting first — the object's own entries, then (for a location) those of
    its places, best place first. The first offer with a photo wins; within it the services go in
    `CATALOGUE_ORDER` and a service's photos in its own order: they carry no size to judge by.
    """
    if current_cover is not None:
        return None
    for offer in offers:
        ranked = sorted(
            (photos for photos in offer if photos.urls),
            key=lambda photos: _catalogue_rank(photos.source),
        )
        if ranked:
            first = ranked[0]
            return CatalogueCover(first.source, first.urls[0], first.page_url)
    return None


def shows_the_parent(
    place_title: str,
    parent_title: str | None,
    entry_id: str | None,
    entry_title: str | None,
    parent_entry_ids: Collection[str],
) -> bool:
    """The service's entry matched for a place is really the location it lies in — the very entry
    matched for that location, or one that names it («Нагорный парк» for «Смотровая Нагорного
    парка»). Its photos show the whole, not the place, so the place borrows none of them. A place
    named as its location («Покровский парк» in the park of that name) is that location's own
    object and keeps them."""
    if parent_title is None or names.same_name(place_title, parent_title):
        return False
    if entry_id is not None and entry_id in parent_entry_ids:
        return True
    return (
        entry_title is not None
        and names.names_the_whole(parent_title, entry_title)
        and not names.same_name(entry_title, place_title)
    )


def _catalogue_rank(source: str) -> int:
    return CATALOGUE_ORDER.index(source) if source in CATALOGUE_ORDER else len(CATALOGUE_ORDER)
