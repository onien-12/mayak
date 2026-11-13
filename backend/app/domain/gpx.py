"""GPX 1.1 export of a route: one waypoint per visible stop and one track with the path."""

from collections.abc import Sequence
from dataclasses import dataclass
from xml.etree import ElementTree as ET

from app.domain.geo import LngLat

GPX_NAMESPACE = "http://www.topografix.com/GPX/1/1"
CREATOR = "Маяк — народная карта Владивостока"
MEDIA_TYPE = "application/gpx+xml"
_COORDINATE_FORMAT = "{:.6f}"


@dataclass(frozen=True, slots=True)
class GpxWaypoint:
    name: str
    description: str
    lat: float
    lng: float


def _text_child(parent: ET.Element, tag: str, text: str) -> None:
    if text:
        ET.SubElement(parent, tag).text = text


def _point(parent: ET.Element, tag: str, lat: float, lng: float) -> ET.Element:
    return ET.SubElement(parent, tag, lat=_COORDINATE_FORMAT.format(lat), lon=_COORDINATE_FORMAT.format(lng))


def build_gpx(name: str, description: str, waypoints: Sequence[GpxWaypoint], track: Sequence[LngLat]) -> str:
    """Serialise a route; all text is escaped by the XML writer."""
    root = ET.Element("gpx", version="1.1", creator=CREATOR, xmlns=GPX_NAMESPACE)
    metadata = ET.SubElement(root, "metadata")
    _text_child(metadata, "name", name)
    _text_child(metadata, "desc", description)
    for waypoint in waypoints:
        element = _point(root, "wpt", waypoint.lat, waypoint.lng)
        _text_child(element, "name", waypoint.name)
        _text_child(element, "desc", waypoint.description)
    track_element = ET.SubElement(root, "trk")
    _text_child(track_element, "name", name)
    segment = ET.SubElement(track_element, "trkseg")
    for lng, lat in track:
        _point(segment, "trkpt", lat, lng)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode")
