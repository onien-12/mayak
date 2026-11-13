"""User profiles, respects and territory subscriptions."""

from datetime import datetime, timedelta

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.errors import (
    BadRequestError,
    ConflictError,
    ForbiddenError,
    HomeCooldownError,
    NotFoundError,
    RateLimitedError,
)
from app.domain import levels, limits
from app.domain import locality as locality_rules
from app.domain.enums import (
    PUBLIC_ROUTE_STATUSES,
    PUBLIC_STATUSES,
    AiTarget,
    Layer,
    NotificationKind,
    PlaceStatus,
    ReputationReason,
    RouteVisibility,
)
from app.models import Place, Respect, Review, Route, Subscription, User, Vote
from app.schemas.place import PlaceCard
from app.schemas.user import (
    HomeArea,
    HomeIn,
    NextLevel,
    Permissions,
    SubscriptionIn,
    SubscriptionOut,
    UserBrief,
    UserMe,
    UserProfile,
    UserStats,
    UserUpdate,
)
from app.services import locality, notifications, place_queries, places, quiet_holds, reputation
from app.services.quests import lookup as quest_lookup

DEFAULT_TOP_LIMIT = 10
MAX_TOP_LIMIT = 50
DEFAULT_PLACES_LIMIT = 50
MAX_PLACES_LIMIT = 200
OWN_EXTRA_STATUSES = (PlaceStatus.PENDING, PlaceStatus.HIDDEN)
HOME_SUBSCRIPTION_TITLE = "Мой район"


async def build_me(session: AsyncSession, user: User, now: datetime) -> UserMe:
    return UserMe(
        **UserBrief.model_validate(user).model_dump(),
        email=user.email,
        bio=user.bio,
        created_at=user.created_at,
        permissions=Permissions(
            can_moderate=user.is_staff,
            publishes_directly=levels.publishes_directly(user.level, user.role),
            can_respect=levels.can_send_respect(user.level, user.role),
            daily_place_limit=levels.daily_place_limit(user.level, user.role),
            places_left_today=await places.places_left_today(session, user, now),
        ),
        unread_notifications=await notifications.unread_count(session, user.id),
        home=_home_area(user, now),
    )


def _home_area(user: User, now: datetime) -> HomeArea | None:
    if user.home_lat is None or user.home_lng is None or user.home_set_at is None:
        return None
    allowed_at = user.home_change_allowed_at
    return HomeArea(
        lat=user.home_lat,
        lng=user.home_lng,
        label=user.home_label,
        set_at=user.home_set_at,
        can_change_at=allowed_at if allowed_at and allowed_at > now else None,
    )


async def _home_subscription(session: AsyncSession, user: User) -> Subscription | None:
    return await session.scalar(
        select(Subscription).where(Subscription.user_id == user.id, Subscription.is_home.is_(True))
    )


async def apply_home(
    session: AsyncSession, user: User, lat: float, lng: float, label: str | None, now: datetime
) -> None:
    """Store the home rounded to about 100 m and keep the «Мой район» subscription on it."""
    user.home_lat = round(lat, locality_rules.HOME_COORDINATE_PRECISION)
    user.home_lng = round(lng, locality_rules.HOME_COORDINATE_PRECISION)
    user.home_label = label or None
    user.home_set_at = now
    user.home_change_allowed_at = now + timedelta(days=locality_rules.HOME_CHANGE_COOLDOWN_DAYS)
    subscription = await _home_subscription(session, user)
    if subscription is None:
        subscription = Subscription(
            user_id=user.id,
            title=HOME_SUBSCRIPTION_TITLE,
            radius_m=locality_rules.HOME_SUBSCRIPTION_RADIUS_M,
            layers=[layer.value for layer in locality_rules.HOME_SUBSCRIPTION_LAYERS],
            is_home=True,
            created_at=now,
        )
        session.add(subscription)
    subscription.lat, subscription.lng = user.home_lat, user.home_lng
    await locality.refresh_confidence(session, user, now)


