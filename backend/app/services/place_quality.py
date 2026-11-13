"""Hidden usefulness of places (SPEC §24.3). Internal: no public schema ever carries it."""

from collections.abc import Collection
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PlaceQuality


async def usefulness_for(session: AsyncSession, place_ids: Collection[int]) -> dict[int, int]:
    """Usefulness 0..100 of the given places in one query; places never rated are left out
    (imported ones, seed data, places from before the screening): treat them as neutral."""
    if not place_ids:
        return {}
    rows = await session.execute(
        select(PlaceQuality.place_id, PlaceQuality.usefulness).where(PlaceQuality.place_id.in_(place_ids))
    )
    return dict(rows.all())


async def store(session: AsyncSession, place_id: int, usefulness: int, *, model: str, now: datetime) -> None:
    row = await session.get(PlaceQuality, place_id)
    if row is None:
        session.add(PlaceQuality(place_id=place_id, usefulness=usefulness, model=model, updated_at=now))
        return
    row.usefulness, row.model, row.updated_at = usefulness, model, now
