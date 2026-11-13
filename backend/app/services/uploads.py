"""Photo uploads: validation, re-encoding and attaching photos to places (SPEC §6)."""

import asyncio
import hashlib
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.errors import (
    ConflictError,
    FieldValidationError,
    PayloadTooLargeError,
    UnsupportedMediaError,
)
from app.domain import content_check, limits
from app.domain.cover import Picture
from app.domain.enums import ACTIVE_HOLD_STATES, AiTarget, HistoryKind, ModerationTrigger
from app.models import Photo, Place, QuietHold, User
from app.schemas.place import PhotoOut
from app.services import areas, covers, history, moderation_cases, photo_metrics, quiet_holds

ALLOWED_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})
JPEG_QUALITY = 85
MEDIA_URL_PREFIX = "/media"
_FILE_NAME_HASH_LENGTH = 32
_UNSUPPORTED_MESSAGE = "Поддерживаются только изображения JPEG, PNG и WebP."


@dataclass(frozen=True, slots=True)
class ProcessedImage:
    content: bytes
    width: int
    height: int
    sha256: str
    picture: Picture
    """Measurements for the cover choice (SPEC §25), taken while the image is in memory."""


def process_image(data: bytes) -> ProcessedImage:
    """Verify the upload is a real image and re-encode it as an EXIF-free JPEG of bounded size."""
    try:
        with Image.open(BytesIO(data)) as probe:
            if probe.format not in ALLOWED_FORMATS:
                raise UnsupportedMediaError(_UNSUPPORTED_MESSAGE)
            probe.verify()
        with Image.open(BytesIO(data)) as image:
            oriented = ImageOps.exif_transpose(image)
            flattened = _flatten(oriented)
            flattened.thumbnail((limits.MAX_IMAGE_SIDE_PX, limits.MAX_IMAGE_SIDE_PX))
            buffer = BytesIO()
            flattened.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            picture = photo_metrics.measure(flattened)
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError) as error:
        raise UnsupportedMediaError(_UNSUPPORTED_MESSAGE) from error
    content = buffer.getvalue()
    return ProcessedImage(
        content, flattened.width, flattened.height, hashlib.sha256(content).hexdigest(), picture
    )


def _flatten(image: Image.Image) -> Image.Image:
    """RGB copy; transparent pixels are laid over white."""
    if image.mode in ("RGBA", "LA", "P"):
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return image.convert("RGB")


async def store_image(
    session: AsyncSession, uploader: User, data: bytes, media_dir: Path, now: datetime
) -> Photo:
    processed = await asyncio.to_thread(process_image, data)
    file_name = f"{processed.sha256[:_FILE_NAME_HASH_LENGTH]}.jpg"
    await asyncio.to_thread(_write_once, media_dir / file_name, processed.content)
    photo = Photo(
        uploader_id=uploader.id,
        url=f"{MEDIA_URL_PREFIX}/{file_name}",
        width=processed.width,
        height=processed.height,
        sha256=processed.sha256,
        created_at=now,
    )
    session.add(photo)
    await session.flush()
    covers.store_picture(session, photo, processed.picture, now)
    return photo


def _write_once(path: Path, content: bytes) -> None:
    """Files are content-addressed, so an existing file already holds the same bytes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_bytes(content)


async def upload_photo(session: AsyncSession, user: User, data: bytes, media_dir: Path) -> PhotoOut:
    if len(data) > limits.MAX_UPLOAD_BYTES:
        raise PayloadTooLargeError("Файл слишком большой: максимум 8 МБ.")
    photo = await store_image(session, user, data, media_dir, utcnow())
    await session.commit()
    return PhotoOut.model_validate(photo)


def _users_first(photos: list[Photo]) -> list[Photo]:
    """The community's own photos always come before freely licensed external ones."""
    return sorted(photos, key=lambda photo: photo.credit is not None)


async def list_place_photos(session: AsyncSession, place_id: int) -> list[Photo]:
    """Every photo of the place, held ones included; what a viewer may see is `visible_place_photos`."""
    rows = await session.scalars(
        select(Photo).where(Photo.place_id == place_id).order_by(Photo.position, Photo.id)
    )
    return _users_first(list(rows))


async def visible_place_photos(session: AsyncSession, place_id: int, viewer: User | None) -> list[Photo]:
    """A photo still being screened or held is shown only to its uploader and moderators."""
    photos = await list_place_photos(session, place_id)
    if viewer is not None and viewer.is_staff:
        return photos
    held = await quiet_holds.active_by_target(session, AiTarget.PHOTO, [photo.id for photo in photos])
    return [
        photo
        for photo in photos
        if photo.id not in held or (viewer is not None and photo.uploader_id == viewer.id)
    ]


async def _held_on_their_own(session: AsyncSession, photos: list[Photo]) -> set[int]:
    """Photos in an active hold of their own: added to a place that is otherwise fine. Photos
    screened together with their place need no exclusion, the place itself is hidden."""
    if not photos:
        return set()
    rows = await session.scalars(
        select(QuietHold.target_id).where(
            QuietHold.target_type == AiTarget.PHOTO,
            QuietHold.target_id.in_([photo.id for photo in photos]),
            QuietHold.state.in_(ACTIVE_HOLD_STATES),
            QuietHold.parent_type.is_(None),
        )
    )
    return set(rows)


