"""The terms the experiment runs on, as pure functions (SPEC §20)."""

from datetime import datetime, timedelta

from app.domain.enums import Layer
from app.services.osm.mapping import UNNAMED_TITLES

CACHE_TTL = timedelta(days=7)
REQUEST_INTERVAL_S = 4.0
DAILY_REQUEST_CAP = 10_000
"""Default of `EXTERNAL_REVIEWS_DAILY_REQUEST_CAP`, per provider and rolling day."""
CAP_WINDOW = timedelta(days=1)
RETRY_FAILED_AFTER = timedelta(hours=1)
"""A refused or unreadable lookup is not an answer; that target is asked again after this."""
MAX_STORED_REVIEWS = 200
"""Ceiling of reviews kept per source and target, further pages included."""
RESPONSE_DEADLINE_S = 8.0
"""How long a card waits for a first fetch before answering with an empty list."""
REQUESTS_PER_FETCH = 2
"""A search page, then the organisation's reviews page."""
SOURCE_LABEL = "Яндекс Карты"
ELIGIBLE_LAYERS = frozenset({Layer.TOURISM, Layer.INFRASTRUCTURE})
_UNNAMED = frozenset(title.casefold() for title in UNNAMED_TITLES)


def is_fresh(fetched_at: datetime, now: datetime) -> bool:
    return now - fetched_at < CACHE_TTL


def may_retry_failed(fetched_at: datetime, now: datetime) -> bool:
    return now - fetched_at >= RETRY_FAILED_AFTER


def has_budget(used_today: int, requests: int = REQUESTS_PER_FETCH, cap: int = DAILY_REQUEST_CAP) -> bool:
    """Room for a whole fetch within the daily cap."""
    return used_today + requests <= cap


def is_named(title: str, category_name: str) -> bool:
    """A real name, not a title generated from the category («Детская площадка», «Видовая точка»)."""
    folded = title.strip().casefold()
    return folded != category_name.casefold() and folded not in _UNNAMED


def is_eligible_place(layer: Layer, title: str, category_name: str) -> bool:
    """Sights and named facilities exist as organisations at the source; events, issues and
    anonymous objects do not."""
    return layer in ELIGIBLE_LAYERS and is_named(title, category_name)
