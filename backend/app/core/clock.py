"""Single source of the current time, so the whole application agrees on "now"."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)
