"""The best preview among an object's photos (SPEC §25): measurements and the choice, and the
cover borrowed from a map service's photos for an object that has none (SPEC §20)."""

import asyncio
import logging
from collections import defaultdict
from collections.abc import Collection, Sequence
from datetime import datetime
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.domain import cover
from app.domain.areas import COUNTED_LAYERS
from app.domain.cover import Candidate, CatalogueCover, CataloguePhotos, Picture
from app.domain.enums import PUBLIC_STATUSES
from app.models import Area, Photo, PhotoMetrics, Place
from app.services import combined_ratings, photo_metrics
from app.services.experimental.external_reviews import photos as catalogue_photos

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


async def borrowed_for_places(session: AsyncSession, places: Sequence[Place]) -> dict[int, CatalogueCover]:
    """Covers borrowed from the map services for the places of a page that have none of their
    own; requires `place.area` loaded. Empty while the external sources are off."""
    bare = [place for place in places if place.cover_url is None]
    if not bare or not combined_ratings.enabled(session):
        return {}
    offers = await catalogue_photos.for_places(session, bare)
    borrowed = {
        place.id: cover.catalogue_cover(place.cover_url, [offers.get(place.id, [])]) for place in bare
    }
    return {identifier: found for identifier, found in borrowed.items() if found is not None}


async def borrowed_for_areas(session: AsyncSession, areas: Sequence[Area]) -> dict[int, CatalogueCover]:
    """Covers borrowed for the locations of a page that have none: the location's own entry at
    a service first, then the entries of its places, best place first (as `areas` ranks them)."""
    bare = [area for area in areas if area.cover_url is None]
    if not bare or not combined_ratings.enabled(session):
        return {}
    own = await catalogue_photos.for_areas(session, bare)
    members = list(
        await session.scalars(
            select(Place)
            .options(joinedload(Place.area))
            .where(
                Place.area_id.in_([area.id for area in bare]),
                Place.status.in_(PUBLIC_STATUSES),
                Place.layer.in_(COUNTED_LAYERS),
                Place.id.in_(catalogue_photos.matched_places()),
            )
            .order_by(Place.trust_score.desc(), Place.rating_avg.desc().nulls_last(), Place.id)
        )
    )
    inside = await catalogue_photos.for_places(session, members)
    by_area: dict[int, list[list[CataloguePhotos]]] = defaultdict(list)
    for place in members:
        if place.area_id is not None and place.id in inside:
            by_area[place.area_id].append(inside[place.id])
    borrowed = {
        area.id: cover.catalogue_cover(area.cover_url, [own.get(area.id, []), *by_area[area.id]])
        for area in bare
    }
    return {identifier: found for identifier, found in borrowed.items() if found is not None}
