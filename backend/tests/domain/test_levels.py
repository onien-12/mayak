from datetime import timedelta

import pytest

from app.domain import levels
from app.domain.enums import PlaceStatus, UserLevel, UserRole

OLD_ACCOUNT = timedelta(days=30)


@pytest.mark.parametrize(
    ("reputation", "expected"),
    [
        (-20, UserLevel.NEWCOMER),
        (0, UserLevel.NEWCOMER),
        (9, UserLevel.NEWCOMER),
        (10, UserLevel.RESIDENT),
        (49, UserLevel.RESIDENT),
        (50, UserLevel.TRUSTED),
        (149, UserLevel.TRUSTED),
        (150, UserLevel.EXPERT),
        (10_000, UserLevel.EXPERT),
    ],
)
def test_level_follows_reputation_thresholds(reputation: int, expected: UserLevel) -> None:
    assert levels.level_for(reputation) is expected


@pytest.mark.parametrize(
    ("level", "weight"),
    [
        (UserLevel.NEWCOMER, 0.5),
        (UserLevel.RESIDENT, 1.0),
        (UserLevel.TRUSTED, 1.5),
        (UserLevel.EXPERT, 2.0),
    ],
)
def test_vote_weight_by_level(level: UserLevel, weight: float) -> None:
    assert levels.vote_weight(level, UserRole.USER, OLD_ACCOUNT) == weight


def test_fresh_account_vote_weight_is_halved() -> None:
    assert levels.vote_weight(UserLevel.NEWCOMER, UserRole.USER, timedelta(hours=23)) == 0.25
    assert levels.vote_weight(UserLevel.NEWCOMER, UserRole.USER, timedelta(hours=24)) == 0.5


def test_staff_weight_ignores_level_and_account_age() -> None:
    assert levels.vote_weight(UserLevel.NEWCOMER, UserRole.MODERATOR, timedelta(hours=1)) == 3.0
    assert levels.vote_weight(UserLevel.EXPERT, UserRole.ADMIN, OLD_ACCOUNT) == 3.0


def test_author_prior_is_half_of_level_weight() -> None:
    assert levels.author_prior(UserLevel.NEWCOMER, UserRole.USER) == 0.25
    assert levels.author_prior(UserLevel.EXPERT, UserRole.USER) == 1.0
    assert levels.author_prior(UserLevel.RESIDENT, UserRole.MODERATOR) == 1.5


@pytest.mark.parametrize(
    ("level", "role", "status", "daily"),
    [
        (UserLevel.NEWCOMER, UserRole.USER, PlaceStatus.UNVERIFIED, 3),
        (UserLevel.RESIDENT, UserRole.USER, PlaceStatus.UNVERIFIED, 10),
        (UserLevel.TRUSTED, UserRole.USER, PlaceStatus.UNVERIFIED, 30),
        (UserLevel.EXPERT, UserRole.USER, PlaceStatus.PRELIMINARY, 100),
        (UserLevel.NEWCOMER, UserRole.MODERATOR, PlaceStatus.PRELIMINARY, 100),
    ],
)
def test_publishing_privileges(level: UserLevel, role: UserRole, status: PlaceStatus, daily: int) -> None:
    assert levels.initial_status(level, role) is status
    assert levels.daily_place_limit(level, role) == daily
    assert levels.publishes_directly(level, role) is True


def test_only_a_newcomer_is_on_probation() -> None:
    assert levels.is_on_probation(UserLevel.NEWCOMER, UserRole.USER) is True
    assert levels.is_on_probation(UserLevel.RESIDENT, UserRole.USER) is False
    assert levels.is_on_probation(UserLevel.NEWCOMER, UserRole.MODERATOR) is False


def test_respects_require_resident_level() -> None:
    assert not levels.can_send_respect(UserLevel.NEWCOMER, UserRole.USER)
    assert levels.can_send_respect(UserLevel.RESIDENT, UserRole.USER)
    assert levels.can_send_respect(UserLevel.NEWCOMER, UserRole.ADMIN)


def test_next_level() -> None:
    assert levels.next_level(0) == (UserLevel.RESIDENT, 10)
    assert levels.next_level(10) == (UserLevel.TRUSTED, 50)
    assert levels.next_level(72) == (UserLevel.EXPERT, 150)
    assert levels.next_level(150) is None
