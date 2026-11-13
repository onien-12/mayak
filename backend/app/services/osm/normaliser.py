"""Pure translation of one OSM element into a place draft or an area draft (SPEC §18)."""

from collections.abc import Mapping
from dataclasses import dataclass

from app.domain.attributes import MAX_TEXT_LENGTH, AttributeValue
from app.domain.enums import AreaKind, ExternalSourceId
from app.domain.geometry import GeoJson
from app.services.osm.elements import OsmElement
from app.services.osm.mapping import (
    AREA_RULES,
    ATTRIBUTE_RULES,
    NAME_TAGS,
    PLACE_RULES,
    SKIPPED_ACCESS,
    AreaRule,
    AttributeRule,
    PlaceRule,
)

MIN_TITLE_LENGTH = 3
MAX_TITLE_LENGTH = 120
MAX_AREA_TITLE_LENGTH = 80
MAX_DESCRIPTION_LENGTH = 600
MAX_ADDRESS_LENGTH = 200
_LIST_SEPARATOR = ";"


@dataclass(frozen=True, slots=True)
class PlaceDraft:
    external_id: str
    url: str
    category: str
    title: str
    description: str
    lat: float
    lng: float
    address: str | None
    attributes: dict[str, AttributeValue]


@dataclass(frozen=True, slots=True)
class AreaDraft:
    external_id: str
    url: str
    title: str
    kind: AreaKind
    outline: GeoJson


def external_id(element: OsmElement) -> str:
    return f"{ExternalSourceId.OSM.value}:{element.key}"


def _plain(text: str, limit: int) -> str:
    """Single-line text without control characters, cut at a word boundary when too long."""
    cleaned = " ".join("".join(char for char in text if char.isprintable()).split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,.;:-") + "…"


def name_of(tags: Mapping[str, str]) -> str | None:
    """`name:ru`, else `name`; None when absent or too short to be a title."""
    for tag in NAME_TAGS:
        name = _plain(tags.get(tag, ""), MAX_TITLE_LENGTH)
        if len(name) >= MIN_TITLE_LENGTH:
            return name
    return None


def _listed(value: str | None) -> set[str]:
    return {item.strip() for item in (value or "").split(_LIST_SEPARATOR) if item.strip()}


def _matches(rule: PlaceRule | AreaRule, tags: Mapping[str, str]) -> bool:
    value = tags.get(rule.tag)
    if value is None or (rule.values and value not in rule.values):
        return False
    if not isinstance(rule, PlaceRule):
        return True
    if any(expected not in _listed(tags.get(key)) for key, expected in rule.when.items()):
        return False
    return not any(tags.get(key) in excluded for key, excluded in rule.unless.items())


def place_rule_for(tags: Mapping[str, str]) -> PlaceRule | None:
    return next((rule for rule in PLACE_RULES if _matches(rule, tags)), None)


def area_rule_for(tags: Mapping[str, str]) -> AreaRule | None:
    return next((rule for rule in AREA_RULES if _matches(rule, tags)), None)


def _attribute_value(rule: AttributeRule, raw: str) -> AttributeValue | None:
    if raw in rule.values:
        return rule.values[raw]
    known = sorted(item for item in _listed(raw) if item in rule.values)
    if known:
        return rule.values[known[0]]
    if not rule.verbatim:
        return None
    return _plain(raw, MAX_TEXT_LENGTH) or None


def attributes_from(
    tags: Mapping[str, str], preset: Mapping[str, AttributeValue]
) -> dict[str, AttributeValue]:
    """Attribute candidates; the category's fields later keep only the keys it knows."""
    attributes: dict[str, AttributeValue] = dict(preset)
    for rule in ATTRIBUTE_RULES:
        value = _attribute_value(rule, tags[rule.tag]) if rule.tag in tags else None
        if value is not None:
            attributes[rule.key] = value
    return attributes


def _address(tags: Mapping[str, str]) -> str | None:
    street, house = tags.get("addr:street"), tags.get("addr:housenumber")
    if not street:
        return None
    return _plain(f"{street}, {house}" if house else street, MAX_ADDRESS_LENGTH)


def to_area(element: OsmElement) -> AreaDraft | None:
    """Named polygons of the territory kinds become areas."""
    rule = area_rule_for(element.tags)
    name = name_of(element.tags)
    if element.outline is None or rule is None or name is None:
        return None
    return AreaDraft(
        external_id=external_id(element),
        url=element.url,
        title=_plain(name, MAX_AREA_TITLE_LENGTH),
        kind=rule.kind,
        outline=element.outline,
    )


def to_place(element: OsmElement) -> PlaceDraft | None:
    """Everything the mapping knows becomes a place; closed objects and unnamed generic ones do not."""
    tags = element.tags
    rule = place_rule_for(tags)
    if rule is None or tags.get("access") in SKIPPED_ACCESS:
        return None
    name = name_of(tags)
    if name is None and rule.named_only:
        return None
    return PlaceDraft(
        external_id=external_id(element),
        url=element.url,
        category=rule.category,
        title=name or rule.title,
        description=_plain(tags.get("description", ""), MAX_DESCRIPTION_LENGTH),
        lat=element.lat,
        lng=element.lng,
        address=_address(tags),
        attributes=attributes_from(tags, rule.preset),
    )


def normalise(element: OsmElement) -> PlaceDraft | AreaDraft | None:
    """A territory when it qualifies as one, else a place, else nothing."""
    return to_area(element) or to_place(element)
