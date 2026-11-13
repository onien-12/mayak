"""Small geodesy helpers. Points on lines are `(lng, lat)` tuples (2GIS order)."""

import math
from dataclasses import dataclass

EARTH_RADIUS_M = 6_371_008.8
_METERS_PER_DEGREE_LAT = 111_320.0

LngLat = tuple[float, float]


@dataclass(frozen=True, slots=True)
class BBox:
    min_lng: float
    min_lat: float
    max_lng: float
    max_lat: float

    def contains(self, lat: float, lng: float) -> bool:
        return self.min_lat <= lat <= self.max_lat and self.min_lng <= lng <= self.max_lng


def parse_bbox(raw: str) -> BBox:
    """Parse `minLng,minLat,maxLng,maxLat`; raises ValueError on malformed input."""
    parts = [float(part) for part in raw.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox must have four numbers")
    min_lng, min_lat, max_lng, max_lat = parts
    if not (-180 <= min_lng <= max_lng <= 180 and -90 <= min_lat <= max_lat <= 90):
        raise ValueError("bbox is out of range")
    return BBox(min_lng, min_lat, max_lng, max_lat)


def parse_south_west_north_east(raw: str) -> BBox:
    """`south,west,north,east` — the order of Overpass and of the `OSM_BBOX` setting."""
    parts = [float(part) for part in raw.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox must have four numbers")
    south, west, north, east = parts
    return parse_bbox(f"{west},{south},{east},{north}")


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = phi2 - phi1
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bbox_around(lat: float, lng: float, radius_m: float) -> BBox:
    """Bounding box of a circle; used as a cheap SQL pre-filter before exact distance checks."""
    d_lat = radius_m / _METERS_PER_DEGREE_LAT
    d_lng = radius_m / (_METERS_PER_DEGREE_LAT * max(math.cos(math.radians(lat)), 0.01))
    return BBox(lng - d_lng, lat - d_lat, lng + d_lng, lat + d_lat)
