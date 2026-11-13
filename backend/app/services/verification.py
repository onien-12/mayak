"""Collective verification: votes, trust score and automatic status derivation (SPEC §3)."""

from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.errors import ConflictError, FieldValidationError, ForbiddenError
from app.domain import geo, issue_stage, levels, trust
from app.domain.enums import (
    LOCKED_STATUSES,
    PUBLIC_STATUSES,
    AiTarget,
    ComplaintState,
    HistoryKind,
    Layer,
    ModerationTrigger,
    NotificationKind,
    PlaceStatus,
    ReputationReason,
    TargetType,
    VoteKind,
)
from app.models import Complaint, Place, User, Vote
from app.schemas.place import PlaceDetail, VoteIn
from app.services import (
    areas,
    history,
    issues,
    locality,
    moderation_cases,
    notifications,
    place_details,
    place_queries,
    reputation,
)

STATUS_MESSAGES: dict[PlaceStatus, str] = {
    PlaceStatus.UNVERIFIED: "Подтверждений стало недостаточно — точка снова не проверена",
    PlaceStatus.PRELIMINARY: "Точка получила первые подтверждения жителей",
    PlaceStatus.VERIFIED: "Точка подтверждена жителями",
    PlaceStatus.NEEDS_REVIEW: "Противоречивые сигналы — точка требует уточнения",
    PlaceStatus.HIDDEN: "Точка скрыта: жители сообщают, что её больше нет",
}


async def _vote_samples(session: AsyncSession, place_id: int) -> list[trust.VoteSample]:
    rows = await session.execute(
        select(Vote.kind, Vote.weight, Vote.created_at).where(Vote.place_id == place_id)
    )
    return [trust.VoteSample(row.kind, row.weight, row.created_at) for row in rows]


async def _open_complaints_weight(session: AsyncSession, place_id: int) -> float:
    weight = await session.scalar(
        select(func.sum(Complaint.weight)).where(
            Complaint.target_type == TargetType.PLACE,
            Complaint.target_id == place_id,
            Complaint.state == ComplaintState.OPEN,
        )
    )
    return weight or 0.0


def _totals(place: Place, votes: Iterable[trust.VoteSample], now: datetime) -> trust.VoteTotals:
    """Vote totals of the place; an external source adds its baseline confirmation."""
    totals = trust.aggregate(votes, now)
    return trust.with_external_baseline(totals, place.external_source) if place.external_source else totals


def _apply_trust(place: Place, totals: trust.VoteTotals, now: datetime) -> None:
    place.last_confirmed_at = totals.last_present_at
    place.trust_score = trust.trust_score(
        place.effective_author_prior, totals, totals.last_present_at or place.created_at, now
    )


def _disputing_absent(
    place: Place, votes: list[trust.VoteSample], totals: trust.VoteTotals, now: datetime
) -> float:
    """Absent weight cast after the last moderator review of the place."""
    if place.reviewed_at is None:
        return totals.absent
    return trust.aggregate((vote for vote in votes if vote.cast_at > place.reviewed_at), now).absent


async def _reward_status(session: AsyncSession, place: Place, status: PlaceStatus, now: datetime) -> None:
    """Reputation and notifications attached to a status the place has just reached."""
    author = place.author
    link = notifications.place_link(place.id)
    if status is PlaceStatus.PRELIMINARY:
        await reputation.award_once_per_place(
            session, author, ReputationReason.PLACE_PRELIMINARY, place_id=place.id, now=now
        )
    elif status is PlaceStatus.VERIFIED:
        rewarded = await reputation.award_once_per_place(
            session, author, ReputationReason.PLACE_VERIFIED, place_id=place.id, now=now
        )
        if rewarded:
            notifications.notify(
                session,
                user_id=author.id,
                kind=NotificationKind.PLACE_VERIFIED,
                title="Ваша точка подтверждена",
                body=f"«{place.title}» получила достаточно независимых подтверждений.",
                link=link,
                now=now,
            )
    elif status is PlaceStatus.HIDDEN and not author.is_system:
        await reputation.award(
            session, author, ReputationReason.PLACE_HIDDEN_AUTO, now=now, place_id=place.id
        )
        notifications.notify(
            session,
            user_id=author.id,
            kind=NotificationKind.MODERATION,
            title="Точка скрыта с карты",
            body=f"Жители сообщают, что «{place.title}» больше нет. Модератор проверит точку.",
            link=link,
            now=now,
        )


