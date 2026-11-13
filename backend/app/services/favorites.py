"""Saved places and routes of a user."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.models import Favorite, Place, User
from app.schemas.favorites import FavoritesOut
from app.services import place_queries, routes
from app.services.interests import signals as interest_signals


async def add_favorite(session: AsyncSession, user: User, place_id: int) -> None:
    place = await place_queries.get_visible_place(session, place_id, user)
    exists = await session.scalar(
        select(Favorite.id).where(Favorite.user_id == user.id, Favorite.place_id == place.id)
    )
    if exists is None:
        session.add(Favorite(user_id=user.id, place_id=place.id, created_at=utcnow()))
        await session.commit()
        await interest_signals.on_favorite(session, user.id, place.id, added=True)


async def remove_favorite(session: AsyncSession, user: User, place_id: int) -> None:
    result = await session.execute(
        delete(Favorite).where(Favorite.user_id == user.id, Favorite.place_id == place_id)
    )
    await session.commit()
    if result.rowcount:
        await interest_signals.on_favorite(session, user.id, place_id, added=False)


async def list_favorites(session: AsyncSession, user: User) -> FavoritesOut:
    now = utcnow()
    rows = await session.scalars(
        place_queries.card_query()
        .join(Favorite, Favorite.place_id == Place.id)
        .where(Favorite.user_id == user.id, place_queries.listed_clause(user))
        .order_by(Favorite.created_at.desc(), Favorite.id.desc())
    )
    return FavoritesOut(
        places=await place_queries.cards(session, list(rows), now),
        routes=await routes.list_saved_routes(session, user),
    )
