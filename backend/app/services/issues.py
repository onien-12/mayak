"""Issue lifecycle: community-driven stage changes and official information (SPEC §3.3)."""

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.errors import BadRequestError
from app.domain import issue_stage, trust
from app.domain.enums import (
    HistoryKind,
    InfoSource,
    IssueStage,
    NotificationKind,
    ReputationReason,
)
from app.models import Place, User, Vote
from app.schemas.place import OfficialInfoIn, PlaceDetail
from app.services import areas, history, notifications, place_details, place_queries, reputation

_OFFICIAL_FIELDS = ("official_note", "expected_fix_at", "appeal_number", "responsible_org")


async def _notify_followers(
    session: AsyncSession, place: Place, title: str, now: datetime, *, except_user_id: int | None
) -> None:
    """The author and everyone who voted follow the issue."""
    voter_ids = await session.scalars(select(Vote.user_id).where(Vote.place_id == place.id))
    for user_id in {place.author_id, *voter_ids} - {except_user_id}:
        notifications.notify(
            session,
            user_id=user_id,
            kind=NotificationKind.ISSUE_UPDATE,
            title=title,
            body=f"Проблема «{place.title}».",
            link=notifications.place_link(place.id),
            now=now,
        )


async def set_stage(
    session: AsyncSession,
    place: Place,
    stage: IssueStage,
    now: datetime,
    *,
    moderator: User | None = None,
    voter: User | None = None,
) -> None:
    """Move the issue to `stage`, write history and notify followers.

    The change is made either by a `moderator` or by the community, in which case `voter` is
    the person whose vote tipped the balance. Whoever caused the change is not notified.
    """
    issue = place.issue
    issue.stage = stage
    issue.stage_changed_at = now
    issue.resolved_at = None if issue_stage.is_open(stage) else now
    title = f"Статус проблемы: «{issue_stage.STAGE_LABELS[stage]}»"
    history.record(session, place, HistoryKind.ISSUE_STAGE, title, now=now, actor=moderator)
    await areas.refresh_area(session, place.area_id, now)
    initiator = moderator or voter
    await _notify_followers(session, place, title, now, except_user_id=initiator.id if initiator else None)
    if stage is IssueStage.RESOLVED and moderator is None:
        await reputation.award_once_per_place(
            session, place.author, ReputationReason.ISSUE_RESOLVED, place_id=place.id, now=now
        )


async def advance_by_votes(
    session: AsyncSession,
    place: Place,
    votes: Sequence[trust.VoteSample],
    now: datetime,
    *,
    voter: User | None = None,
) -> None:
    """Confirm or resolve the issue when the community votes say so."""
    issue = place.issue
    since_change = trust.aggregate((vote for vote in votes if vote.cast_at > issue.stage_changed_at), now)
    next_stage = issue_stage.stage_after_votes(
        issue.stage,
        present_total=trust.aggregate(votes, now).present,
        absent_since_change=since_change.absent,
        present_since_change=since_change.present,
    )
    if next_stage is not issue.stage:
        await set_stage(session, place, next_stage, now, voter=voter)


async def apply_official_info(
    session: AsyncSession, moderator: User, place: Place, payload: OfficialInfoIn, now: datetime
) -> None:
    issue = place.issue
    provided = payload.model_fields_set
    info_changed = False
    for name in _OFFICIAL_FIELDS:
        value = getattr(payload, name) or None
        if name in provided and getattr(issue, name) != value:
            setattr(issue, name, value)
            info_changed = True
    if any(getattr(issue, name) is not None for name in _OFFICIAL_FIELDS):
        issue.source = InfoSource.OFFICIAL
    if info_changed:
        history.record(
            session,
            place,
            HistoryKind.OFFICIAL_INFO,
            "Добавлена официальная информация",
            now=now,
            actor=moderator,
        )
    if payload.stage is not None and payload.stage is not issue.stage:
        await set_stage(session, place, payload.stage, now, moderator=moderator)
    elif info_changed:
        await _notify_followers(
            session, place, "Появилась официальная информация", now, except_user_id=moderator.id
        )
    place.updated_at = now


async def update_official_info(
    session: AsyncSession, moderator: User, place_id: int, payload: OfficialInfoIn
) -> PlaceDetail:
    now = utcnow()
    place = await place_queries.get_visible_place(session, place_id, moderator)
    if place.issue is None:
        raise BadRequestError("Официальную информацию можно добавить только к проблеме.")
    await apply_official_info(session, moderator, place, payload, now)
    await session.commit()
    return await place_details.build(session, place, moderator, now)
