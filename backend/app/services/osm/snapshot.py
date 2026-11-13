"""The committed OSM snapshot: a compact JSON file, one element per line for readable diffs."""

import json
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path
from typing import Any

from app.domain.geo import BBox
from app.services.osm.elements import OsmElement, from_rows, to_row

SNAPSHOT_VERSION = 1
ATTRIBUTION = "© участники OpenStreetMap, ODbL 1.0 (https://www.openstreetmap.org/copyright)"


def _line(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def write(path: Path, elements: Sequence[OsmElement], bbox: BBox, fetched_at: datetime) -> None:
    header = {
        "version": SNAPSHOT_VERSION,
        "attribution": ATTRIBUTION,
        "fetched_at": fetched_at.isoformat(),
        "bbox": [bbox.min_lat, bbox.min_lng, bbox.max_lat, bbox.max_lng],
    }
    rows = ",\n".join(_line(to_row(element)) for element in elements)
    path.write_text(f'{_line(header)[:-1]},\n"elements":[\n{rows}\n]}}\n', encoding="utf-8")


def read(path: Path) -> list[OsmElement]:
    """Elements of the snapshot; an absent file means "no OSM layer"."""
    if not path.exists():
        return []
    document = json.loads(path.read_text(encoding="utf-8"))
    return from_rows(document.get("elements") or ()) if isinstance(document, dict) else []
