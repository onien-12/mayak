"""Territory geometry: validation, measurement and spatial predicates on GeoJSON polygons.

The only module that knows about shapely; everything else works with plain GeoJSON dicts
(positions are `[lng, lat]`, rings are closed, the outer ring comes first).
"""

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

import shapely
from shapely import wkt as shapely_wkt
from shapely.errors import ShapelyError
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import polygonize, unary_union

from app.domain import geo
from app.domain.geo import BBox, LngLat

GeoJson = dict[str, Any]

MIN_VERTICES = 4
MAX_INPUT_VERTICES = 500
MAX_TRANSFER_VERTICES = 200
MAX_AREA_M2 = 30_000_000.0
MIN_AREA_M2 = 25.0
CIRCLE_SEGMENTS = 48
COORDINATE_PRECISION = 6
POLYGON_TYPES = ("Polygon", "MultiPolygon")

_METERS_PER_DEGREE = 111_320.0
_INITIAL_TOLERANCE_M = 1.0
_MAX_SIMPLIFY_STEPS = 16


class InvalidGeometryError(ValueError):
    """Raised with a Russian explanation when a territory outline is not acceptable."""


@dataclass(frozen=True, slots=True)
class Territory:
    """A validated outline with everything derived from it."""

    geojson: GeoJson
    """Simplified to at most `MAX_TRANSFER_VERTICES` vertices."""
    label_lat: float
    label_lng: float
    """A point guaranteed to lie inside, even for concave or elongated shapes."""
    radius_m: int
    """Distance from the label point to the farthest vertex."""
    area_m2: float
    bbox: BBox


def _scale(lat: float) -> tuple[float, float]:
    """Metres per degree of longitude and latitude around the given latitude."""
    return _METERS_PER_DEGREE * max(math.cos(math.radians(lat)), 0.01), _METERS_PER_DEGREE


def _to_metres(geometry: BaseGeometry) -> BaseGeometry:
    kx, ky = _scale(geometry.centroid.y)
    return shapely.transform(geometry, lambda coordinates: coordinates * (kx, ky))


def _to_degrees(geometry: BaseGeometry, lat: float) -> BaseGeometry:
    kx, ky = _scale(lat)
    return shapely.transform(geometry, lambda coordinates: coordinates / (kx, ky))


def _polygons(geometry: BaseGeometry) -> list[Polygon]:
    return list(geometry.geoms) if isinstance(geometry, MultiPolygon) else [geometry]


def _vertex_count(geometry: BaseGeometry) -> int:
    return sum(
        len(polygon.exterior.coords) + sum(len(ring.coords) for ring in polygon.interiors)
        for polygon in _polygons(geometry)
    )


def _simplified(geometry: BaseGeometry) -> BaseGeometry:
    """Reduce the outline to the transfer limit, doubling the tolerance until it fits."""
    if _vertex_count(geometry) <= MAX_TRANSFER_VERTICES:
        return geometry
    lat = geometry.centroid.y
    metric = _to_metres(geometry)
    tolerance = _INITIAL_TOLERANCE_M
    for _ in range(_MAX_SIMPLIFY_STEPS):
        candidate = metric.simplify(tolerance, preserve_topology=True)
        if _vertex_count(candidate) <= MAX_TRANSFER_VERTICES and not candidate.is_empty:
            return _to_degrees(candidate, lat)
        tolerance *= 2
    return _to_degrees(metric.convex_hull, lat)


def _rounded(value: Any) -> Any:
    if isinstance(value, list | tuple):
        return [_rounded(item) for item in value]
    return round(float(value), COORDINATE_PRECISION)


def _geojson(geometry: BaseGeometry) -> GeoJson:
    data = mapping(geometry)
    return {"type": data["type"], "coordinates": _rounded(data["coordinates"])}


def _rings(geojson: GeoJson) -> list[Any]:
    coordinates = geojson["coordinates"]
    polygons = coordinates if geojson["type"] == "MultiPolygon" else [coordinates]
    return [ring for polygon in polygons for ring in polygon]