async def claim_photos(
    session: AsyncSession, user: User, photo_ids: list[int], *, place: Place | None = None
) -> list[Photo]:
    """Photos in the requested order: own free uploads, plus those already on `place`."""
    if not photo_ids:
        return []
    rows = await session.scalars(select(Photo).where(Photo.id.in_(photo_ids)))
    by_id = {photo.id: photo for photo in rows}
    claimed: list[Photo] = []
    for photo_id in dict.fromkeys(photo_ids):
        photo = by_id.get(photo_id)
        already_here = photo is not None and place is not None and photo.place_id == place.id
        is_own_free = photo is not None and photo.uploader_id == user.id and is_free(photo)
        if photo is None or not (already_here or is_own_free):
            raise FieldValidationError("photo_ids", "Можно прикрепить только свои загруженные фото.")
        claimed.append(photo)
    return claimed


def is_free(photo: Photo) -> bool:
    """An own upload not attached to any place, route stop or area yet."""
    return photo.place_id is None and photo.route_stop_id is None and photo.area_id is None


async def set_place_photos(session: AsyncSession, place: Place, photos: list[Photo]) -> None:
    """Make `photos` the full ordered photo list of the place and refresh its cover."""
    keep = {photo.id for photo in photos}
    for current in await list_place_photos(session, place.id):
        if current.id not in keep:
            current.place_id = None
    ordered = _users_first(photos)
    for position, photo in enumerate(ordered):
        photo.place_id = place.id
        photo.position = position
    await _apply_cover(session, place, ordered)


async def _apply_cover(session: AsyncSession, place: Place, ordered: list[Photo]) -> None:
    """The best preview among the photos nobody is holding back (SPEC §25, §24.1), else the
    imported image."""
    held = await _held_on_their_own(session, ordered)
    cover = await covers.best(session, [photo for photo in ordered if photo.id not in held])
    place.cover_url = cover.url if cover else place.external_image_url
    place.cover_credit = cover.credit if cover else None


async def refresh_covers(session: AsyncSession, media_dir: Path, now: datetime) -> None:
    """Start-up: measure the files uploaded before the measurements existed, then let every
    place with several photos choose its cover again (SPEC §25)."""
    await covers.measure_missing(session, media_dir, now)
    for place in await covers.places_with_a_choice(session):
        await _apply_cover(session, place, await list_place_photos(session, place.id))


async def refresh_cover(session: AsyncSession, place: Place) -> None:
    """After a hold on one of the place's photos was created, released or removed."""
    await session.flush()
    await _apply_cover(session, place, await list_place_photos(session, place.id))


async def image_flags(session: AsyncSession, photos: list[Photo]) -> list[str]:
    """Flag photos whose content is already attached to more than the allowed number of places."""
    hashes = {photo.sha256 for photo in photos}
    if not hashes:
        return []
    reused = await session.scalar(
        select(func.count()).select_from(
            select(Photo.sha256)
            .where(Photo.sha256.in_(hashes), Photo.place_id.is_not(None))
            .group_by(Photo.sha256)
            .having(func.count(Photo.place_id.distinct()) >= content_check.SAME_IMAGE_MAX_PLACES)
            .subquery()
        )
    )
    return [content_check.FLAG_IMAGE_REUSED] if reused else []


async def open_photo_windows(
    session: AsyncSession,
    uploader: User,
    photos: list[Photo],
    now: datetime,
    *,
    parent: tuple[AiTarget, int] | None = None,
) -> None:
    """Each photo a person attaches is checked on its own (SPEC §24.2); freely licensed imported
    photos are not. With `parent` the photo is decided together with that place or route."""
    for photo in photos:
        if photo.credit is None:
            await quiet_holds.open_window(
                session, AiTarget.PHOTO, photo.id, uploader.id, now=now, parent=parent
            )


def record_photos_added(
    session: AsyncSession, place: Place, actor: User | None, count: int, now: datetime
) -> None:
    history.record(session, place, HistoryKind.PHOTOS_ADDED, f"Добавлено фото: {count}", now=now, actor=actor)


async def add_photos(session: AsyncSession, user: User, place: Place, photo_ids: list[int]) -> None:
    """Anyone may add their own uploads to a visible place, up to the per-place maximum.

    Screened photos are announced in the history only once they are released."""
    now = utcnow()
    photos = await claim_photos(session, user, photo_ids)
    existing = await list_place_photos(session, place.id)
    own = [photo for photo in existing if photo.credit is None]
    if len(own) + len(photos) > limits.MAX_PHOTOS_PER_PLACE:
        raise ConflictError(f"У точки может быть не больше {limits.MAX_PHOTOS_PER_PLACE} фото.")
    flags = await image_flags(session, photos)
    screened = not user.is_staff
    if screened:
        await open_photo_windows(session, user, photos, now)
    await set_place_photos(session, place, [*existing, *photos])
    if not screened:
        record_photos_added(session, place, user, len(photos), now)
    if flags:
        await moderation_cases.open_case(
            session, moderation_cases.place_target(place), ModerationTrigger.AUTO_IMAGE, now=now, flags=flags
        )
    place.updated_at = now
    await areas.refresh_area(session, place.area_id, now)
    await session.commit()
