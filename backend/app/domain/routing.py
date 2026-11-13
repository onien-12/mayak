"""Route geometry helpers: travel modes, straight-line fallback, stitching of routed legs and
parsing of the routing providers' answers (OSRM and 2GIS)."""

import re
from bisect import bisect_left
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from itertools import accumulate, pairwise
from typing import Any

from app.domain import geo
from app.domain.enums import RouteKind
from app.domain.geo import LngLat


class TravelMode(StrEnum):
    """How the route is travelled; each routing provider maps it to its own profile."""

    FOOT = "foot"
    BIKE = "bike"
    CAR = "car"


TRAVEL_BY_KIND: dict[RouteKind, TravelMode] = {
    RouteKind.WALK: TravelMode.FOOT,
    RouteKind.HIKE: TravelMode.FOOT,
    RouteKind.EXCURSION: TravelMode.FOOT,
    RouteKind.CAR: TravelMode.CAR,
    RouteKind.BIKE: TravelMode.BIKE,
}

SPEED_KMH: dict[RouteKind, float] = {
    RouteKind.WALK: 4.8,
    RouteKind.HIKE: 3.5,
    RouteKind.EXCURSION: 4.0,
    RouteKind.CAR: 30.0,
    RouteKind.BIKE: 14.0,
}

MIN_POINTS = 2
MAX_POINTS = 40
MIN_VISIBLE_STOPS = 2
ANCHOR_SLACK_M = 30.0
WAYPOINT_TOLERANCE_M = 500.0
"""How far a 2GIS path may pass from a requested point (snapping to the road graph)."""
MAX_SNAP_M = 300.0
"""A requested point farther than this from the road and path network is not moved onto it: the
line runs to the nearest reachable spot and on to the point itself as a straight connector."""
OFF_NETWORK_SPEED_KMH = SPEED_KMH[RouteKind.HIKE]
"""Pace on a straight connector off the network: whatever the transport, it is walked."""

SECONDS_PER_MINUTE = 60
SECONDS_PER_HOUR = 3600


@dataclass(frozen=True, slots=True)
class RoutedPath:
    """A path returned by a routing provider through the requested points, in order."""

    path: list[LngLat]
    legs_m: list[float]
    """Length along the path between consecutive requested points."""
    duration_s: float

    @property
    def travel_min(self) -> int:
        return max(1, round(self.duration_s / SECONDS_PER_MINUTE))


_LINESTRING_RE = re.compile(r"LINESTRING\s*\(([^)]*)\)", re.IGNORECASE)


def travel_minutes(distance_m: float, kind: RouteKind) -> int:
    """Travel time at the typical speed of the route kind, at least one minute."""
    return max(1, round(distance_m / 1000 / SPEED_KMH[kind] * 60))


def parse_linestring(wkt: str) -> list[LngLat]:
    """`LINESTRING(lon lat, lon lat, ...)` → points; malformed input yields an empty list."""
    match = _LINESTRING_RE.search(wkt)
    if match is None:
        return []
    points: list[LngLat] = []
    for pair in match.group(1).split(","):
        coordinates = pair.split()
        if len(coordinates) < 2:
            return []
        try:
            points.append((float(coordinates[0]), float(coordinates[1])))
        except ValueError:
            return []
    return points


def merge_segments(segments: Iterable[Sequence[LngLat]]) -> list[LngLat]:
    """Concatenate consecutive line pieces, dropping the repeated joint points."""
    path: list[LngLat] = []
    for segment in segments:
        for point in segment:
            if not path or path[-1] != point:
                path.append(point)
    return path


def total_duration_min(travel_min: int, stay_minutes: Iterable[int]) -> int:
    return travel_min + sum(stay_minutes)


def request_chunks(points: Sequence[LngLat], size: int) -> list[Sequence[LngLat]]:
    """Split a long point list into chunks of at most `size` points, joint points shared."""
    return [points[start : start + size] for start in range(0, len(points) - 1, size - 1)]


def stitch(parts: Sequence[RoutedPath]) -> RoutedPath:
    """One path from the routed chunks of `request_chunks`, in order."""
    return RoutedPath(
        path=merge_segments(part.path for part in parts),
        legs_m=[leg for part in parts for leg in part.legs_m],
        duration_s=sum(part.duration_s for part in parts),
    )


def straight_legs_m(points: Sequence[LngLat]) -> list[float]:
    return [geo.haversine_m(a[1], a[0], b[1], b[0]) for a, b in pairwise(points)]


def path_legs_m(path: Sequence[LngLat], points: Sequence[LngLat]) -> list[float]:
    """Length of the path between consecutive requested points.

    Each point is matched to the first path vertex that is about as close as the closest one,
    searching forward from the previous match, so an out-and-back path keeps the point order.
    """
    cumulative = [0.0]
    for a, b in pairwise(path):
        cumulative.append(cumulative[-1] + geo.haversine_m(a[1], a[0], b[1], b[0]))
    anchors: list[int] = []
    cursor = 0
    for lng, lat in points:
        distances = [geo.haversine_m(lat, lng, vertex[1], vertex[0]) for vertex in path[cursor:]]
        closest = min(distances)
        cursor += next(
            offset for offset, distance in enumerate(distances) if distance <= closest + ANCHOR_SLACK_M
        )
        anchors.append(cursor)
    anchors[0], anchors[-1] = 0, len(path) - 1
    return [cumulative[end] - cumulative[start] for start, end in pairwise(anchors)]


