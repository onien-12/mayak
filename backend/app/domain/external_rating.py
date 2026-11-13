"""When to ask 2GIS again about an object's aggregate rating (SPEC §19)."""

from datetime import datetime, timedelta

CACHE_TTL = timedelta(days=7)
RETRY_AFTER_FAILURE = timedelta(days=1)
CAP_WINDOW = timedelta(days=1)
"""The daily cap is a rolling 24-hour window, like every other "per day" limit."""
TWOGIS_OBJECT_URL = "https://2gis.ru/vladivostok/geo/{object_id}"


def is_due(fetched_at: datetime | None, *, succeeded: bool, now: datetime) -> bool:
    """A cached answer lives a week; a failed request is retried after a day."""
    if fetched_at is None:
        return True
    return now - fetched_at >= (CACHE_TTL if succeeded else RETRY_AFTER_FAILURE)


def object_url(object_id: str) -> str:
    return TWOGIS_OBJECT_URL.format(object_id=object_id)
