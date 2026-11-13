"""Anti-abuse limits (SPEC §5): constants and pure checks."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.domain import geo, levels
from app.domain.enums import UserLevel, UserRole

DAY = timedelta(hours=24)
HOUR = timedelta(hours=1)

PLACE_COOLDOWN = timedelta(seconds=20)
NEARBY_RADIUS_M = 150.0
NEARBY_MAX_PLACES = 3

VOTES_PER_HOUR = 60
COMMENTS_PER_HOUR = 30
COMPLAINTS_PER_DAY_NEWCOMER = 5
COMPLAINTS_PER_DAY = 20
REVIEWS_PER_DAY_NEWCOMER = 5
RESPECTS_PER_DAY = 5
NOTES_PER_DAY_NEWCOMER = 5
NOTES_PER_DAY = 30
NOTE_REPORTS_TO_HIDE = 3
GEOMETRY_LOOKUPS_PER_HOUR = 30

REGISTRATIONS_PER_WINDOW = 10
REGISTRATION_WINDOW = HOUR
LOGINS_PER_WINDOW = 30
LOGIN_WINDOW = timedelta(minutes=10)
CAPTCHA_TTL = timedelta(minutes=5)

MAX_SUBSCRIPTIONS = 10
MAX_PHOTOS_PER_PLACE = 12
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_IMAGE_SIDE_PX = 1600


@dataclass(frozen=True, slots=True)
class RecentPlace:
    """A place created by the author during the last 24 hours."""

    lat: float
    lng: float
    created_at: datetime
    series_id: str | None


def _distinct_publications(places: Sequence[RecentPlace]) -> list[RecentPlace]:
    """A recurring series counts as one publication."""
    seen_series: set[str] = set()
    distinct: list[RecentPlace] = []
    for place in places:
        if place.series_id is not None:
            if place.series_id in seen_series:
                continue
            seen_series.add(place.series_id)
        distinct.append(place)
    return distinct


def publications_count(places: Sequence[RecentPlace]) -> int:
    return len(_distinct_publications(places))


def place_creation_violation(
    *, daily_limit: int, recent: Sequence[RecentPlace], lat: float, lng: float, now: datetime
) -> str | None:
    """Russian explanation of the violated limit, or None when creation is allowed."""
    publications = _distinct_publications(recent)
    if len(publications) >= daily_limit:
        return f"Достигнут дневной лимит публикаций для вашего уровня: {daily_limit}. Попробуйте завтра."
    if any(now - place.created_at < PLACE_COOLDOWN for place in publications):
        seconds = int(PLACE_COOLDOWN.total_seconds())
        return f"Слишком часто: между публикациями должно пройти {seconds} секунд."
    nearby = sum(
        1 for place in publications if geo.haversine_m(lat, lng, place.lat, place.lng) <= NEARBY_RADIUS_M
    )
    if nearby >= NEARBY_MAX_PLACES:
        return "Вы уже добавили несколько точек рядом за последние сутки. Проверьте, нет ли дублей."
    return None


def complaints_daily_limit(level: UserLevel, role: UserRole) -> int:
    if level is UserLevel.NEWCOMER and not levels.is_staff(role):
        return COMPLAINTS_PER_DAY_NEWCOMER
    return COMPLAINTS_PER_DAY


def notes_daily_limit(level: UserLevel, role: UserRole) -> int:
    if level is UserLevel.NEWCOMER and not levels.is_staff(role):
        return NOTES_PER_DAY_NEWCOMER
    return NOTES_PER_DAY


def reviews_daily_limit(level: UserLevel, role: UserRole) -> int | None:
    """Only cold-mode accounts are limited; None means no limit."""
    if level is UserLevel.NEWCOMER and not levels.is_staff(role):
        return REVIEWS_PER_DAY_NEWCOMER
    return None
