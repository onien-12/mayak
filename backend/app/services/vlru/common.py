"""Pieces shared by the VL.ru parsers: local time and Russian dates."""

import re
from datetime import timedelta, timezone

CITY_TZ = timezone(timedelta(hours=10), "Asia/Vladivostok")

MONTHS: dict[str, int] = {
    "янв": 1,
    "фев": 2,
    "мар": 3,
    "апр": 4,
    "мая": 5,
    "май": 5,
    "июн": 6,
    "июл": 7,
    "авг": 8,
    "сен": 9,
    "окт": 10,
    "ноя": 11,
    "дек": 12,
}
DAY_MONTH_RE = re.compile(r"(\d{1,2})\s+([а-яё]{3})[а-яё]*\.?", re.IGNORECASE)
TIME_RE = re.compile(r"(\d{1,2}):(\d{2})")


def collapse_spaces(text: str) -> str:
    return " ".join(text.replace("\xa0", " ").split())


def day_and_month(text: str) -> tuple[int, int] | None:
    """«пт 18 дек.» → (18, 12); None when the text has no recognisable date."""
    match = DAY_MONTH_RE.search(text)
    if match is None:
        return None
    month = MONTHS.get(match.group(2).lower())
    day = int(match.group(1))
    return (day, month) if month and 1 <= day <= 31 else None


def hour_and_minute(text: str) -> tuple[int, int] | None:
    match = TIME_RE.search(text)
    if match is None:
        return None
    hour, minute = int(match.group(1)), int(match.group(2))
    return (hour, minute) if hour < 24 and minute < 60 else None
