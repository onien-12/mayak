"""Pure parsers of the VL.ru outage pages (SPEC §15). Input is untrusted HTML."""

import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from selectolax.lexbor import LexborHTMLParser

from app.domain.enums import OutageResource
from app.domain.outages import House
from app.services.vlru.common import CITY_TZ, collapse_spaces, day_and_month, hour_and_minute

_NUMBER_RE = re.compile(r"№\s*(\d+)")
_COUNT_RE = re.compile(r"(\d+)\s+(адрес|жалоб)")
_RESOURCE_CLASS_RE = re.compile(r"blackout-summary__resource-icon_([a-z_]+)")
_PERIOD_SEPARATOR = "—"
_NO_INITIATOR = "-"
_FUTURE_START_SLACK = timedelta(days=2)


@dataclass(frozen=True, slots=True)
class MapBlackout:
    resource: OutageResource
    description: str


@dataclass(frozen=True, slots=True)
class MapBuilding:
    house: House
    complaints_count: int
    blackout_numbers: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class OutageMap:
    """The map view: which houses are affected by which outage."""

    blackouts: dict[str, MapBlackout]
    buildings: tuple[MapBuilding, ...]


@dataclass(frozen=True, slots=True)
class ListedOutage:
    """One row of the outage list: schedule and initiator."""

    number: str
    resource: OutageResource | None
    starts_at: datetime | None
    ends_at: datetime | None
    complaints_count: int
    description: str
    initiator: str | None


def _resource(value: Any) -> OutageResource | None:
    try:
        return OutageResource(value)
    except ValueError:
        return None


def _map_building(raw: Any) -> MapBuilding | None:
    try:
        lng, lat = (float(value) for value in raw["coordinates"])
        address = collapse_spaces(str(raw["address"]))
        numbers = tuple(str(int(number)) for number in raw["blackouts"])
        complaints = int(raw.get("claimsCount") or 0)
    except (KeyError, TypeError, ValueError):
        return None
    if not address or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return MapBuilding(House(address, lat, lng), complaints, numbers)


def parse_map(html: str) -> OutageMap | None:
    """The JSON embedded in the map page; None when the page does not have the expected shape."""
    tree = LexborHTMLParser(html)
    for script in tree.css("script.map-config"):
        try:
            data = json.loads(json.loads(script.text() or "")["data"])
            raw_blackouts, raw_buildings = data["blackouts"], data["buildings"]
        except (ValueError, KeyError, TypeError):
            continue
        blackouts: dict[str, MapBlackout] = {}
        for number, raw in raw_blackouts.items() if isinstance(raw_blackouts, dict) else ():
            resource = _resource(raw.get("type")) if isinstance(raw, dict) else None
            if resource is not None and str(number).isdigit():
                blackouts[str(number)] = MapBlackout(
                    resource, collapse_spaces(str(raw.get("description") or ""))
                )
        raw_list = raw_buildings.values() if isinstance(raw_buildings, dict) else raw_buildings
        buildings = tuple(filter(None, (_map_building(raw) for raw in raw_list or ())))
        return OutageMap(blackouts, buildings)
    return None


def _moment(text: str, now: datetime) -> datetime | None:
    """«11 ноя. 12:23» in Vladivostok time; the year is the one closest to now."""
    day_month, clock = day_and_month(text), hour_and_minute(text)
    if day_month is None:
        return None
    local_now = now.astimezone(CITY_TZ)
    hour, minute = clock or (0, 0)
    candidates = []
    for year in (local_now.year - 1, local_now.year, local_now.year + 1):
        try:
            candidates.append(datetime(year, day_month[1], day_month[0], hour, minute, tzinfo=CITY_TZ))
        except ValueError:
            continue
    return min(candidates, key=lambda moment: abs(moment - local_now)) if candidates else None


def parse_period(text: str, now: datetime) -> tuple[datetime | None, datetime | None]:
    """«11 ноя. 12:23 — 11 ноя. 14:00» → start and optional planned end.

    Dates carry no year. An outage starts in the past, so a start that lands in the future
    belongs to the previous year; the end never precedes the start.
    """
    start_text, _, end_text = text.partition(_PERIOD_SEPARATOR)
    starts_at = _moment(start_text, now)
    if starts_at is not None and starts_at > now + _FUTURE_START_SLACK:
        starts_at = starts_at.replace(year=starts_at.year - 1)
    ends_at = _moment(end_text, now) if end_text.strip() else None
    if starts_at is not None and ends_at is not None and ends_at < starts_at:
        ends_at = ends_at.replace(year=ends_at.year + 1)
    return starts_at, ends_at


def parse_blackouts(html: str, now: datetime) -> list[ListedOutage]:
    outages: list[ListedOutage] = []
    for item in LexborHTMLParser(html).css(".blackout-summary-blackouts__item"):
        description_node = item.css_first(".blackout-summary-blackouts__description")
        description = collapse_spaces(description_node.text(separator=" ")) if description_node else ""
        number = _NUMBER_RE.search(description)
        if number is None:
            continue
        icon = item.css_first(".blackout-summary__resource-icon")
        resource_class = _RESOURCE_CLASS_RE.search((icon.attributes.get("class") or "") if icon else "")
        dates = item.css_first(".blackout-summary-blackouts__dates")
        starts_at, ends_at = parse_period(dates.text(separator=" ") if dates else "", now)
        counts = {
            match.group(2): int(match.group(1))
            for node in item.css(".blackout-summary-blackouts__count")
            if (match := _COUNT_RE.search(node.text()))
        }
        initiator_node = item.css_first(".blackout-summary-blackouts__initiator")
        initiator = collapse_spaces(initiator_node.text()) if initiator_node else ""
        outages.append(
            ListedOutage(
                number=number.group(1),
                resource=_resource(resource_class.group(1)) if resource_class else None,
                starts_at=starts_at,
                ends_at=ends_at,
                complaints_count=counts.get("жалоб", 0),
                description=collapse_spaces(re.sub(r"\(\s*№\s*\d+\s*\)", "", description)),
                initiator=None if initiator in ("", _NO_INITIATOR) else initiator,
            )
        )
    return outages
