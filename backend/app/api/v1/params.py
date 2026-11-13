"""Parsing of compound query parameters shared by list endpoints."""

from enum import StrEnum

from app.core.errors import FieldValidationError
from app.domain import geo


def split_csv(raw: str | None) -> list[str]:
    return [part.strip() for part in (raw or "").split(",") if part.strip()]


def csv_ints(raw: str | None, field: str) -> tuple[int, ...]:
    try:
        return tuple(int(part) for part in split_csv(raw))
    except ValueError:
        raise FieldValidationError(field, "Ожидается список чисел через запятую.") from None


def csv_enums[E: StrEnum](raw: str | None, enum_class: type[E], field: str) -> tuple[E, ...]:
    try:
        return tuple(enum_class(part) for part in split_csv(raw))
    except ValueError:
        raise FieldValidationError(field, "Недопустимое значение в списке.") from None


def bbox(raw: str | None) -> geo.BBox | None:
    if raw is None:
        return None
    try:
        return geo.parse_bbox(raw)
    except ValueError:
        raise FieldValidationError("bbox", "Ожидается формат minLng,minLat,maxLng,maxLat.") from None


def lat_lng(raw: str | None, field: str) -> tuple[float, float] | None:
    """`<lat>,<lng>` → `(lat, lng)`."""
    if raw is None:
        return None
    try:
        lat, lng = (float(part) for part in raw.split(","))
    except ValueError:
        raise FieldValidationError(field, "Ожидается формат широта,долгота.") from None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise FieldValidationError(field, "Координаты вне допустимого диапазона.")
    return lat, lng
