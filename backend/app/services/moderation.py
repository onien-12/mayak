"""Moderation panel: queue, case details, decisions with an immutable log, appeals (SPEC §7)."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from sqlalchemy import String, cast, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.clock import utcnow
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.domain.enums import (
    PUBLIC_STATUSES,
    AiTarget,
    AiVerdict,
    CaseState,
    ComplaintState,
    HistoryKind,
    HoldState,
    Layer,
    ModerationAction,
    ModerationTrigger,
    NotificationKind,
    PlaceStatus,
    ReputationReason,
    RouteStatus,
    TargetType,
    VoteKind,
)
from app.models import (
    AiReview,
    Complaint,
    ModerationCase,
    ModerationLog,
    Photo,
    Place,
    QuietHold,
    Route,
    User,
    Vote,
)
from app.schemas.moderation import (
    AiReviewOut,
    ClarificationItem,
    ComplaintItem,
    ModerationCaseDetail,
    ModerationCaseOut,
    ModerationLogEntry,
    ModerationSummary,
    PhotoReview,
    QuietHoldOut,
    Resolution,
    ResolveIn,
)
from app.schemas.place import PhotoOut
from app.schemas.user import UserBrief
from app.services import (
    areas,
    history,
    moderation_cases,
    notifications,
    place_details,
    place_quality,
    place_queries,
    quiet_holds,
    reputation,
    routes,
    screening,
    standing,
    verification,
)

DEFAULT_LIMIT = 50
MAX_LIMIT = 200

ACTION_TITLES: dict[ModerationAction, str] = {
    ModerationAction.APPROVE: "Публикация одобрена модератором",
    ModerationAction.REJECT: "Публикация отклонена модератором",
    ModerationAction.REQUEST_CHANGES: "Модератор просит доработать публикацию",
    ModerationAction.HIDE: "Публикация скрыта модератором",
    ModerationAction.RESTORE: "Публикация восстановлена модератором",
}
_RESTORABLE_PLACE_STATUSES = (PlaceStatus.HIDDEN, PlaceStatus.ARCHIVED)
_CASE_LOAD = (joinedload(ModerationCase.author), joinedload(ModerationCase.moderator))
QUEUE_TARGETS = (AiTarget.PLACE, AiTarget.ROUTE)
"""The queue holds places and routes; held photos, comments, reviews and notes are listed apart."""


class QueueSort(StrEnum):
    RISK = "risk"
    COMPLAINTS = "complaints"
    NEWEST = "newest"
    OLDEST = "oldest"


@dataclass(frozen=True, slots=True)
class QueueFilters:
    state: CaseState = CaseState.OPEN
    target_type: TargetType | None = None
    layer: Layer | None = None
    trigger: ModerationTrigger | None = None
    sort: QueueSort = QueueSort.RISK
    limit: int = DEFAULT_LIMIT
    offset: int = 0


def _ai_target(case: ModerationCase) -> tuple[AiTarget, int]:
    return case.target_type, case.target_id


async def _quiet_case_ids(session: AsyncSession, cases: list[ModerationCase]) -> set[int]:
    """Cases whose target is quietly held right now (SPEC §24.1): the author does not know."""
    targets = {_ai_target(case) for case in cases if case.state is CaseState.OPEN}
    if not targets:
        return set()
    rows = await session.execute(
        select(QuietHold.target_type, QuietHold.target_id).where(
            tuple_(QuietHold.target_type, QuietHold.target_id).in_(targets),
            QuietHold.state == HoldState.HELD,
        )
    )
    held = set(rows.all())
    return {case.id for case in cases if _ai_target(case) in held}


async def _ai_verdicts(session: AsyncSession, cases: list[ModerationCase]) -> dict[int, AiVerdict]:
    """Latest LLM verdict per case, in one query for the whole page of the queue."""
    targets = {_ai_target(case) for case in cases}
    if not targets:
        return {}
    rows = await session.execute(
        select(AiReview.target_type, AiReview.target_id, AiReview.verdict)
        .where(tuple_(AiReview.target_type, AiReview.target_id).in_(targets))
        .order_by(AiReview.created_at, AiReview.id)
    )
    latest = {(target_type, target_id): verdict for target_type, target_id, verdict in rows}
    return {case.id: latest[_ai_target(case)] for case in cases if _ai_target(case) in latest}


def _case_out_fields(case: ModerationCase, ai_verdict: AiVerdict | None, *, quiet: bool) -> dict[str, object]:
    resolution = None
    if case.resolution_action is not None and case.moderator is not None:
        resolution = Resolution(
            action=case.resolution_action,
            reason=case.resolution_reason or "",
            moderator=UserBrief.model_validate(case.moderator),
        )
    return {
        "id": case.id,
        "target_type": case.target_type,
        "target_id": case.target_id,
        "target_title": case.target_title,
        "layer": case.layer,
        "author": UserBrief.model_validate(case.author),
        "triggers": case.triggers,
        "risk": case.risk,
        "complaints_count": case.complaints_count,
        "state": case.state,
        "created_at": case.created_at,
        "resolved_at": case.resolved_at,
        "ai_verdict": ai_verdict,
        "quiet": quiet,
        "resolution": resolution,
    }


async def list_queue(session: AsyncSession, filters: QueueFilters) -> list[ModerationCaseOut]:
    statement = (
        select(ModerationCase)
        .where(ModerationCase.state == filters.state, ModerationCase.target_type.in_(QUEUE_TARGETS))
        .options(*_CASE_LOAD)
    )
    if filters.target_type is not None:
        statement = statement.where(ModerationCase.target_type == AiTarget(filters.target_type.value))
    if filters.layer is not None:
        statement = statement.where(ModerationCase.layer == filters.layer)
    if filters.trigger is not None:
        statement = statement.where(
            cast(ModerationCase.triggers, String).contains(f'"{filters.trigger.value}"')
        )
    order = {
        QueueSort.RISK: (ModerationCase.risk.desc(), ModerationCase.created_at.asc()),
        QueueSort.COMPLAINTS: (ModerationCase.complaints_count.desc(), ModerationCase.risk.desc()),
        QueueSort.NEWEST: (ModerationCase.created_at.desc(),),
        QueueSort.OLDEST: (ModerationCase.created_at.asc(),),
    }[filters.sort]
    rows = await session.scalars(
        statement.order_by(*order, ModerationCase.id.desc()).limit(filters.limit).offset(filters.offset)
    )
    cases = list(rows)
    verdicts = await _ai_verdicts(session, cases)
    quiet = await _quiet_case_ids(session, cases)
    return [
        ModerationCaseOut(**_case_out_fields(case, verdicts.get(case.id), quiet=case.id in quiet))
        for case in cases
    ]


async def summary(session: AsyncSession) -> ModerationSummary:
    now = utcnow()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    by_trigger = dict.fromkeys(ModerationTrigger, 0)
    is_open = ModerationCase.state == CaseState.OPEN
    open_cases = list(
        await session.scalars(
            select(ModerationCase.triggers).where(is_open, ModerationCase.target_type.in_(QUEUE_TARGETS))
        )
    )
    held_items = await session.scalar(
        select(func.count())
        .select_from(ModerationCase)
        .where(is_open, ModerationCase.target_type.not_in(QUEUE_TARGETS))
    )
    for triggers in open_cases:
        for trigger in triggers:
            by_trigger[ModerationTrigger(trigger)] += 1
    resolved_today = await session.scalar(
        select(func.count())
        .select_from(ModerationCase)
        .where(ModerationCase.state == CaseState.RESOLVED, ModerationCase.resolved_at >= day_start)
    )
    return ModerationSummary(
        open=len(open_cases),
        resolved_today=resolved_today or 0,
        by_trigger=by_trigger,
        held_items=held_items or 0,
    )


async def _get_case(session: AsyncSession, case_id: int) -> ModerationCase:
    case = await session.scalar(
        select(ModerationCase).where(ModerationCase.id == case_id).options(*_CASE_LOAD)
    )
    if case is None:
        raise NotFoundError("Обращение не найдено.")
    return case


async def _case_complaints(session: AsyncSession, case_id: int) -> list[ComplaintItem]:
    rows = await session.scalars(
        select(Complaint)
        .where(Complaint.case_id == case_id)
        .options(joinedload(Complaint.author))
        .order_by(Complaint.created_at, Complaint.id)
    )
    return [ComplaintItem.model_validate(row) for row in rows]


async def _clarifications(session: AsyncSession, case: ModerationCase) -> list[ClarificationItem]:
    """«Требует уточнения» votes on the place that came with words, newest first."""
    if case.target_type is not AiTarget.PLACE:
        return []
    rows = await session.execute(
        select(Vote, User)
        .join(User, User.id == Vote.user_id)
        .where(Vote.place_id == case.target_id, Vote.kind == VoteKind.UNCLEAR, Vote.comment.is_not(None))
        .order_by(Vote.created_at.desc(), Vote.id.desc())
    )
    return [
        ClarificationItem(
            id=vote.id, text=vote.comment, author=UserBrief.model_validate(user), created_at=vote.created_at
        )
        for vote, user in rows
        if vote.comment
    ]


async def _photo_reviews(session: AsyncSession, case: ModerationCase) -> list[PhotoReview]:
    """Every photo of the target with its own check, held ones first (SPEC §24.2)."""
    if case.target_type is AiTarget.PLACE:
        photos = await session.scalars(select(Photo).where(Photo.place_id == case.target_id))
    elif case.target_type is AiTarget.ROUTE:
        route = await routes.find_route(session, case.target_id)
        photos = [photo for stop in route.stops for photo in stop.photos] if route is not None else []
    else:
        photos = await session.scalars(select(Photo).where(Photo.id == case.target_id))
    photos = [photo for photo in photos if photo.credit is None]
    holds = {
        hold.target_id: hold
        for hold in await session.scalars(
            select(QuietHold).where(
                QuietHold.target_type == AiTarget.PHOTO,
                QuietHold.target_id.in_([photo.id for photo in photos]),
            )
        )
    }
    reviews: dict[int, AiReview] = {}
    for review in await session.scalars(
        select(AiReview)
        .where(AiReview.target_type == AiTarget.PHOTO, AiReview.target_id.in_(list(holds)))
        .order_by(AiReview.created_at, AiReview.id)
    ):
        reviews[review.target_id] = review
    items = [
        PhotoReview(
            photo=PhotoOut.model_validate(photo),
            state=holds[photo.id].state,
            reasons=holds[photo.id].reasons,
            ai_review=AiReviewOut.model_validate(reviews[photo.id]) if photo.id in reviews else None,
        )
        for photo in photos
        if photo.id in holds
    ]
    return sorted(items, key=lambda item: item.state is not HoldState.HELD)


async def _build_detail(session: AsyncSession, case: ModerationCase, moderator: User) -> ModerationCaseDetail:
    now = utcnow()
    place_detail = None
    route_detail = None
    entries = []
    if case.target_type is AiTarget.PLACE:
        place = await place_queries.get_place(session, case.target_id)
        place_detail = await place_details.build(session, place, moderator, now)
        entries = await history.list_for_place(session, place.id)
    elif case.target_type is AiTarget.ROUTE:
        route = await routes.find_route(session, case.target_id)
        if route is not None:
            route_detail = await routes.build_detail(session, route, moderator, now)
    ai_review = await moderation_cases.latest_ai_review(session, case.target_type, case.target_id)
    hold = await quiet_holds.find(session, case.target_type, case.target_id)
    usefulness = None
    if case.target_type is AiTarget.PLACE:
        usefulness = (await place_quality.usefulness_for(session, [case.target_id])).get(case.target_id)
    return ModerationCaseDetail(
        **_case_out_fields(
            case,
            ai_review.verdict if ai_review else None,
            quiet=case.state is CaseState.OPEN and hold is not None and hold.state is HoldState.HELD,
        ),
        place=place_detail,
        route=route_detail,
        complaints=await _case_complaints(session, case.id),
        clarifications=await _clarifications(session, case),
        flags=case.flags,
        ai_review=AiReviewOut.model_validate(ai_review) if ai_review else None,
        appeal_text=case.appeal_text,
        history=entries,
        hold=QuietHoldOut.model_validate(hold) if hold is not None else None,
        photo_reviews=await _photo_reviews(session, case),
        usefulness=usefulness,
        author_standing=await standing.score(session, case.author_id),
    )


async def get_case_detail(session: AsyncSession, moderator: User, case_id: int) -> ModerationCaseDetail:
    return await _build_detail(session, await _get_case(session, case_id), moderator)


async def _close_complaints(
    session: AsyncSession, case: ModerationCase, *, upheld: bool, now: datetime
) -> None:
    """Settle every open complaint on the case target and adjust the reporters' reputation."""
    rows = await session.scalars(
        select(Complaint)
        .where(
            Complaint.target_type == case.target_type,
            Complaint.target_id == case.target_id,
            Complaint.state == ComplaintState.OPEN,
        )
        .options(joinedload(Complaint.author))
    )
    reason = ReputationReason.COMPLAINT_UPHELD if upheld else ReputationReason.COMPLAINT_DISMISSED
    for complaint in rows:
        complaint.state = ComplaintState.UPHELD if upheld else ComplaintState.DISMISSED
        complaint.resolved_at = now
        complaint.case_id = case.id
        place_id = case.target_id if case.target_type is AiTarget.PLACE else None
        await reputation.award(session, complaint.author, reason, now=now, place_id=place_id)


