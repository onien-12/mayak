"""Attaching the Wikimedia snapshot to places and areas (SPEC §19).

Photos go only where there are none yet: user photos always win and always come first. They are
hot-linked thumbnails with their credit; files are never copied. Descriptions from Wikipedia
only fill empty ones, with the credit «Википедия, CC BY-SA» and a link to the article.
"""

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import free_text
from app.models import Photo
from app.services import enrichment, uploads
from app.services.enrichment import Keyed
from app.services.wikimedia.collector import Harvest
from app.services.wikimedia.parser import CommonsPhoto

CREDIT_LABEL = "Википедия"


@dataclass(slots=True)
class WikimediaReport:
    photos_added: int = 0
    places_photographed: int = 0
    areas_photographed: int = 0
    descriptions_added: int = 0

    def summary(self) -> dict[str, int]:
        return {
            "photos_added": self.photos_added,
            "places_photographed": self.places_photographed,
            "areas_photographed": self.areas_photographed,
            "descriptions_added": self.descriptions_added,
        }


def _rows(photos: Sequence[CommonsPhoto], now: datetime, **owner: int) -> list[Photo]:
    return [
        Photo(
            **owner,
            position=position,
            url=photo.url,
            width=photo.width,
            height=photo.height,
            sha256=hashlib.sha256(photo.source_url.encode()).hexdigest(),
            credit_author=photo.author,
            credit_license=photo.license,
            credit_url=photo.source_url,
            created_at=now,
        )
        for position, photo in enumerate(photos)
    ]


async def _attach_photos(
    session: AsyncSession, harvest: Harvest, keyed: Keyed, now: datetime, report: WikimediaReport
) -> None:
    with_photos = set(await session.scalars(select(Photo.place_id).where(Photo.place_id.is_not(None))))
    with_area_photos = set(await session.scalars(select(Photo.area_id).where(Photo.area_id.is_not(None))))
    for key, photos in harvest.photos.items():
        place, area = keyed.places.get(key), keyed.areas.get(key)
        if place is not None and place.id not in with_photos:
            rows = _rows(photos, now)
            session.add_all(rows)
            await uploads.set_place_photos(session, place, rows)
            with_photos.add(place.id)
            report.photos_added += len(rows)
            report.places_photographed += 1
        if area is not None and area.id not in with_area_photos:
            session.add_all(_rows(photos, now, area_id=area.id))
            with_area_photos.add(area.id)
            report.photos_added += len(photos)
            report.areas_photographed += 1
    await session.flush()


async def apply_snapshot(
    session: AsyncSession, harvest: Harvest, keyed: Keyed, now: datetime
) -> WikimediaReport:
    """Database phase; idempotent. Commits nothing itself."""
    report = WikimediaReport()
    await _attach_photos(session, harvest, keyed, now, report)
    for key, summary in harvest.summaries.items():
        credit = enrichment.Credit(CREDIT_LABEL, free_text.TEXT_LICENSE, summary.url)
        for target in (keyed.places.get(key), keyed.areas.get(key)):
            if target is not None and await enrichment.describe(
                session, target, summary.text, credit, now, replaces_imports=False
            ):
                report.descriptions_added += 1
    return report
