"""Event phase: computed on read, never stored (SPEC §3.4)."""

from datetime import datetime, timedelta

from app.domain.enums import EventPhase

SOON_WINDOW = timedelta(hours=3)
UNJOINABLE_PHASES = frozenset({EventPhase.CLOSED, EventPhase.FINISHED, EventPhase.CANCELLED})


def is_full(capacity: int | None, participants_count: int) -> bool:
    return bool(capacity) and participants_count >= capacity


def event_phase(
    *,
    now: datetime,
    starts_at: datetime,
    ends_at: datetime,
    is_cancelled: bool,
    registration_closed: bool,
    capacity: int | None,
    participants_count: int,
) -> EventPhase:
    if is_cancelled:
        return EventPhase.CANCELLED
    if now > ends_at:
        return EventPhase.FINISHED
    if starts_at <= now:
        return EventPhase.ONGOING
    if starts_at - now <= SOON_WINDOW:
        return EventPhase.SOON
    if registration_closed or is_full(capacity, participants_count):
        return EventPhase.CLOSED
    return EventPhase.OPEN


def seats_left(capacity: int | None, participants_count: int) -> int | None:
    if capacity is None:
        return None
    return max(capacity - participants_count, 0)


def join_refusal(
    phase: EventPhase, *, registration_closed: bool, capacity: int | None, participants_count: int
) -> str | None:
    """Russian reason why joining is impossible, or None when the event accepts participants.

    `soon` and `ongoing` take precedence over `closed` in the phase, so a full or closed
    registration is checked separately.
    """
    if phase is EventPhase.CANCELLED:
        return "Событие отменено."
    if phase is EventPhase.FINISHED:
        return "Событие уже завершилось."
    if registration_closed:
        return "Регистрация на событие закрыта."
    if is_full(capacity, participants_count):
        return "Свободных мест не осталось."
    return None