def _notify_author(
    session: AsyncSession, case: ModerationCase, moderator: User, payload: ResolveIn, link: str, now: datetime
) -> None:
    if case.author_id == moderator.id:
        return
    notifications.notify(
        session,
        user_id=case.author_id,
        kind=NotificationKind.MODERATION,
        title=ACTION_TITLES[payload.action],
        body=f"«{case.target_title}»: {payload.reason}",
        link=link,
        now=now,
    )


async def _release_quietly(session: AsyncSession, hold: QuietHold | None, now: datetime) -> bool:
    """`approve` of a quiet hold: the item appears as if it had never been held and nothing
    else happens to its author (SPEC §24.1). False when the author sees the item waiting for
    pre-moderation anyway: then the ordinary approval follows."""
    if hold is None:
        return False
    await screening.release(session, hold, now, by_moderator=True)
    return hold.shown_status not in (PlaceStatus.PENDING, RouteStatus.PENDING, None)


async def _decide_siblings(session: AsyncSession, sibling_ids: list[int], place: Place) -> None:
    """Occurrences of an event series screened together share the decision about the first one."""
    for sibling_id in sibling_ids:
        sibling = await session.get(Place, sibling_id)
        if sibling is not None:
            sibling.status = place.status


async def _decide_place(
    session: AsyncSession,
    case: ModerationCase,
    place: Place,
    moderator: User,
    payload: ResolveIn,
    now: datetime,
) -> None:
    hold = await quiet_holds.find_active(session, AiTarget.PLACE, place.id)
    old_status = PlaceStatus(hold.shown_status) if hold is not None and hold.shown_status else place.status
    match payload.action:
        case ModerationAction.APPROVE | ModerationAction.RESTORE:
            if payload.action is ModerationAction.RESTORE and place.status not in _RESTORABLE_PLACE_STATUSES:
                raise ConflictError("Восстановить можно только скрытую или архивную публикацию.")
            if payload.action is ModerationAction.APPROVE:
                await _close_complaints(session, case, upheld=False, now=now)
                if await _release_quietly(session, hold, now):
                    place.reviewed_at = now
                    await verification.recompute_place(session, place, now)
                    return
            place.reviewed_at = now
            await verification.recompute_place(session, place, now, moderator_override=True)
            if old_status is PlaceStatus.PENDING:
                await reputation.award(
                    session, place.author, ReputationReason.MODERATION_APPROVED, now=now, place_id=place.id
                )
                if place.status in PUBLIC_STATUSES:
                    await notifications.notify_territory(session, place, now)
        case ModerationAction.REJECT | ModerationAction.HIDE:
            is_reject = payload.action is ModerationAction.REJECT
            place.status = PlaceStatus.ARCHIVED if is_reject else PlaceStatus.HIDDEN
            if hold is not None:
                await _decide_siblings(
                    session, await screening.confirm(session, hold, now, penalize=True), place
                )
            await reputation.award(
                session, place.author, ReputationReason.CONTENT_REJECTED, now=now, place_id=place.id
            )
            await _close_complaints(session, case, upheld=True, now=now)
        case ModerationAction.REQUEST_CHANGES:
            place.status = PlaceStatus.PENDING
            if hold is not None:
                await _decide_siblings(
                    session, await screening.confirm(session, hold, now, penalize=False), place
                )
    place.updated_at = now
    await areas.refresh_area(session, place.area_id, now)
    history.record(
        session,
        place,
        HistoryKind.MODERATION,
        f"{ACTION_TITLES[payload.action]}: {payload.reason}",
        now=now,
        actor=moderator,
        old_status=old_status,
        new_status=place.status,
    )
    _notify_author(session, case, moderator, payload, notifications.place_link(place.id), now)


