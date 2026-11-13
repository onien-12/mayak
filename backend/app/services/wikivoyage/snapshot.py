"""The committed Wikivoyage snapshot: parsed listings, one per line for readable diffs."""

import json
from collections.abc import Sequence
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any

from app.services.wikivoyage.parser import Listing

SNAPSHOT_VERSION = 1
ATTRIBUTION = "Викигид (ru.wikivoyage.org), CC BY-SA 4.0; авторы — в истории правок статей"
_TEXT_FIELDS = ("listing_id", "article", "kind", "name", "alt", "address", "hours", "description")


def _line(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def write(path: Path, articles: Sequence[str], listings: Sequence[Listing], fetched_at: datetime) -> None:
    header = {
        "version": SNAPSHOT_VERSION,
        "attribution": ATTRIBUTION,
        "fetched_at": fetched_at.isoformat(),
        "articles": list(articles),
    }
    rows = ",\n".join(_line(asdict(listing)) for listing in listings)
    path.write_text(f'{_line(header)[:-1]},\n"listings":[\n{rows}\n]}}\n', encoding="utf-8")


def _number(value: Any) -> float | None:
    return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None


def _listing(row: Any) -> Listing | None:
    """Rows are re-checked on load: the snapshot is data, not code."""
    if not isinstance(row, dict) or not all(isinstance(row.get(key), str) for key in _TEXT_FIELDS):
        return None
    optional = {key: row.get(key) if isinstance(row.get(key), str) else None for key in ("wikidata", "image")}
    return Listing(
        **{key: row[key] for key in _TEXT_FIELDS},
        lat=_number(row.get("lat")),
        lng=_number(row.get("lng")),
        **optional,
    )


def read(path: Path) -> list[Listing]:
    """Listings of the snapshot; an absent file means "no Wikivoyage layer"."""
    if not path.exists():
        return []
    document = json.loads(path.read_text(encoding="utf-8"))
    rows = document.get("listings") if isinstance(document, dict) else None
    return [listing for listing in map(_listing, rows or ()) if listing is not None]