async def set_home(session: AsyncSession, user: User, payload: HomeIn) -> UserMe:
    """The first setting is free; afterwards the point can move once per 30 days."""
    now = utcnow()
    same_point = (user.home_lat, user.home_lng) == (
        round(payload.lat, locality_rules.HOME_COORDINATE_PRECISION),
        round(payload.lng, locality_rules.HOME_COORDINATE_PRECISION),
    )
    if same_point:
        user.home_label = payload.label or None
    else:
        if user.home_change_allowed_at is not None and user.home_change_allowed_at > now:
            raise HomeCooldownError("Район можно менять не чаще одного раза в 30 дней.")
        await apply_home(session, user, payload.lat, payload.lng, payload.label, now)
    await session.commit()
    return await build_me(session, user, now)


async def remove_home(session: AsyncSession, user: User) -> UserMe:
    now = utcnow()
    user.home_lat = user.home_lng = user.home_label = user.home_set_at = None
    subscription = await _home_subscription(session, user)
    if subscription is not None:
        await session.delete(subscription)
    await locality.refresh_confidence(session, user, now)
    await session.commit()
    return await build_me(session, user, now)


async def get_me(session: AsyncSession, user: User) -> UserMe:
    return await build_me(session, user, utcnow())


async def update_me(session: AsyncSession, user: User, payload: UserUpdate) -> UserMe:
    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.bio is not None:
        user.bio = payload.bio
    await session.commit()
    return await build_me(session, user, utcnow())


async def list_top(session: AsyncSession, limit: int) -> list[UserBrief]:
    rows = await session.scalars(
        select(User).where(User.is_system.is_(False)).order_by(User.reputation.desc(), User.id).limit(limit)
    )
    return [UserBrief.model_validate(row) for row in rows]


async def _get_user(session: AsyncSession, user_id: int) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError("Пользователь не найден.")
    return user


async def _count(session: AsyncSession, model: type, *conditions: object) -> int:
    return await session.scalar(select(func.count()).select_from(model).where(*conditions)) or 0


async def _stats(session: AsyncSession, user_id: int, viewer: User | None) -> UserStats:
    """Counters as the viewer may see them: the user's own publications in a screening window count for
    the user alone (SPEC §24.1)."""
    is_own = viewer is not None and viewer.id == user_id
    own = viewer if is_own else None
    is_public = place_queries.listed_clause(own)
    reviews_shown = (
        Review.author_id == user_id if is_own else Review.id.not_in(quiet_holds.active_ids(AiTarget.REVIEW))
    )
    public_route = and_(Route.visibility == RouteVisibility.PUBLIC, Route.status.in_(PUBLIC_ROUTE_STATUSES))
    if is_own:
        public_route = or_(
            public_route,
            quiet_holds.own_shown_as(
                AiTarget.ROUTE, Route.id, Route.author_id, user_id, PUBLIC_ROUTE_STATUSES
            ),
        )
    return UserStats(
        places_total=await _count(session, Place, Place.author_id == user_id, is_public),
        places_verified=await _count(
            session,
            Place,
            Place.author_id == user_id,
            place_queries.listed_clause(own, (PlaceStatus.VERIFIED,)),
        ),
        votes=await _count(session, Vote, Vote.user_id == user_id),
        reviews=await _count(session, Review, Review.author_id == user_id, reviews_shown),
        routes=await _count(
            session, Route, Route.author_id == user_id, public_route, ~quest_lookup.is_quest_clause()
        ),
        events_organized=await _count(
            session, Place, Place.author_id == user_id, Place.layer == Layer.EVENT, is_public
        ),
        respects_received=await _count(session, Respect, Respect.to_user_id == user_id),
    )


async def _build_profile(session: AsyncSession, user: User, viewer: User | None) -> UserProfile:
    respected_by_me = False
    if viewer is not None:
        respected_by_me = bool(
            await _count(session, Respect, Respect.from_user_id == viewer.id, Respect.to_user_id == user.id)
        )
    upcoming = levels.next_level(user.reputation)
    return UserProfile(
        **UserBrief.model_validate(user).model_dump(),
        bio=user.bio,
        created_at=user.created_at,
        stats=await _stats(session, user.id, viewer),
        next_level=NextLevel(level=upcoming[0], reputation_required=upcoming[1]) if upcoming else None,
        respected_by_me=respected_by_me,
    )