async def _decide_route(
    session: AsyncSession,
    case: ModerationCase,
    route: Route,
    moderator: User,
    payload: ResolveIn,
    now: datetime,
) -> None:
    hold = await quiet_holds.find_active(session, AiTarget.ROUTE, route.id)
    old_status = RouteStatus(hold.shown_status) if hold is not None and hold.shown_status else route.status
    match payload.action:
        case ModerationAction.APPROVE | ModerationAction.RESTORE:
            if payload.action is ModerationAction.RESTORE and route.status is not RouteStatus.HIDDEN:
                raise ConflictError("Восстановить можно только скрытый маршрут.")
            if payload.action is ModerationAction.APPROVE:
                await _close_complaints(session, case, upheld=False, now=now)
                if await _release_quietly(session, hold, now):
                    return
            route.status = RouteStatus.PUBLISHED
            if old_status is RouteStatus.PENDING:
                await reputation.award(session, route.author, ReputationReason.MODERATION_APPROVED, now=now)
                await reputation.award(session, route.author, ReputationReason.ROUTE_PUBLISHED, now=now)
        case ModerationAction.REJECT | ModerationAction.HIDE:
            if hold is not None:
                await screening.confirm(session, hold, now, penalize=True)
            route.status = RouteStatus.HIDDEN
            await reputation.award(session, route.author, ReputationReason.CONTENT_REJECTED, now=now)
            await _close_complaints(session, case, upheld=True, now=now)
        case ModerationAction.REQUEST_CHANGES:
            if hold is not None:
                await screening.confirm(session, hold, now, penalize=False)
            route.status = RouteStatus.PENDING
    route.updated_at = now
    _notify_author(session, case, moderator, payload, notifications.route_link(route.id), now)


