"""In-app notifications (SPEC §8)."""

from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import geo
from app.domain.enums import NotificationKind
from app.models import Notification, Place, Subscription, User
from app.schemas.notification import NotificationOut


def place_link(place_id: int) -> str:
    return f"/?place={place_id}"


def route_link(route_id: int) -> str:
    return f"/routes/{route_id}"


def user_link(user_id: int) -> str:
    return f"/users/{user_id}"


def spot_link(lat: float, lng: float, object_id: str | None) -> str:
    """The map spot sheet of a point or a 2GIS object, where its notes are."""
    link = f"/?at={lat:.6f},{lng:.6f}"
    return f"{link}&obj={object_id}" if object_id else link


def notify(
    session: AsyncSession,
    *,
    user_id: int,
    kind: NotificationKind,
    title: str,
    now: datetime,
    body: str = "",
    link: str | None = None,
) -> None:
    session.add(Notification(user_id=user_id, kind=kind, title=title, body=body, link=link, created_at=now))


async def notify_territory(session: AsyncSession, place: Place, now: datetime) -> None:
    """Tell subscribers whose circle covers a newly published place (one notice per user)."""
    subscriptions = await session.scalars(
        select(Subscription)
        .where(Subscription.user_id != place.author_id, Subscription.created_at <= now)
        .order_by(Subscription.id)
    )
    notified: set[int] = set()
    for subscription in subscriptions:
        if subscription.user_id in notified or place.layer.value not in subscription.layers:
            continue
        distance = geo.haversine_m(subscription.lat, subscription.lng, place.lat, place.lng)
        if distance > subscription.radius_m:
            continue
        notified.add(subscription.user_id)
        notify(
            session,
            user_id=subscription.user_id,
            kind=NotificationKind.TERRITORY,
            title=f"Новое на территории «{subscription.title}»",
            body=place.title,
            link=place_link(place.id),
            now=now,
        )


async def unread_count(session: AsyncSession, user_id: int) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
    )
    return count or 0


async def list_notifications(
    session: AsyncSession, user: User, *, limit: int, offset: int
) -> list[NotificationOut]:
    rows = await session.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return [NotificationOut.model_validate(row) for row in rows]


async def mark_read(session: AsyncSession, user: User, ids: list[int] | None) -> int:
    """Mark the given notifications (all when `ids` is None) as read; returns the unread count."""
    statement = update(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False))
    if ids is not None:
        statement = statement.where(Notification.id.in_(ids))
    await session.execute(statement.values(is_read=True))
    await session.commit()
    return await unread_count(session, user.id)
