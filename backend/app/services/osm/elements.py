"""OSM elements as the rest of the code sees them, read from Overpass or from the snapshot.

Both readers are defensive: anything malformed is skipped, tags are reduced to the ones the
mapping uses and to bounded plain strings, territory outlines are assembled and simplified.
"""

import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from app.domain import geometry
from app.domain.geo import LngLat
from app.domain.geometry import GeoJson
from app.services.osm.mapping import MIN_AREA_M2, used_tags

OSM_TYPES = ("node", "way", "relation")
OSM_URL = "https://www.openstreetmap.org"
MAX_TAG_LENGTH = 255
COORDINATE_PRECISION = 6
_USED_TAGS = used_tags()


@dataclass(frozen=True, slots=True)
class OsmElement:
    osm_type: str
    osm_id: int
    tags: Mapping[str, str]
    lat: float
    lng: float
    outline: GeoJson | None = None
    """Territory polygon, kept only for named polygons large enough to become an area."""

    @property
    def key(self) -> str:
        return f"{self.osm_type}/{self.osm_id}"

    @property
    def url(self) -> str:
        return f"{OSM_URL}/{self.key}"


def _tags(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    return {
        key: " ".join(value.split())[:MAX_TAG_LENGTH]
        for key, value in raw.items()
        if key in _USED_TAGS and isinstance(value, str) and value.strip()
    }


def _coordinate(value: Any, limit: float) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    number = float(value)
    return round(number, COORDINATE_PRECISION) if math.isfinite(number) and abs(number) <= limit else None


def _point(raw: Mapping[str, Any]) -> tuple[float, float] | None:
    lat, lng = _coordinate(raw.get("lat"), 90), _coordinate(raw.get("lon"), 180)
    return (lat, lng) if lat is not None and lng is not None else None


def _line(raw: Any) -> list[LngLat]:
    points = [_point(node) for node in raw if isinstance(node, dict)] if isinstance(raw, list) else []
    return [(lng, lat) for lat, lng in filter(None, points)]


def _outline(raw: Mapping[str, Any]) -> GeoJson | None:
    """Way geometry, or the outer / inner member ways of a multipolygon relation."""
    if raw.get("type") == "way":
        return geometry.outline_from_rings([_line(raw.get("geometry"))], [])
    members = [member for member in raw.get("members") or () if isinstance(member, dict)]
    outer = [_line(member.get("geometry")) for member in members if member.get("role") != "inner"]
    inner = [_line(member.get("geometry")) for member in members if member.get("role") == "inner"]
    return geometry.outline_from_rings(outer, inner)


def _bounds_centre(raw: Any) -> tuple[float, float] | None:
    if not isinstance(raw, dict):
        return None
    south, north = _coordinate(raw.get("minlat"), 90), _coordinate(raw.get("maxlat"), 90)
    west, east = _coordinate(raw.get("minlon"), 180), _coordinate(raw.get("maxlon"), 180)
    if None in (south, north, west, east):
        return None
    return round((south + north) / 2, COORDINATE_PRECISION), round((west + east) / 2, COORDINATE_PRECISION)


def _large_enough(outline: GeoJson | None) -> GeoJson | None:
    return outline if outline is not None and geometry.area_m2(outline) >= MIN_AREA_M2 else None


def _from_overpass(raw: Any) -> OsmElement | None:
    if not isinstance(raw, dict) or raw.get("type") not in OSM_TYPES or not isinstance(raw.get("id"), int):
        return None
    outline = _outline(raw) if "geometry" in raw or "members" in raw else None
    point = _point(raw) or _point(raw.get("center") or {})
    if point is None and outline is not None:
        point = geometry.label_point(outline)
    point = point or _bounds_centre(raw.get("bounds"))
    if point is None:
        return None
    return OsmElement(raw["type"], raw["id"], _tags(raw.get("tags")), *point, outline=_large_enough(outline))


def _merge(elements: Iterable[OsmElement | None]) -> list[OsmElement]:
    """One element per OSM object; the copy with an outline wins (Overpass may return both)."""
    merged: dict[str, OsmElement] = {}
    for element in filter(None, elements):
        known = merged.get(element.key)
        if known is None or (known.outline is None and element.outline is not None):
            merged[element.key] = element
    return sorted(merged.values(), key=lambda element: (OSM_TYPES.index(element.osm_type), element.osm_id))


def parse_overpass(payload: Mapping[str, Any]) -> list[OsmElement]:
    return _merge(_from_overpass(raw) for raw in payload.get("elements") or ())


def to_row(element: OsmElement) -> dict[str, Any]:
    """The compact snapshot form of an element."""
    row: dict[str, Any] = {
        "type": element.osm_type,
        "id": element.osm_id,
        "lat": element.lat,
        "lon": element.lng,
        "tags": dict(element.tags),
    }
    if element.outline is not None:
        row["outline"] = element.outline
    return row


def _from_row(raw: Any) -> OsmElement | None:
    if not isinstance(raw, dict) or raw.get("type") not in OSM_TYPES or not isinstance(raw.get("id"), int):
        return None
    point = _point(raw)
    if point is None:
        return None
    outline = geometry.polygonal_geojson(raw["outline"]) if "outline" in raw else None
    return OsmElement(raw["type"], raw["id"], _tags(raw.get("tags")), *point, outline=outline)


def from_rows(rows: Iterable[Any]) -> list[OsmElement]:
    """Elements read back from the snapshot; malformed rows are skipped."""
    return _merge(_from_row(raw) for raw in rows)