def log_decision(
    session: AsyncSession,
    case: ModerationCase,
    moderator: User,
    action: ModerationAction,
    reason: str,
    now: datetime,
) -> None:
    """Close the case with the decision and append it to the immutable moderation log."""
    case.state = CaseState.RESOLVED
    case.resolved_at = now
    case.resolution_action = action
    case.resolution_reason = reason
    case.moderator = moderator
    session.add(
        ModerationLog(
            case_id=case.id,
            moderator_id=moderator.id,
            action=action,
            reason=reason,
            target_type=case.target_type,
            target_id=case.target_id,
            target_title=case.target_title,
            created_at=now,
        )
    )


async def decide(
    session: AsyncSession, case: ModerationCase, moderator: User, payload: ResolveIn, now: datetime
) -> None:
    """Close the case with the moderator's decision, apply its effects and append to the log."""
    log_decision(session, case, moderator, payload.action, payload.reason, now)
    await session.flush()
    if case.target_type is AiTarget.PLACE:
        place = await place_queries.get_place(session, case.target_id)
        await _decide_place(session, case, place, moderator, payload, now)
    else:
        route = await routes.get_route(session, case.target_id)
        await _decide_route(session, case, route, moderator, payload, now)


async def resolve_case(
    session: AsyncSession, moderator: User, case_id: int, payload: ResolveIn
) -> ModerationCaseDetail:
    case = await _get_case(session, case_id)
    if case.state is CaseState.RESOLVED:
        raise ConflictError("Обращение уже рассмотрено.")
    if case.target_type not in QUEUE_TARGETS:
        raise ConflictError(
            "Удержанные фото, комментарии, отзывы и заметки выпускаются или убираются в своём списке."
        )
    await decide(session, case, moderator, payload, utcnow())
    await session.commit()
    return await _build_detail(session, case, moderator)


