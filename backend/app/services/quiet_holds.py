"""Quiet holds (SPEC §24.1): lookups and the visibility clauses every listing applies.

An item in an active hold (screening or held) is invisible to everyone but its author and
moderators. Places and routes are additionally kept `pending`, so the ordinary visibility
rules already hide them; comments, reviews and notes are kept `is_hidden`; photos have no flag
of their own and are filtered through `active_ids`.
"""

from collections.abc import Collection
from datetime import datetime

from sqlalchemy import ColumnElement, Select, and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ACTIVE_HOLD_STATES, AiTarget, HoldSource, HoldState
from app.models import QuietHold


async def open_window(
    session: AsyncSession,
    target_type: AiTarget,
    target_id: int,
    author_id: int,
    *,
    now: datetime,
    shown_status: str | None = None,
    parent: tuple[AiTarget, int] | None = None,
    announce: bool = False,
    heuristic_reasons: Collection[str] = (),
) -> QuietHold:
    """Start the screening window of a new or changed item; the screener decides later.

    An item already in a window keeps the status its author saw before; an item already held
    stays held until a moderator decides (a new version is still checked, for the moderator).
    Reasons found by the heuristics hold the item as soon as the screener looks at it.
    """
    hold = await find(session, target_type, target_id)
    if hold is None:
        hold = QuietHold(target_type=target_type, target_id=target_id, revision=0, created_at=now)
        session.add(hold)
    if hold.state not in ACTIVE_HOLD_STATES:
        hold.state = HoldState.SCREENING
        hold.source = None
        hold.reasons = []
        hold.shown_status = shown_status
        hold.penalized = False
        hold.announce = announce
        hold.decided_at = None
    else:
        hold.announce = hold.announce or announce
    hold.author_id = author_id
    hold.parent_type, hold.parent_id = parent if parent else (None, None)
    if heuristic_reasons:
        hold.reasons = list(dict.fromkeys([*hold.reasons, *heuristic_reasons]))
        hold.source = hold.source or HoldSource.HEURISTIC
    hold.revision = (hold.revision or 0) + 1
    hold.updated_at = now
    await session.flush()
    return hold


async def find(session: AsyncSession, target_type: AiTarget, target_id: int) -> QuietHold | None:
    return await session.scalar(
        select(QuietHold).where(QuietHold.target_type == target_type, QuietHold.target_id == target_id)
    )


async def find_active(session: AsyncSession, target_type: AiTarget, target_id: int) -> QuietHold | None:
    hold = await find(session, target_type, target_id)
    return hold if hold is not None and hold.state in ACTIVE_HOLD_STATES else None


async def active_by_target(
    session: AsyncSession, target_type: AiTarget, target_ids: Collection[int]
) -> dict[int, QuietHold]:
    """Active holds of several items of one kind, in one query."""
    if not target_ids:
        return {}
    rows = await session.scalars(
        select(QuietHold).where(
            QuietHold.target_type == target_type,
            QuietHold.target_id.in_(target_ids),
            QuietHold.state.in_(ACTIVE_HOLD_STATES),
        )
    )
    return {hold.target_id: hold for hold in rows}


async def children(session: AsyncSession, parent: QuietHold) -> list[QuietHold]:
    """Holds screened together with `parent` (its photos, the rest of an event series)."""
    rows = await session.scalars(
        select(QuietHold)
        .where(QuietHold.parent_type == parent.target_type, QuietHold.parent_id == parent.target_id)
        .order_by(QuietHold.id)
    )
    return list(rows)


def active_ids(target_type: AiTarget) -> Select[tuple[int]]:
    """Ids of the items of one kind that are screened or held right now."""
    return select(QuietHold.target_id).where(
        QuietHold.target_type == target_type, QuietHold.state.in_(ACTIVE_HOLD_STATES)
    )


def own_shown_as(
    target_type: AiTarget,
    id_column: ColumnElement[int],
    author_column: ColumnElement[int],
    viewer_id: int,
    statuses: Collection[str],
) -> ColumnElement[bool]:
    """The viewer's own items in an active hold that look to them as one of `statuses`."""
    shown = select(QuietHold.target_id).where(
        QuietHold.target_type == target_type,
        QuietHold.state.in_(ACTIVE_HOLD_STATES),
        QuietHold.author_id == viewer_id,
        QuietHold.shown_status.in_([str(status) for status in statuses]),
    )
    return and_(author_column == viewer_id, id_column.in_(shown))


async def withdraw(session: AsyncSession, target_type: AiTarget, target_id: int, now: datetime) -> None:
    """The author deleted or archived the item: nothing is left to screen or to decide."""
    hold = await find_active(session, target_type, target_id)
    if hold is not None:
        hold.state = HoldState.RELEASED
        hold.updated_at = hold.decided_at = now