async def recompute_place(
    session: AsyncSession,
    place: Place,
    now: datetime,
    *,
    moderator_override: bool = False,
    voter: User | None = None,
) -> None:
    """Recompute trust score and, unless the status is locked, derive the status from votes.

    Called after every vote, complaint and moderation decision. `moderator_override` unlocks
    `pending` / `hidden` / `archived` for a moderator decision; the caller then writes the
    history entry itself. `voter` is the user whose vote caused the recompute, if any.
    Requires `place.author` and `place.issue` to be loaded.
    """
    votes = await _vote_samples(session, place.id)
    totals = _totals(place, votes, now)
    _apply_trust(place, totals, now)
    if place.status in LOCKED_STATUSES and not moderator_override:
        return
    open_case = await moderation_cases.find_open_case(session, AiTarget.PLACE, place.id)

    decision = trust.derive_status(
        totals=totals,
        author_prior=place.author_prior,
        complaints_weight=await _open_complaints_weight(session, place.id),
        disputing_absent=_disputing_absent(place, votes, totals, now),
        absent_rules_apply=place.layer is not Layer.ISSUE,
        flagged_by_ai=open_case is not None and ModerationTrigger.AUTO_AI.value in open_case.triggers,
    )
    if decision.trigger is not None:
        await moderation_cases.open_case(
            session, moderation_cases.place_target(place), decision.trigger, now=now
        )
    if decision.status is not place.status:
        if not moderator_override:
            history.record(
                session,
                place,
                HistoryKind.STATUS_CHANGED,
                STATUS_MESSAGES[decision.status],
                now=now,
                old_status=place.status,
                new_status=decision.status,
            )
        place.status = decision.status
        await _reward_status(session, place, decision.status, now)
        await areas.refresh_area(session, place.area_id, now)
    stage_follows_votes = place.layer is Layer.ISSUE and place.external_source is None
    if stage_follows_votes and place.status in PUBLIC_STATUSES:
        await issues.advance_by_votes(session, place, votes, now, voter=voter)


def _vote_weight(place: Place, voter: User, *, is_near: bool, now: datetime) -> float:
    """Weight frozen at cast time: level × account age × physical proximity × locality.

    Imported outages keep their stage from the source, so the locality factor is not applied.
    """
    weight = trust.cast_weight(
        levels.vote_weight(voter.level, voter.role, now - voter.created_at), is_near=is_near
    )
    if place.external_source is not None:
        return weight
    return weight * locality.factor_for(voter, place.layer, place.category.slug, place.lat, place.lng)


async def apply_vote(
    session: AsyncSession,
    place: Place,
    voter: User,
    kind: VoteKind,
    *,
    now: datetime,
    is_near: bool = False,
    comment: str | None = None,
) -> None:
    """Store the voter's single active vote, reward a first vote and recompute the place.

    Requires `place.category` to be loaded.
    """
    weight = _vote_weight(place, voter, is_near=is_near, now=now)
    vote = await session.scalar(select(Vote).where(Vote.place_id == place.id, Vote.user_id == voter.id))
    if vote is None:
        vote = Vote(place_id=place.id, user_id=voter.id)
        await reputation.award(session, voter, ReputationReason.VOTE_CAST, now=now, place_id=place.id)
    vote.kind, vote.weight, vote.is_near, vote.comment, vote.created_at = kind, weight, is_near, comment, now
    session.add(vote)
    await session.flush()
    await recompute_place(session, place, now, voter=voter)
    await locality.refresh_confidence(session, voter, now)


def _is_near(place: Place, payload: VoteIn) -> bool:
    if payload.lat is None or payload.lng is None:
        return False
    return geo.haversine_m(payload.lat, payload.lng, place.lat, place.lng) <= trust.PROXIMITY_RADIUS_M


async def cast_vote(session: AsyncSession, voter: User, place_id: int, payload: VoteIn) -> PlaceDetail:
    now = utcnow()
    place = await place_queries.get_visible_place(session, place_id, voter)
    if place.author_id == voter.id:
        raise ForbiddenError("Нельзя голосовать за собственную точку.")
    if place.status not in PUBLIC_STATUSES:
        raise ConflictError("Голосование по этой публикации сейчас недоступно.")
    if place.issue is not None and not issue_stage.is_open(place.issue.stage):
        raise ConflictError("Проблема уже отмечена как устранённая.")
    if payload.kind is VoteKind.UNCLEAR and len(payload.comment or "") < trust.MIN_CLARIFICATION_LENGTH:
        raise FieldValidationError("comment", "Напишите, что именно нужно уточнить, — хотя бы пару слов.")
    await apply_vote(
        session,
        place,
        voter,
        payload.kind,
        now=now,
        is_near=_is_near(place, payload),
        comment=payload.comment,
    )
    if payload.kind is VoteKind.UNCLEAR:
        # The words go to the moderators; the place itself stays as it is until they look.
        await moderation_cases.open_case(
            session, moderation_cases.place_target(place), ModerationTrigger.CLARIFICATION, now=now
        )
    await session.commit()
    return await place_details.build(session, place, voter, now)


async def refresh_trust_scores(session: AsyncSession, now: datetime) -> None:
    """Bring every stored trust score up to date with time decay. Changes no statuses.

    Scores are recomputed on each write, but decay makes untouched places drift; this
    single-pass refresh is cheap enough to run at startup and after seeding.
    """
    votes_by_place: dict[int, list[trust.VoteSample]] = defaultdict(list)
    for row in await session.execute(select(Vote.place_id, Vote.kind, Vote.weight, Vote.created_at)):
        votes_by_place[row.place_id].append(trust.VoteSample(row.kind, row.weight, row.created_at))
    for place in await session.scalars(select(Place)):
        _apply_trust(place, _totals(place, votes_by_place.get(place.id, ()), now), now)
    await session.commit()
