"""Reviews (rating + text) on places and routes; one per author and target, upserted."""

from datetime import datetime

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.clock import utcnow
from app.core.errors import BadRequestError, ForbiddenError, RateLimitedError
from app.domain import limits
from app.domain.enums import AiTarget, Layer, ReputationReason
from app.models import Place, Review, Route, User
from app.schemas.feedback import ReviewIn, ReviewOut
from app.services import areas, content, moderation_cases, place_queries, quiet_holds, reputation, routes
from app.services.interests import signals as interest_signals

REVIEWABLE_LAYERS = (Layer.INFRASTRUCTURE, Layer.TOURISM)
_RATING_PRECISION = 2


def own_held_clause(viewer_id: int) -> ColumnElement[bool]:
    """The viewer's own reviews still being screened or held (SPEC §24.1)."""
    return and_(Review.author_id == viewer_id, Review.id.in_(quiet_holds.active_ids(AiTarget.REVIEW)))


def _visible_clause(viewer: User | None) -> ColumnElement[bool]:
    shown = Review.is_hidden.is_(False)
    return shown if viewer is None else or_(shown, own_held_clause(viewer.id))


async def _list(session: AsyncSession, target: ColumnElement[bool], viewer: User | None) -> list[ReviewOut]:
    rows = list(
        await session.scalars(
            select(Review)
            .where(target, _visible_clause(viewer))
            .options(joinedload(Review.author))
            .order_by(Review.created_at.desc(), Review.id.desc())
        )
    )
    own = [row.id for row in rows if viewer is not None and row.author_id == viewer.id]
    held = await quiet_holds.held_ids(session, AiTarget.REVIEW, own)
    items = [ReviewOut.model_validate(row) for row in rows]
    for item in items:
        item.on_review = item.id in held
    return items


async def rating_summary(
    session: AsyncSession, target: ColumnElement[bool], viewer: User | None = None
) -> tuple[float | None, int]:
    """Average rating and number of shown reviews of a place or a route. With a `viewer`, as
    that viewer sees it: their own review counts while it is still screened or held."""
    average, count = (
        await session.execute(
            select(func.avg(Review.rating), func.count()).where(target, _visible_clause(viewer))
        )
    ).one()
    return (round(average, _RATING_PRECISION) if average is not None else None), count


async def has_own_held(session: AsyncSession, target: ColumnElement[bool], viewer: User | None) -> bool:
    if viewer is None:
        return False
    return (
        await session.scalar(select(Review.id).where(target, own_held_clause(viewer.id)).limit(1)) is not None
    )


async def refresh_owner(session: AsyncSession, review: Review, now: datetime) -> None:
    """Recompute the rating of the place or route the review is about (and of the place's area)."""
    await session.flush()
    if review.place_id is not None:
        place = await session.get(Place, review.place_id)
        place.rating_avg, place.rating_count = await rating_summary(session, Review.place_id == place.id)
        await areas.refresh_area(session, place.area_id, now)
        return
    route = await session.get(Route, review.route_id)
    route.rating_avg, route.rating_count = await rating_summary(session, Review.route_id == route.id)


async def _enforce_daily_limit(session: AsyncSession, author: User, now: datetime) -> None:
    daily_limit = limits.reviews_daily_limit(author.level, author.role)
    if daily_limit is None:
        return
    written = await session.scalar(
        select(func.count())
        .select_from(Review)
        .where(Review.author_id == author.id, Review.created_at > now - limits.DAY)
    )
    if (written or 0) >= daily_limit:
        raise RateLimitedError(f"На вашем уровне можно оставить не больше {daily_limit} отзывов в сутки.")


