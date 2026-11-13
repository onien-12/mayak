from datetime import UTC, datetime, timedelta

import pytest

from app.domain import event_phase
from app.domain.enums import EventPhase

NOW = datetime(2026, 11, 11, 12, 0, tzinfo=UTC)


def _phase(starts_in_hours: float, duration_hours: float = 2, **overrides: object) -> EventPhase:
    starts_at = NOW + timedelta(hours=starts_in_hours)
    params: dict[str, object] = {
        "now": NOW,
        "starts_at": starts_at,
        "ends_at": starts_at + timedelta(hours=duration_hours),
        "is_cancelled": False,
        "registration_closed": False,
        "capacity": None,
        "participants_count": 0,
    }
    params.update(overrides)
    return event_phase.event_phase(**params)  # type: ignore[arg-type]


def test_open_by_default() -> None:
    assert _phase(48) is EventPhase.OPEN


def test_soon_within_three_hours_of_start() -> None:
    assert _phase(3) is EventPhase.SOON
    assert _phase(3.01) is EventPhase.OPEN


def test_ongoing_between_start_and_end_inclusive() -> None:
    assert _phase(0) is EventPhase.ONGOING
    assert _phase(-2, duration_hours=2) is EventPhase.ONGOING


def test_finished_after_end() -> None:
    assert _phase(-3, duration_hours=2) is EventPhase.FINISHED


def test_cancelled_wins_over_everything() -> None:
    assert _phase(-10, is_cancelled=True) is EventPhase.CANCELLED
    assert _phase(1, is_cancelled=True) is EventPhase.CANCELLED


def test_closed_when_registration_closed_or_full() -> None:
    assert _phase(48, registration_closed=True) is EventPhase.CLOSED
    assert _phase(48, capacity=10, participants_count=10) is EventPhase.CLOSED
    assert _phase(48, capacity=10, participants_count=9) is EventPhase.OPEN


def test_soon_and_ongoing_take_precedence_over_closed() -> None:
    assert _phase(1, capacity=1, participants_count=1) is EventPhase.SOON
    assert _phase(-1, registration_closed=True) is EventPhase.ONGOING


def test_seats_left() -> None:
    assert event_phase.seats_left(None, 5) is None
    assert event_phase.seats_left(10, 4) == 6
    assert event_phase.seats_left(10, 12) == 0


@pytest.mark.parametrize("phase", [EventPhase.OPEN, EventPhase.SOON, EventPhase.ONGOING])
def test_joinable_phases(phase: EventPhase) -> None:
    refusal = event_phase.join_refusal(phase, registration_closed=False, capacity=5, participants_count=4)
    assert refusal is None


@pytest.mark.parametrize("phase", [EventPhase.FINISHED, EventPhase.CANCELLED])
def test_finished_and_cancelled_cannot_be_joined(phase: EventPhase) -> None:
    assert event_phase.join_refusal(phase, registration_closed=False, capacity=None, participants_count=0)


def test_full_or_closed_event_cannot_be_joined_even_when_soon() -> None:
    assert event_phase.join_refusal(
        EventPhase.SOON, registration_closed=False, capacity=2, participants_count=2
    )
    assert event_phase.join_refusal(
        EventPhase.ONGOING, registration_closed=True, capacity=None, participants_count=0
    )