def stop_distances(legs_m: Sequence[int], is_via: Sequence[bool]) -> list[int | None]:
    """Distance to each stop along the path: from the previous visible stop, or, for a `via`
    shaping point, from the previous point. The first stop has no distance."""
    distances: list[int | None] = [None]
    since_visible = 0
    for leg, via in zip(legs_m, is_via[1:], strict=True):
        since_visible += leg
        if via:
            distances.append(leg)
        else:
            distances.append(since_visible)
            since_visible = 0
    return distances


def parse_twogis_response(payload: Mapping[str, Any], points: Sequence[LngLat]) -> RoutedPath | None:
    """The first route of a 2GIS Routing API response through `points`; None when it has no
    usable path. 2GIS reports no per-leg distances, so they are measured along the path."""
    try:
        result = payload["result"][0]
        segments = [
            parse_linestring(geometry["selection"])
            for maneuver in result["maneuvers"]
            for geometry in (maneuver.get("outcoming_path") or {}).get("geometry", ())
        ]
        duration_s = float(result["total_duration"])
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    path = merge_segments(segments)
    if len(path) < MIN_POINTS:
        return None
    return RoutedPath(path, path_legs_m(path, points), duration_s)


def _leg_split_indices(path: Sequence[LngLat], legs_m: Sequence[float]) -> list[int]:
    """Indices of the path vertices where each leg starts and ends, found by the leg lengths:
    unlike matching by position, this keeps the order on paths that run out and back."""
    cumulative = [0.0]
    for a, b in pairwise(path):
        cumulative.append(cumulative[-1] + geo.haversine_m(a[1], a[0], b[1], b[0]))
    indices = [0]
    for target in accumulate(legs_m[:-1]):
        after = bisect_left(cumulative, target, lo=indices[-1], hi=len(path) - 1)
        before = max(after - 1, indices[-1])
        indices.append(before if target - cumulative[before] < cumulative[after] - target else after)
    indices.append(len(path) - 1)
    return indices


def parse_osrm_response(payload: Mapping[str, Any], points: Sequence[LngLat]) -> RoutedPath | None:
    """The first route of an OSRM `route` response through `points`; None when it has no usable path.

    OSRM moves every point onto the nearest road or path. A point farther than `MAX_SNAP_M` from
    it (a trailhead in the forest, a cape beyond the last path) is kept: the line goes to the
    snapped spot and on to the point as a straight connector, out and back for an intermediate one.
    """
    try:
        if payload["code"] != "Ok":
            return None
        route = payload["routes"][0]
        path = [(float(lng), float(lat)) for lng, lat in route["geometry"]["coordinates"]]
        legs_m = [float(leg["distance"]) for leg in route["legs"]]
        duration_s = float(route["duration"])
        snaps_m = [float(waypoint["distance"]) for waypoint in payload["waypoints"]]
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    if len(path) < MIN_POINTS or len(legs_m) != len(points) - 1 or len(snaps_m) != len(points):
        return None
    splits = _leg_split_indices(path, legs_m)
    last = len(points) - 1
    segments: list[Sequence[LngLat]] = []
    for index, point in enumerate(points):
        snapped = path[splits[index]]
        if snaps_m[index] > MAX_SNAP_M:
            connector_m = geo.haversine_m(point[1], point[0], snapped[1], snapped[0])
            traversals = (index > 0) + (index < last)
            duration_s += traversals * connector_m / (OFF_NETWORK_SPEED_KMH * 1000) * SECONDS_PER_HOUR
            if index > 0:
                segments.append([snapped, point])
                legs_m[index - 1] += connector_m
            if index < last:
                segments.append([point, snapped])
                legs_m[index] += connector_m
        if index < last:
            segments.append(path[splits[index] : splits[index + 1] + 1])
    return RoutedPath(merge_segments(segments), legs_m, duration_s)


def passes_through(path: Sequence[LngLat], points: Sequence[LngLat]) -> bool:
    """Whether the path starts, ends and passes near every requested point, in order."""
    cursor = 0
    for lng, lat in points:
        reached = next(
            (
                index
                for index in range(cursor, len(path))
                if geo.haversine_m(lat, lng, path[index][1], path[index][0]) <= WAYPOINT_TOLERANCE_M
            ),
            None,
        )
        if reached is None:
            return False
        cursor = reached
    last_lng, last_lat = points[-1]
    return geo.haversine_m(last_lat, last_lng, path[-1][1], path[-1][0]) <= WAYPOINT_TOLERANCE_M
