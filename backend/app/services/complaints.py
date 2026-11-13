"""Complaints on places and routes; enough weighted complaints send the target to review (SPEC §5)."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.errors import BadRequestError, ConflictError, RateLimitedError
from app.domain import complaints as complaint_rules
from app.domain import levels, limits, trust
from app.domain.enums import (
    PUBLIC_STATUSES,
    ComplaintReason,
    ComplaintState,
    ModerationTrigger,
    RouteStatus,
    TargetType,
)
from app.models import Complaint, Place, Route, User
from app.schemas.complaint import ComplaintCreated, ComplaintIn
from app.services import moderation_cases, place_queries, routes, verification


async def _open_weight(session: AsyncSession, target_type: TargetType, target_id: int) -> float:
    weight = await session.scalar(
        select(func.sum(Complaint.weight)).where(
            Complaint.target_type == target_type,
            Complaint.target_id == target_id,
            Complaint.state == ComplaintState.OPEN,
        )
    )
    return weight or 0.0


async def _enforce_limits(session: AsyncSession, reporter: User, payload: ComplaintIn, now: datetime) -> None:
    duplicate = await session.scalar(
        select(Complaint.id).where(
            Complaint.author_id == reporter.id,
            Complaint.target_type == payload.target_type,
            Complaint.target_id == payload.target_id,
            Complaint.state == ComplaintState.OPEN,
        )
    )
    if duplicate is not None:
        raise ConflictError("Вы уже отправили жалобу на эту публикацию — она ждёт рассмотрения.")
    sent_today = await session.scalar(
        select(func.count())
        .select_from(Complaint)
        .where(Complaint.author_id == reporter.id, Complaint.created_at > now - limits.DAY)
    )
    daily_limit = limits.complaints_daily_limit(reporter.level, reporter.role)
    if (sent_today or 0) >= daily_limit:
        raise RateLimitedError(f"Достигнут дневной лимит жалоб: {daily_limit}.")


async def _react_on_route(session: AsyncSession, route: Route, now: datetime) -> None:
    target = moderation_cases.route_target(route)
    if await _open_weight(session, TargetType.ROUTE, route.id) >= trust.REVIEW_COMPLAINTS_WEIGHT:
        if route.status is RouteStatus.PUBLISHED:
            route.status = RouteStatus.NEEDS_REVIEW
        await moderation_cases.open_case(session, target, ModerationTrigger.COMPLAINTS, now=now)
        return
    case = await moderation_cases.find_open_case(session, TargetType.ROUTE, route.id)
    if case is not None:
        await moderation_cases.refresh_case(session, case, target)


async def _react_on_place(session: AsyncSession, place: Place, now: datetime) -> None:
    await verification.recompute_place(session, place, now)
    case = await moderation_cases.find_open_case(session, TargetType.PLACE, place.id)
    if case is not None:
        await moderation_cases.refresh_case(session, case, moderation_cases.place_target(place))


async def file_complaint(
    session: AsyncSession,
    reporter: User,
    target: Place | Route,
    reason: ComplaintReason,
    comment: str,
    now: datetime,
) -> Complaint:
    """Record a complaint and let the target react (status change, moderation case)."""
    target_type = TargetType.PLACE if isinstance(target, Place) else TargetType.ROUTE
    complaint = Complaint(
        target_type=target_type,
        target_id=target.id,
        author_id=reporter.id,
        reason=reason,
        comment=comment,
        weight=complaint_rules.complaint_weight(levels.level_weight(reporter.level, reporter.role), reason),
        created_at=now,
    )
    session.add(complaint)
    await session.flush()
    if isinstance(target, Place):
        await _react_on_place(session, target, now)
    else:
        await _react_on_route(session, target, now)
    return complaint


async def _load_target(session: AsyncSession, reporter: User, payload: ComplaintIn) -> Place | Route:
    """Own content is refused first, so the author of a place in its screening window gets the same answer
    as for a published one."""
    if payload.target_type is TargetType.ROUTE:
        return await routes.get_public_route(session, payload.target_id, reporter)
    place = await place_queries.get_visible_place(session, payload.target_id, reporter)
    if place.author_id != reporter.id and place.status not in PUBLIC_STATUSES:
        raise ConflictError("На эту публикацию сейчас нельзя пожаловаться.")
    return place


async def create_complaint(session: AsyncSession, reporter: User, payload: ComplaintIn) -> ComplaintCreated:
    now = utcnow()
    if not complaint_rules.reason_applies(payload.reason, payload.target_type):
        raise BadRequestError("Причина «непроходимый маршрут» доступна только для маршрутов.")
    target = await _load_target(session, reporter, payload)
    if target.author_id == reporter.id:
        raise BadRequestError("Нельзя жаловаться на собственную публикацию.")
    await _enforce_limits(session, reporter, payload, now)
    complaint = await file_complaint(session, reporter, target, payload.reason, payload.comment, now)
    await session.commit()
    return ComplaintCreated(id=complaint.id)
