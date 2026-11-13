"""The committed Wikimedia snapshot: photos and short descriptions by target key (SPEC §19)."""

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from app.domain import free_text
from app.services.wikimedia import parser
from app.services.wikimedia.collector import Harvest, Summary
from app.services.wikimedia.parser import CommonsPhoto

ATTRIBUTION = (
    "Photos: Wikimedia Commons, each with its own author and licence (shown with the photo). "
    "Descriptions: Russian Wikipedia, CC BY-SA 4.0 (shown with a link to the article)."
)


def _photo_row(photo: CommonsPhoto) -> dict[str, Any]:
    return {
        "file": photo.file,
        "url": photo.url,
        "width": photo.width,
        "height": photo.height,
        "author": photo.author,
        "license": photo.license,
        "source_url": photo.source_url,
    }


def write(path: Path, harvest: Harvest, fetched_at: datetime) -> None:
    keys = sorted({*harvest.photos, *harvest.summaries})
    targets: dict[str, dict[str, Any]] = {}
    for key in keys:
        entry: dict[str, Any] = {"photos": [_photo_row(photo) for photo in harvest.photos.get(key, ())]}
        summary = harvest.summaries.get(key)
        if summary is not None:
            entry["summary"] = {"text": summary.text, "title": summary.title, "url": summary.url}
        targets[key] = entry
    document = {"attribution": ATTRIBUTION, "fetched_at": fetched_at.isoformat(), "targets": targets}
    path.write_text(json.dumps(document, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def _photo(raw: Any) -> CommonsPhoto | None:
    """Rows are re-validated on load: the snapshot is data, not code."""
    if not isinstance(raw, dict):
        return None
    return parser.make_photo(
        file=raw.get("file"),
        url=raw.get("url"),
        width=raw.get("width"),
        height=raw.get("height"),
        author=raw.get("author"),
        license_name=raw.get("license"),
        source_url=raw.get("source_url"),
    )


def _summary(raw: Any) -> Summary | None:
    if not isinstance(raw, dict):
        return None
    text, title, url = raw.get("text"), raw.get("title"), raw.get("url")
    if not all(isinstance(value, str) and value for value in (text, title, url)):
        return None
    if not url.startswith(parser.WIKIPEDIA_URL.format(title="")):
        return None
    return Summary(parser.plain_text(text, free_text.MAX_SUMMARY_LENGTH), title, url)


def read(path: Path) -> Harvest:
    """Photos and summaries by target key; empty when the file is absent."""
    harvest = Harvest()
    if not path.exists():
        return harvest
    document = json.loads(path.read_text(encoding="utf-8"))
    targets = document.get("targets") if isinstance(document, dict) else None
    for key, entry in (targets if isinstance(targets, dict) else {}).items():
        if not isinstance(entry, dict):
            continue
        photos = [photo for photo in map(_photo, entry.get("photos") or ()) if photo is not None]
        if photos:
            harvest.photos[str(key)] = photos
        summary = _summary(entry.get("summary"))
        if summary is not None:
            harvest.summaries[str(key)] = summary
    return harvest