def _check_structure(geojson: Any) -> None:
    """Shape of the document itself, before any geometry library sees it."""
    if not isinstance(geojson, dict) or geojson.get("type") not in POLYGON_TYPES:
        raise InvalidGeometryError("Территория должна быть полигоном (Polygon или MultiPolygon).")
    try:
        rings = _rings(geojson)
        positions = [(float(lng), float(lat)) for ring in rings for lng, lat, *_ in ring]
        closed = all(len(ring) >= MIN_VERTICES and list(ring[0][:2]) == list(ring[-1][:2]) for ring in rings)
    except (TypeError, ValueError, KeyError, IndexError):
        raise InvalidGeometryError("Некорректный формат координат территории.") from None
    if not rings or not closed:
        raise InvalidGeometryError("Контур территории должен быть замкнут и содержать не меньше трёх вершин.")
    if not MIN_VERTICES <= len(positions) <= MAX_INPUT_VERTICES:
        raise InvalidGeometryError(f"В контуре должно быть от {MIN_VERTICES} до {MAX_INPUT_VERTICES} вершин.")
    if not all(-180 <= lng <= 180 and -90 <= lat <= 90 for lng, lat in positions):
        raise InvalidGeometryError("Координаты территории вне допустимого диапазона.")


def _label_point(geometry: BaseGeometry) -> Point:
    """The centroid when it lies inside (compact shapes), else any point that surely does."""
    centroid = geometry.centroid
    return centroid if geometry.contains(centroid) else geometry.representative_point()


def _territory(geometry: BaseGeometry) -> Territory:
    simplified = _simplified(geometry)
    label = _label_point(simplified)
    vertices = [vertex for polygon in _polygons(simplified) for vertex in polygon.exterior.coords]
    radius = max(geo.haversine_m(label.y, label.x, lat, lng) for lng, lat in vertices)
    min_lng, min_lat, max_lng, max_lat = simplified.bounds
    return Territory(
        geojson=_geojson(simplified),
        label_lat=round(label.y, COORDINATE_PRECISION),
        label_lng=round(label.x, COORDINATE_PRECISION),
        radius_m=math.ceil(radius),
        area_m2=_to_metres(simplified).area,
        bbox=BBox(min_lng, min_lat, max_lng, max_lat),
    )


def parse_territory(geojson: Any) -> Territory:
    """Validate a user-supplied outline: closed rings, 4..500 vertices, no self-intersections,
    at most 30 km². Raises `InvalidGeometryError`."""
    _check_structure(geojson)
    try:
        geometry = shape(geojson)
    except (ShapelyError, ValueError, TypeError):
        raise InvalidGeometryError("Некорректный формат координат территории.") from None
    if not geometry.is_valid:
        raise InvalidGeometryError("Контур территории не должен пересекать сам себя.")
    area_m2 = _to_metres(geometry).area
    if area_m2 < MIN_AREA_M2:
        raise InvalidGeometryError("Территория слишком мала.")
    if area_m2 > MAX_AREA_M2:
        raise InvalidGeometryError("Территория слишком велика: не больше 30 км².")
    return _territory(geometry)


def circle_territory(lat: float, lng: float, radius_m: float) -> Territory:
    """The quick fallback: a circle approximated by a regular polygon."""
    kx, ky = _scale(lat)
    ring = [
        (
            lng + radius_m * math.cos(2 * math.pi * step / CIRCLE_SEGMENTS) / kx,
            lat + radius_m * math.sin(2 * math.pi * step / CIRCLE_SEGMENTS) / ky,
        )
        for step in range(CIRCLE_SEGMENTS)
    ]
    return _territory(Polygon(ring))


def buffered_line(points: Sequence[LngLat], half_width_m: float) -> GeoJson:
    """An elongated territory (an embankment, a spit) built around its centre line."""
    line = LineString(points)
    metric = _to_metres(line).buffer(half_width_m, cap_style="round", join_style="round")
    return _geojson(_simplified(_to_degrees(metric, line.centroid.y)))


