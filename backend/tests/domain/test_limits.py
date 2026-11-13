from datetime import UTC, datetime, timedelta

from app.domain import limits
from app.domain.enums import UserLevel, UserRole
from app.domain.limits import RecentPlace

NOW = datetime(2026, 11, 11, 12, 0, tzinfo=UTC)
LAT, LNG = 43.1155, 131.8855


def _recent(
    minutes_ago: float, *, lat: float = 43.2, lng: float = 131.95, series: str | None = None
) -> RecentPlace:
    return RecentPlace(lat, lng, NOW - timedelta(minutes=minutes_ago), series)


def _violation(recent: list[RecentPlace], daily_limit: int = 10) -> str | None:
    return limits.place_creation_violation(daily_limit=daily_limit, recent=recent, lat=LAT, lng=LNG, now=NOW)


def test_no_recent_places_no_violation() -> None:
    assert _violation([]) is None


def test_daily_limit() -> None:
    recent = [_recent(60 + index) for index in range(3)]
    assert _violation(recent, daily_limit=4) is None
    assert "дневной лимит" in (_violation(recent, daily_limit=3) or "")


def test_cooldown_of_twenty_seconds() -> None:
    assert "Слишком часто" in (_violation([_recent(19 / 60)]) or "")
    assert _violation([_recent(21 / 60)]) is None


def test_at_most_three_places_within_150_metres() -> None:
    nearby = [_recent(30 + index, lat=LAT + 0.0005, lng=LNG) for index in range(3)]
    assert _violation(nearby[:2]) is None
    assert "рядом" in (_violation(nearby) or "")


def test_places_further_than_150_metres_do_not_count_as_nearby() -> None:
    far = [_recent(30 + index, lat=LAT + 0.002, lng=LNG) for index in range(5)]
    assert _violation(far) is None


def test_recurring_series_counts_as_one_publication() -> None:
    series = [_recent(30, lat=LAT, lng=LNG, series="weekly") for _ in range(12)]
    assert limits.publications_count(series) == 1
    assert _violation(series, daily_limit=3) is None


def test_complaint_limits_by_level() -> None:
    assert limits.complaints_daily_limit(UserLevel.NEWCOMER, UserRole.USER) == 5
    assert limits.complaints_daily_limit(UserLevel.RESIDENT, UserRole.USER) == 20
    assert limits.complaints_daily_limit(UserLevel.NEWCOMER, UserRole.MODERATOR) == 20


def test_review_limit_only_in_cold_mode() -> None:
    assert limits.reviews_daily_limit(UserLevel.NEWCOMER, UserRole.USER) == 5
    assert limits.reviews_daily_limit(UserLevel.RESIDENT, UserRole.USER) is None
