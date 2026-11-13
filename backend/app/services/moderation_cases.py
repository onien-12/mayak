"""Opening and merging moderation cases (SPEC §7). Decisions live in `services.moderation`."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import moderation_risk
from app.domain.enums import (
    AiTarget,
    CaseState,
    ComplaintState,
    Layer,
    ModerationAction,
    ModerationTrigger,
    PlaceStatus,
    VoteKind,
)
from app.models import AiReview, Complaint, ModerationCase, Place, Route, User, Vote
from app.services import standing

APPEALABLE_STATUSES = (PlaceStatus.HIDDEN, PlaceStatus.ARCHIVED)
APPEALABLE_ACTIONS = (ModerationAction.HIDE, ModerationAction.REJECT)
NOTED_STATUSES = (PlaceStatus.PENDING, PlaceStatus.HIDDEN, PlaceStatus.ARCHIVED)
NOTED_ACTIONS = (ModerationAction.HIDE, ModerationAction.REJECT, ModerationAction.REQUEST_CHANGES)


@dataclass(frozen=True, slots=True)
class CaseTarget:
    """What a case is about, with the snapshot fields shown in the moderation queue."""

    type: AiTarget
    id: int
    title: str
    layer: Layer | None
    author: User


@dataclass(frozen=True, slots=True)
class ModerationStanding:
    """How past and pending moderation affects what the author sees on a place."""

    can_appeal: bool
    note: str | None


def place_target(place: Place) -> CaseTarget:
    return CaseTarget(AiTarget.PLACE, place.id, place.title, place.layer, place.author)


def route_target(route: Route) -> CaseTarget:
    return CaseTarget(AiTarget.ROUTE, route.id, route.title, None, route.author)


async def find_open_case(
    session: AsyncSession, target_type: AiTarget, target_id: int
) -> ModerationCase | None:
    return await session.scalar(
        select(ModerationCase).where(
            ModerationCase.target_type == target_type,
            ModerationCase.target_id == target_id,
            ModerationCase.state == CaseState.OPEN,
        )
    )


async def _last_decision(
    session: AsyncSession, target_type: AiTarget, target_id: int
) -> ModerationCase | None:
    return await session.scalar(
        select(ModerationCase)
        .where(
            ModerationCase.target_type == target_type,
            ModerationCase.target_id == target_id,
            ModerationCase.state == CaseState.RESOLVED,
            ModerationCase.resolution_action.is_not(None),
        )
        .order_by(ModerationCase.resolved_at.desc(), ModerationCase.id.desc())
        .limit(1)
    )


async def _absent_weight(session: AsyncSession, target: CaseTarget) -> float:
    if target.type is not AiTarget.PLACE:
        return 0.0
    weight = await session.scalar(
        select(func.sum(Vote.weight)).where(Vote.place_id == target.id, Vote.kind == VoteKind.ABSENT)
    )
    return weight or 0.0


async def latest_ai_review(session: AsyncSession, target_type: AiTarget, target_id: int) -> AiReview | None:
    """The most recent model opinion about an item."""
    return await session.scalar(
        select(AiReview)
        .where(AiReview.target_type == target_type, AiReview.target_id == target_id)
        .order_by(AiReview.created_at.desc(), AiReview.id.desc())
        .limit(1)
    )


async def refresh_case(session: AsyncSession, case: ModerationCase, target: CaseTarget) -> None:
    """Attach the target's open complaints to the case and recompute its counters and risk."""
    await session.execute(
        update(Complaint)
        .where(
            Complaint.target_type == target.type,
            Complaint.target_id == target.id,
            Complaint.state == ComplaintState.OPEN,
        )
        .values(case_id=case.id)
    )
    count, weight = (
        await session.execute(
            select(func.count(), func.coalesce(func.sum(Complaint.weight), 0.0)).where(
                Complaint.case_id == case.id
            )
        )
    ).one()
    ai_review = await latest_ai_review(session, target.type, target.id)
    case.complaints_count = count
    case.target_title = target.title
    case.risk = moderation_risk.risk_score(
        ai_verdict=ai_review.verdict if ai_review else None,
        ai_confidence=ai_review.confidence if ai_review else 0.0,
        complaints_weight=weight,
        absent_weight=await _absent_weight(session, target),
        flags_count=len(case.flags),
        author_level=target.author.level,
        layer=target.layer,
        author_standing=await standing.score(session, target.author.id),
    )


async def open_case(
    session: AsyncSession,
    target: CaseTarget,
    trigger: ModerationTrigger,
    *,
    now: datetime,
    flags: list[str] | None = None,
    appeal_text: str | None = None,
) -> ModerationCase:
    """Open a case for the target, or merge the trigger into the already open one."""
    case = await find_open_case(session, target.type, target.id)
    if case is None:
        case = ModerationCase(
            target_type=target.type,
            target_id=target.id,
            target_title=target.title,
            layer=target.layer,
            author_id=target.author.id,
            triggers=[],
            flags=[],
            created_at=now,
        )
        session.add(case)
    if trigger.value not in case.triggers:
        case.triggers = [*case.triggers, trigger.value]
    new_flags = [flag for flag in flags or [] if flag not in case.flags]
    if new_flags:
        case.flags = [*case.flags, *new_flags]
    if appeal_text is not None:
        case.appeal_text = appeal_text
    await session.flush()
    await refresh_case(session, case, target)
    return case


async def close_cases_without_decision(
    session: AsyncSession, target_type: AiTarget, target_id: int, now: datetime
) -> None:
    """The author withdrew the publication: nothing is left for moderators to decide."""
    case = await find_open_case(session, target_type, target_id)
    if case is not None:
        case.state = CaseState.RESOLVED
        case.resolved_at = now
    await session.execute(
        update(Complaint)
        .where(
            Complaint.target_type == target_type,
            Complaint.target_id == target_id,
            Complaint.state == ComplaintState.OPEN,
        )
        .values(state=ComplaintState.CLOSED, resolved_at=now)
    )


async def standing_for_place(
    session: AsyncSession, place: Place, *, status: PlaceStatus | None = None
) -> ModerationStanding:
    """Whether the author may appeal, and the moderator note to show on a restricted place.

    A decision (`hide` / `reject`) can be appealed once. A place hidden automatically by
    absent votes has no decision yet: its author may add one appeal to the open case.
    `status` is the one the viewer sees (a place in its screening window looks published to its
    author).
    """
    status = status or place.status
    if status not in NOTED_STATUSES:
        return ModerationStanding(can_appeal=False, note=None)
    decision = await _last_decision(session, AiTarget.PLACE, place.id)
    note = decision.resolution_reason if decision and decision.resolution_action in NOTED_ACTIONS else None
    if status not in APPEALABLE_STATUSES:
        return ModerationStanding(can_appeal=False, note=note)
    open_case_ = await find_open_case(session, AiTarget.PLACE, place.id)
    if open_case_ is not None:
        can_appeal = ModerationTrigger.APPEAL.value not in open_case_.triggers
    else:
        can_appeal = (
            decision is not None
            and decision.resolution_action in APPEALABLE_ACTIONS
            and not decision.appealed
        )
    return ModerationStanding(can_appeal=can_appeal, note=note)


async def mark_decision_appealed(session: AsyncSession, place: Place) -> None:
    decision = await _last_decision(session, AiTarget.PLACE, place.id)
    if decision is not None:
        decision.appealed = True