def polygonal_geojson(geojson: Any) -> GeoJson | None:
    """An outline from an external source, normalised for transfer; None unless it is a valid
    Polygon / MultiPolygon."""
    if not isinstance(geojson, dict) or geojson.get("type") not in POLYGON_TYPES:
        return None
    try:
        geometry = shape(geojson)
    except (ShapelyError, ValueError, TypeError, KeyError):
        return None
    if geometry.is_empty:
        return None
    if not geometry.is_valid:
        geometry = geometry.buffer(0)
        if geometry.is_empty or geometry.geom_type not in POLYGON_TYPES:
            return None
    return _geojson(_simplified(geometry))


def parse_wkt(wkt: Any) -> GeoJson | None:
    """`POLYGON(...)` / `MULTIPOLYGON(...)` in lon-lat order → GeoJSON; None for anything else."""
    if not isinstance(wkt, str):
        return None
    try:
        geometry = shapely_wkt.loads(wkt)
    except (ShapelyError, ValueError):
        return None
    if geometry.geom_type not in POLYGON_TYPES:
        return None
    return polygonal_geojson(mapping(geometry))


def outline_from_rings(
    outer: Sequence[Sequence[LngLat]], inner: Sequence[Sequence[LngLat]]
) -> GeoJson | None:
    """A territory assembled from OpenStreetMap way pieces (an outer ring may be split across
    several ways); inner rings are cut out. None when the pieces do not close into polygons."""
    try:
        outline = unary_union(
            list(polygonize(unary_union([LineString(ring) for ring in outer if len(ring) > 1])))
        )
        holes = [LineString(ring) for ring in inner if len(ring) > 1]
        if holes:
            outline = outline.difference(unary_union(list(polygonize(unary_union(holes)))))
    except (ShapelyError, ValueError, TypeError):
        return None
    return polygonal_geojson(mapping(outline)) if not outline.is_empty else None


def label_point(geojson: GeoJson) -> tuple[float, float]:
    """`(lat, lng)` of a point guaranteed to lie inside a valid outline."""
    point = _label_point(shape(geojson))
    return round(point.y, COORDINATE_PRECISION), round(point.x, COORDINATE_PRECISION)


def area_m2(geojson: GeoJson) -> float:
    """Area of a valid outline in square metres."""
    return _to_metres(shape(geojson)).area


def contains(geojson: GeoJson, lat: float, lng: float) -> bool:
    """Whether the point lies inside the territory or on its border."""
    return shape(geojson).covers(Point(lng, lat))


def overlap_share(first: GeoJson, second: GeoJson) -> float:
    """Common area as a share of the smaller territory, 0..1."""
    a, b = shape(first), shape(second)
    if not a.intersects(b):
        return 0.0
    common = _to_metres(a.intersection(b)).area
    smaller = min(_to_metres(a).area, _to_metres(b).area)
    return common / smaller if smaller else 0.0


def smallest_containing(
    candidates: Iterable[tuple[int, GeoJson, float]], lat: float, lng: float
) -> int | None:
    """Id of the smallest-by-area territory that contains the point.

    `candidates` are `(id, geojson, area_m2)`; callers pre-filter them by bounding box.
    """
    containing = [(area_m2, key) for key, geojson, area_m2 in candidates if contains(geojson, lat, lng)]
    return min(containing)[1] if containing else None


class TerritoryIndex:
    """Answers "which territory does this point belong to" for many points at once.

    Built once from `(id, geojson, area_m2)`; used by bulk imports instead of one query per point.
    """

    def __init__(self, territories: Iterable[tuple[int, GeoJson, float]]) -> None:
        rows = list(territories)
        self._ids = [key for key, _, _ in rows]
        self._areas = [size for _, _, size in rows]
        self._shapes = [shape(geojson) for _, geojson, _ in rows]
        self._tree = shapely.STRtree(self._shapes)

    def _covering(self, lat: float, lng: float) -> list[int]:
        point = Point(lng, lat)
        return [int(index) for index in self._tree.query(point) if self._shapes[index].covers(point)]

    def smallest_containing(self, lat: float, lng: float) -> int | None:
        containing = [(self._areas[index], self._ids[index]) for index in self._covering(lat, lng)]
        return min(containing)[1] if containing else None

    def containing(self, lat: float, lng: float) -> list[int]:
        """Every territory the point lies in, nested ones included."""
        return [self._ids[index] for index in self._covering(lat, lng)]