async def list_log(session: AsyncSession, *, limit: int, offset: int) -> list[ModerationLogEntry]:
    rows = await session.scalars(
        select(ModerationLog)
        .options(joinedload(ModerationLog.moderator))
        .order_by(ModerationLog.created_at.desc(), ModerationLog.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return [ModerationLogEntry.model_validate(row) for row in rows]


async def open_appeal(session: AsyncSession, place: Place, text: str, now: datetime) -> ModerationCase:
    await moderation_cases.mark_decision_appealed(session, place)
    case = await moderation_cases.open_case(
        session, moderation_cases.place_target(place), ModerationTrigger.APPEAL, now=now, appeal_text=text
    )
    history.record(
        session, place, HistoryKind.MODERATION, "Автор подал апелляцию", now=now, actor=place.author
    )
    return case


async def file_appeal(session: AsyncSession, author: User, place_id: int, text: str) -> int:
    """One appeal per moderator decision, by the author of a hidden or rejected place."""
    place = await place_queries.get_visible_place(session, place_id, author)
    if place.author_id != author.id:
        raise ForbiddenError("Подать апелляцию может только автор публикации.")
    standing = await moderation_cases.standing_for_place(session, place)
    if not standing.can_appeal:
        raise ConflictError("Апелляция по этой публикации недоступна или уже подана.")
    case = await open_appeal(session, place, text, utcnow())
    await session.commit()
    return case.id