async def get_profile(session: AsyncSession, user_id: int, viewer: User | None) -> UserProfile:
    return await _build_profile(session, await _get_user(session, user_id), viewer)


async def list_user_places(
    session: AsyncSession, user_id: int, viewer: User | None, limit: int
) -> list[PlaceCard]:
    """Public places of the user; on their own profile also the pending and hidden ones."""
    now = utcnow()
    user = await _get_user(session, user_id)
    statuses = PUBLIC_STATUSES
    if viewer is not None and viewer.id == user.id:
        statuses = (*PUBLIC_STATUSES, *OWN_EXTRA_STATUSES)
    rows = await session.scalars(
        place_queries.card_query()
        .where(Place.author_id == user.id, Place.status.in_(statuses))
        .order_by(Place.created_at.desc(), Place.id.desc())
        .limit(limit)
    )
    return await place_queries.cards(session, list(rows), now)


async def record_respect(session: AsyncSession, sender: User, receiver: User, now: datetime) -> None:
    session.add(Respect(from_user_id=sender.id, to_user_id=receiver.id, created_at=now))
    await reputation.award(session, receiver, ReputationReason.RESPECT_RECEIVED, now=now)
    notifications.notify(
        session,
        user_id=receiver.id,
        kind=NotificationKind.RESPECT,
        title=f"{sender.display_name} отправил(а) вам респект",
        body="Спасибо за вклад в карту города!",
        link=notifications.user_link(sender.id),
        now=now,
    )


async def send_respect(session: AsyncSession, sender: User, receiver_id: int) -> UserProfile:
    now = utcnow()
    receiver = await _get_user(session, receiver_id)
    if receiver.is_system:
        raise BadRequestError("Этому аккаунту нельзя отправить респект.")
    if receiver.id == sender.id:
        raise BadRequestError("Нельзя отправить респект самому себе.")
    if not levels.can_send_respect(sender.level, sender.role):
        raise ForbiddenError("Респекты доступны с уровня «Житель».")
    if await _count(session, Respect, Respect.from_user_id == sender.id, Respect.to_user_id == receiver.id):
        raise ConflictError("Вы уже отправляли респект этому пользователю.")
    sent_today = await _count(
        session, Respect, Respect.from_user_id == sender.id, Respect.created_at > now - limits.DAY
    )
    if sent_today >= limits.RESPECTS_PER_DAY:
        raise RateLimitedError(f"В сутки можно отправить не больше {limits.RESPECTS_PER_DAY} респектов.")
    await record_respect(session, sender, receiver, now)
    await session.commit()
    return await _build_profile(session, receiver, sender)


async def list_subscriptions(session: AsyncSession, user: User) -> list[SubscriptionOut]:
    rows = await session.scalars(
        select(Subscription).where(Subscription.user_id == user.id).order_by(Subscription.id)
    )
    return [SubscriptionOut.model_validate(row) for row in rows]


async def create_subscription(session: AsyncSession, user: User, payload: SubscriptionIn) -> SubscriptionOut:
    if await _count(session, Subscription, Subscription.user_id == user.id) >= limits.MAX_SUBSCRIPTIONS:
        raise ConflictError(f"Можно создать не больше {limits.MAX_SUBSCRIPTIONS} подписок на территории.")
    subscription = Subscription(
        user_id=user.id,
        title=payload.title,
        lat=payload.lat,
        lng=payload.lng,
        radius_m=payload.radius_m,
        layers=[layer.value for layer in dict.fromkeys(payload.layers)],
        created_at=utcnow(),
    )
    session.add(subscription)
    await session.commit()
    return SubscriptionOut.model_validate(subscription)


async def delete_subscription(session: AsyncSession, user: User, subscription_id: int) -> None:
    subscription = await session.scalar(
        select(Subscription).where(Subscription.id == subscription_id, Subscription.user_id == user.id)
    )
    if subscription is None:
        raise NotFoundError("Подписка не найдена.")
    if subscription.is_home:
        raise ConflictError("Подписка «Мой район» управляется через настройку района.")
    await session.delete(subscription)
    await session.commit()