async def upsert_review(
    session: AsyncSession,
    author: User,
    payload: ReviewIn,
    *,
    now: datetime,
    place: Place | None = None,
    route: Route | None = None,
    screened: bool = False,
) -> Review:
    """Create or replace the author's review and refresh the target's rating aggregates.

    A screened review stays out of lists and ratings until it is released; the reputation for
    writing it is the same as for any review."""
    target_owner = place if place is not None else route
    target = Review.place_id == place.id if place is not None else Review.route_id == route.id
    review = await session.scalar(
        select(Review).where(target, Review.author_id == author.id).options(joinedload(Review.author))
    )
    if review is None:
        await _enforce_daily_limit(session, author, now)
        review = Review(
            author=author,
            place_id=place.id if place is not None else None,
            route_id=route.id if route is not None else None,
            rating=payload.rating,
            text=payload.text,
            is_hidden=screened,
            created_at=now,
        )
        session.add(review)
        await reputation.award(
            session, author, ReputationReason.REVIEW_WRITTEN, now=now, place_id=place.id if place else None
        )
    else:
        review.rating, review.text, review.created_at = payload.rating, payload.text, now
        review.is_hidden = screened
    await session.flush()
    target_owner.rating_avg, target_owner.rating_count = await rating_summary(session, target)
    if place is not None:
        await areas.refresh_area(session, place.area_id, now)
    return review


async def list_place_reviews(session: AsyncSession, place_id: int, viewer: User | None) -> list[ReviewOut]:
    place = await place_queries.get_visible_place(session, place_id, viewer)
    return await _list(session, Review.place_id == place.id, viewer)


def _screens(author: User, payload: ReviewIn) -> bool:
    """A bare rating has nothing to screen; moderators' own content is never screened."""
    return bool(payload.text) and not author.is_staff


async def _open_window(session: AsyncSession, review: Review, author: User, now: datetime) -> None:
    await quiet_holds.open_window(
        session,
        AiTarget.REVIEW,
        review.id,
        author.id,
        now=now,
        heuristic_reasons=content.gibberish_reasons({"текст": review.text}),
    )


async def _withdraw(session: AsyncSession, review: Review, now: datetime) -> None:
    """A bare rating (or a moderator's own review) replaced a screened text: nothing to decide."""
    await quiet_holds.withdraw(session, AiTarget.REVIEW, review.id, now)
    await moderation_cases.close_cases_without_decision(session, AiTarget.REVIEW, review.id, now)


async def review_place(session: AsyncSession, author: User, place_id: int, payload: ReviewIn) -> ReviewOut:
    now = utcnow()
    place = await place_queries.get_visible_place(session, place_id, author)
    if place.layer not in REVIEWABLE_LAYERS:
        raise BadRequestError(
            "Отзывы можно оставлять только к объектам инфраструктуры и туристическим местам."
        )
    content.ensure_clean_text(payload.text)
    previous = await session.scalar(
        select(Review.rating).where(Review.place_id == place.id, Review.author_id == author.id)
    )
    screened = _screens(author, payload)
    review = await upsert_review(session, author, payload, now=now, place=place, screened=screened)
    if screened:
        await _open_window(session, review, author, now)
    else:
        await _withdraw(session, review, now)
    await session.commit()
    await interest_signals.on_review(session, author.id, place.id, payload.rating, previous)
    return ReviewOut.model_validate(review)


async def list_route_reviews(session: AsyncSession, route_id: int, viewer: User | None) -> list[ReviewOut]:
    route = await routes.get_visible_route(session, route_id, viewer)
    return await _list(session, Review.route_id == route.id, viewer)


async def review_route(session: AsyncSession, author: User, route_id: int, payload: ReviewIn) -> ReviewOut:
    now = utcnow()
    route = await routes.get_public_route(session, route_id, author)
    if route.author_id == author.id:
        raise ForbiddenError("Нельзя оценивать собственный маршрут.")
    content.ensure_clean_text(payload.text)
    screened = _screens(author, payload)
    review = await upsert_review(session, author, payload, now=now, route=route, screened=screened)
    if screened:
        await _open_window(session, review, author, now)
    else:
        await _withdraw(session, review, now)
    await session.commit()
    return ReviewOut.model_validate(review)
