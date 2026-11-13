"""Areas: how interesting a location is and when two locations are the same one (SPEC §17).

Geometry itself (containment, overlap, validation) lives in `domain.geometry`.
"""

import math
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.enums import Layer, PlaceStatus

STATUS_FACTORS: dict[PlaceStatus, float] = {
    PlaceStatus.VERIFIED: 1.0,
    PlaceStatus.PRELIMINARY: 0.7,
    PlaceStatus.UNVERIFIED: 0.4,
    PlaceStatus.NEEDS_REVIEW: 0.2,
}
NEUTRAL_RATING = 3.0
RATING_SPAN = 4.0
VARIETY_WEIGHT = 0.3
EVENT_WEIGHT = 0.5
INTEREST_SCALE = 5.0
MAX_HIGHLIGHTS = 5
DUPLICATE_OVERLAP_SHARE = 0.5
NESTED_AREA_RATIO = 0.25
COUNTED_LAYERS = frozenset({Layer.INFRASTRUCTURE, Layer.TOURISM})
"""Layers that make a location worth visiting; events add separately, issues never do."""
BACKGROUND_MAX_PLACES = 3

INTEREST_LABELS: tuple[tuple[int, str], ...] = (
    (25, "Пока мало отмечено"),
    (50, "Есть что посмотреть"),
    (75, "Интересное место"),
)
TOP_INTEREST_LABEL = "Очень интересно"


@dataclass(frozen=True, slots=True)
class CountedPlace:
    """A public infrastructure or tourism place inside an area."""

    category_id: int
    status: PlaceStatus
    rating_avg: float | None


def is_duplicate(overlap_share: float, first_area_m2: float, second_area_m2: float) -> bool:
    """Whether two territories describe the same location.

    They do when they overlap by more than half of the smaller one, unless the smaller is
    less than a quarter of the larger: that is a nested location (a square inside a district),
    which is allowed and wins the membership of the points it contains.
    """
    smaller, larger = sorted((first_area_m2, second_area_m2))
    is_nested = smaller < larger * NESTED_AREA_RATIO
    return overlap_share > DUPLICATE_OVERLAP_SHARE and not is_nested


def place_weight(status: PlaceStatus, rating_avg: float | None) -> float:
    """Contribution of one place: its verification status, nudged by its rating when rated."""
    rating_factor = 1.0 if rating_avg is None else 1 + (rating_avg - NEUTRAL_RATING) / RATING_SPAN
    return STATUS_FACTORS.get(status, 0.0) * rating_factor


def interest(places: Sequence[CountedPlace], upcoming_events: int) -> int:
    """0..100: how much there is to see and do, saturating as the location fills up."""
    if not places and not upcoming_events:
        return 0
    variety = max(len({place.category_id for place in places}) - 1, 0)
    total = (
        sum(place_weight(place.status, place.rating_avg) for place in places)
        + VARIETY_WEIGHT * variety
        + EVENT_WEIGHT * upcoming_events
    )
    return round(100 * (1 - math.exp(-total / INTEREST_SCALE)))


def interest_label(value: int) -> str:
    return next((label for threshold, label in INTEREST_LABELS if value < threshold), TOP_INTEREST_LABEL)


def highlights(places: Sequence[CountedPlace]) -> list[dict[str, int]]:
    """What is here: the most common categories, most places first."""
    counts = Counter(place.category_id for place in places)
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return [{"category_id": category_id, "count": count} for category_id, count in ranked[:MAX_HIGHLIGHTS]]


def mean_rating(places: Sequence[CountedPlace]) -> float | None:
    ratings = [place.rating_avg for place in places if place.rating_avg is not None]
    return round(sum(ratings) / len(ratings), 2) if ratings else None


def is_bare_background(
    imported: bool, places_count: int, community_places: int, community_events: int
) -> bool:
    """A small imported territory nobody has made anything in (SPEC §18): from OpenStreetMap, with
    at most three places and no residents' place or upcoming event inside. Kept and searchable,
    but not drawn on the «Карта» section by default — like a bare background place. One place or
    one upcoming event by a resident brings it back."""
    return (
        imported and places_count <= BACKGROUND_MAX_PLACES and community_places == 0 and community_events == 0
    )
