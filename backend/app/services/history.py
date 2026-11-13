"""Place history («История» in the card): every status change, edit and decision."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.domain.enums import HistoryKind, PlaceStatus
from app.models import Place, PlaceHistory, User
from app.schemas.place import HistoryEntry


def record(
    session: AsyncSession,
    place: Place,
    kind: HistoryKind,
    message: str,
    *,
    now: datetime,
    actor: User | None = None,
    old_status: PlaceStatus | None = None,
    new_status: PlaceStatus | None = None,
) -> None:
    session.add(
        PlaceHistory(
            place_id=place.id,
            kind=kind,
            message=message,
            actor_id=actor.id if actor else None,
            old_status=old_status,
            new_status=new_status,
            created_at=now,
        )
    )


async def list_for_place(session: AsyncSession, place_id: int) -> list[HistoryEntry]:
    rows = await session.scalars(
        select(PlaceHistory)
        .where(PlaceHistory.place_id == place_id)
        .options(joinedload(PlaceHistory.actor))
        .order_by(PlaceHistory.created_at.desc(), PlaceHistory.id.desc())
    )
    return [HistoryEntry.model_validate(row) for row in rows]
