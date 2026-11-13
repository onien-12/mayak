"""Which photo makes the best preview (SPEC §25). Pure rules, no neural networks.

A cover is shown in two shapes — a square thumbnail in lists and a wide strip at the top of a
card — so it is judged by how well it survives both crops, how large it is and, when the file is
ours to look at, by simple measurements of the picture itself: sharpness, exposure, contrast,
colour and whether it is a flat graphic (a screenshot, a document, a poster) rather than a photo.
"""

from collections.abc import Sequence
from dataclasses import dataclass

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
