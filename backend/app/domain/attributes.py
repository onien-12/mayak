"""Category-driven place attributes: coercion on write and equality filters on read."""

import math
from collections.abc import Mapping, Sequence
from typing import Any

from app.domain.enums import FieldType

AttributeValue = str | int | float | bool

MAX_TEXT_LENGTH = 200
_TRUE_WORDS = frozenset({"true", "1", "yes", "да"})
_FALSE_WORDS = frozenset({"false", "0", "no", "нет"})


class InvalidAttributeError(ValueError):
    """Raised with a Russian message when a value does not fit its field definition."""

    def __init__(self, key: str, message: str) -> None:
        super().__init__(message)
        self.key = key
        self.message = message


def _coerce_boolean(key: str, value: Any) -> bool:
    if isinstance(value, bool):
        return value
    word = str(value).strip().lower()
    if word in _TRUE_WORDS:
        return True
    if word in _FALSE_WORDS:
        return False
    raise InvalidAttributeError(key, "Ожидается значение «да» или «нет»")


def _coerce_number(key: str, value: Any) -> int | float:
    if isinstance(value, bool):
        raise InvalidAttributeError(key, "Ожидается число")
    try:
        number = float(str(value).replace(",", ".")) if isinstance(value, str) else float(value)
    except (TypeError, ValueError):
        raise InvalidAttributeError(key, "Ожидается число") from None
    if not math.isfinite(number):
        raise InvalidAttributeError(key, "Ожидается число")
    return int(number) if number.is_integer() else number


def _coerce_text(key: str, value: Any) -> str:
    text = str(value).strip()
    if len(text) > MAX_TEXT_LENGTH:
        raise InvalidAttributeError(key, f"Не длиннее {MAX_TEXT_LENGTH} символов")
    return text


def _coerce_select(key: str, value: Any, field: Mapping[str, Any]) -> str:
    choice = str(value)
    allowed = {option["value"] for option in field.get("options") or ()}
    if choice not in allowed:
        raise InvalidAttributeError(key, "Выберите значение из списка")
    return choice


def coerce_attributes(
    fields: Sequence[Mapping[str, Any]], raw: Mapping[str, Any] | None
) -> dict[str, AttributeValue]:
    """Keep only keys declared by the category, coerced to the declared type.

    Unknown keys, nulls and empty strings are dropped; a wrong type raises `InvalidAttributeError`.
    """
    if not raw:
        return {}
    result: dict[str, AttributeValue] = {}
    for field in fields:
        key = field["key"]
        value = raw.get(key)
        if value is None or value == "":
            continue
        match FieldType(field["type"]):
            case FieldType.BOOLEAN:
                result[key] = _coerce_boolean(key, value)
            case FieldType.NUMBER:
                result[key] = _coerce_number(key, value)
            case FieldType.TEXT:
                text = _coerce_text(key, value)
                if text:
                    result[key] = text
            case FieldType.SELECT:
                result[key] = _coerce_select(key, value, field)
    return result


def _canonical(value: AttributeValue) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip().lower()


def parse_attr_filters(raw: str) -> dict[str, str]:
    """`free:true,accessible:true` → {"free": "true", ...}; raises ValueError on malformed pairs."""
    filters: dict[str, str] = {}
    for pair in filter(None, (part.strip() for part in raw.split(","))):
        key, separator, value = pair.partition(":")
        if not separator or not key.strip():
            raise ValueError(f"malformed attribute filter: {pair}")
        filters[key.strip()] = value.strip().lower()
    return filters


def matches_filters(attributes: Mapping[str, AttributeValue], filters: Mapping[str, str]) -> bool:
    return all(key in attributes and _canonical(attributes[key]) == value for key, value in filters.items())
