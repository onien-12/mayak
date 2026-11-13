"""Our rating blended with what external catalogues say (SPEC §22).

A separate figure next to `rating_avg`, never a replacement: our own rating, trust, interest,
sorting and filters do not use it.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

OWN_SOURCE = "mayak"
OWN_WEIGHT_FACTOR = 2.0
"""Our residents' ratings count double against a catalogue's of the same size."""
UNKNOWN_COUNT_WEIGHT = 1.0
MIN_RATING = 1.0
MAX_RATING = 5.0


@dataclass(frozen=True, slots=True)
class RatingPart:
    source: str
    rating: float
    count: int | None
    """How many ratings stand behind it; None when the source does not say."""


@dataclass(frozen=True, slots=True)
class CombinedRating:
    value: float
    count: int
    parts: list[RatingPart]


def weight(part: RatingPart) -> float:
    """`log10(1 + count)`, 1.0 when the count is unknown, ×2 for our own part."""
    base = UNKNOWN_COUNT_WEIGHT if part.count is None else math.log10(1 + part.count)
    return base * (OWN_WEIGHT_FACTOR if part.source == OWN_SOURCE else 1.0)


def combine(own: RatingPart | None, external: Sequence[RatingPart]) -> CombinedRating | None:
    """The weighted mean of our part and the sources' parts, rounded to 0.1.

    None without an external part: then there is nothing to blend and `rating_avg` stands alone.
    A part whose count is zero weighs nothing and is left out.
    """
    parts = [part for part in ([own] if own is not None else []) + list(external) if weight(part) > 0]
    if not any(part.source != OWN_SOURCE for part in parts):
        return None
    total = sum(weight(part) for part in parts)
    value = sum(part.rating * weight(part) for part in parts) / total
    return CombinedRating(
        value=round(min(MAX_RATING, max(MIN_RATING, value)), 1),
        count=sum(part.count for part in parts if part.count is not None),
        parts=parts,
    )
