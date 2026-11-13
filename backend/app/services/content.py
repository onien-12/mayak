"""Automatic content screening that needs the database (duplicates); text rules live in the domain."""

from collections.abc import Mapping
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ContentFlaggedError, FieldValidationError
from app.domain import content_check, geo, gibberish, hold_reasons
from app.domain.enums import Layer, PlaceStatus
from app.domain.limits import DAY
from app.models import EventDetails, Place
from app.schemas.place import EventInput

MASHED_ADDRESS_HINT = (
    "Адрес похож на случайный набор букв — поправьте его или оставьте тот, что определился по точке."
)


def gibberish_reasons(texts: Mapping[str, str | None]) -> list[str]:
    """Keyboard mashing in any of the labelled texts holds the item (SPEC §24.1)."""
    return [
        hold_reasons.GIBBERISH.format(label=label)
        for label, text in texts.items()
        if gibberish.is_gibberish(text)
    ]


def ensure_sane_address(address: str | None, texts: Mapping[str, str | None]) -> None:
    """Only a mashed address is said openly (422 on `address`); when the texts are mashed too,
    the publication is held instead (and its author told why)."""
    if gibberish.address_is_mashed(address) and not gibberish_reasons(texts):
        raise FieldValidationError("address", MASHED_ADDRESS_HINT)


def ensure_clean_text(text: str) -> None:
    """Reviews and comments are cheap to retype, so flagged text is rejected with a hint.
    Profanity is not a flag: it is masked on display (SPEC §24.5)."""
    flags = content_check.text_flags(text)
    if flags:
        hint = "; ".join(flag.lower() for flag in flags)
        raise ContentFlaggedError(
            f"Текст не прошёл автоматическую проверку: {hint}. Исправьте и отправьте снова."
        )


def _overlaps(event: EventInput | None, starts_at: datetime | None, ends_at: datetime | None) -> bool:
    """Events with the same title are duplicates only when they overlap in time."""
    if event is None or starts_at is None or ends_at is None:
        return True
    return starts_at <= event.ends_at and ends_at >= event.starts_at


async def duplicate_flags(
    session: AsyncSession,
    *,
    author_id: int,
    layer: Layer,
    title: str,
    lat: float,
    lng: float,
    event: EventInput | None,
    now: datetime,
    exclude_place_id: int | None = None,
) -> list[str]:
    """Same author + same title within 24 hours, or the same title within 50 metres."""
    statement = (
        select(
            Place.id,
            Place.author_id,
            Place.lat,
            Place.lng,
            Place.created_at,
            EventDetails.starts_at,
            EventDetails.ends_at,
        )
        .outerjoin(EventDetails, EventDetails.place_id == Place.id)
        .where(
            Place.title_key == content_check.normalize_title(title),
            Place.layer == layer,
            Place.status != PlaceStatus.ARCHIVED,
        )
    )
    if exclude_place_id is not None:
        statement = statement.where(Place.id != exclude_place_id)
    flags: list[str] = []
    for row in await session.execute(statement):
        if not _overlaps(event, row.starts_at, row.ends_at):
            continue
        if row.author_id == author_id and now - row.created_at < DAY:
            flags.append(content_check.FLAG_DUPLICATE_BY_AUTHOR)
        if geo.haversine_m(lat, lng, row.lat, row.lng) <= content_check.DUPLICATE_RADIUS_M:
            flags.append(content_check.FLAG_DUPLICATE_NEARBY)
    return list(dict.fromkeys(flags))
