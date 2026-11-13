"""The best preview among an object's photos (SPEC §25): measurements and the choice."""

import asyncio
import logging
from collections.abc import Collection, Sequence
from datetime import datetime
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import cover
from app.domain.cover import Candidate, Picture
from app.models import Photo, PhotoMetrics, Place
from app.services import photo_metrics

logger = logging.getLogger(__name__)
MEDIA_URL_PREFIX = "/media/"


def store_picture(session: AsyncSession, photo: Photo, picture: Picture, now: datetime) -> None:
    session.add(
        PhotoMetrics(
            photo_id=photo.id,
            sharpness=picture.sharpness,
            exposure=picture.exposure,
            contrast=picture.contrast,
            colour=picture.colour,
            photo=picture.photo,
            measured_at=now,
        )
    )


async def pictures_for(session: AsyncSession, photo_ids: Collection[int]) -> dict[int, Picture]:
    """Measurements of the given photos in one query; hot-linked photos have none."""
    if not photo_ids:
        return {}
    rows = await session.scalars(select(PhotoMetrics).where(PhotoMetrics.photo_id.in_(photo_ids)))
    return {
        row.photo_id: Picture(row.sharpness, row.exposure, row.contrast, row.colour, row.photo)
        for row in rows
    }


def candidate(photo: Photo, picture: Picture | None) -> Candidate:
    return Candidate(photo.width, photo.height, own=photo.credit is None, picture=picture)


async def best(session: AsyncSession, photos: Sequence[Photo]) -> Photo | None:
    """The photo that makes the best preview; the earlier one among equals."""
    if len(photos) < 2:
        return photos[0] if photos else None
    pictures = await pictures_for(session, [photo.id for photo in photos])
    index = cover.best([candidate(photo, pictures.get(photo.id)) for photo in photos])
    return photos[index] if index is not None else None


async def scores_by_url(session: AsyncSession, urls: Collection[str]) -> dict[str, float]:
    """Cover scores of the photos behind the given URLs (one query); unknown URLs are left out."""
    if not urls:
        return {}
    rows = list(await session.scalars(select(Photo).where(Photo.url.in_(urls))))
    pictures = await pictures_for(session, [photo.id for photo in rows])
    return {photo.url: cover.score(candidate(photo, pictures.get(photo.id))) for photo in rows}


async def measure_missing(session: AsyncSession, media_dir: Path, now: datetime) -> int:
    """Measure our own files that were uploaded before the measurements existed."""
    rows = await session.scalars(
        select(Photo)
        .outerjoin(PhotoMetrics, PhotoMetrics.photo_id == Photo.id)
        .where(PhotoMetrics.photo_id.is_(None), Photo.url.startswith(MEDIA_URL_PREFIX))
    )
    measured = 0
    for photo in rows:
        picture = await asyncio.to_thread(photo_metrics.measure_file, media_dir / Path(photo.url).name)
        if picture is None:
            continue
        store_picture(session, photo, picture, now)
        measured += 1
    await session.flush()
    return measured


async def places_with_a_choice(session: AsyncSession) -> list[Place]:
    """Places that have more than one photo — the only ones whose cover can change."""
    several = select(Photo.place_id).group_by(Photo.place_id).having(func.count() > 1)
    return list(await session.scalars(select(Place).where(Place.id.in_(several))))
