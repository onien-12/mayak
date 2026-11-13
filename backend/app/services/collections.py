"""Collections: named lists of places, private or public."""

from enum import StrEnum

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.clock import utcnow
from app.core.errors import ForbiddenError, NotFoundError, UnauthorizedError
from app.models import Collection, CollectionItem, Place, User
from app.schemas.collection import CollectionDetail, CollectionIn, CollectionOut, CollectionUpdate
from app.schemas.user import UserBrief
from app.services import place_queries
from app.services.interests import signals as interest_signals

DEFAULT_LIMIT = 50
MAX_LIMIT = 200
_NOT_FOUND = "Подборка не найдена."


class CollectionScope(StrEnum):
    PUBLIC = "public"
    MINE = "mine"


async def _summaries(
    session: AsyncSession, collection_ids: list[int], viewer: User | None
) -> dict[int, tuple[int, str | None]]:
    """Items count and cover (first photo among the items) per collection, in one query."""
    summaries: dict[int, tuple[int, str | None]] = {}
    if not collection_ids:
        return summaries
    rows = await session.execute(
        select(CollectionItem.collection_id, Place.cover_url)
        .join(Place, Place.id == CollectionItem.place_id)
        .where(CollectionItem.collection_id.in_(collection_ids), place_queries.listed_clause(viewer))
        .order_by(CollectionItem.created_at, CollectionItem.id)
    )
    for collection_id, cover_url in rows:
        count, cover = summaries.get(collection_id, (0, None))
        summaries[collection_id] = (count + 1, cover or cover_url)
    return summaries


def _out_fields(collection: Collection, summary: tuple[int, str | None]) -> dict[str, object]:
    return {
        "id": collection.id,
        "title": collection.title,
        "description": collection.description,
        "is_public": collection.is_public,
        "owner": UserBrief.model_validate(collection.owner),
        "items_count": summary[0],
        "cover_url": summary[1],
        "created_at": collection.created_at,
    }


async def _to_out(session: AsyncSession, collection: Collection, viewer: User | None) -> CollectionOut:
    summaries = await _summaries(session, [collection.id], viewer)
    return CollectionOut(**_out_fields(collection, summaries.get(collection.id, (0, None))))


async def list_collections(
    session: AsyncSession, viewer: User | None, scope: CollectionScope, *, limit: int, offset: int
) -> list[CollectionOut]:
    statement = select(Collection).options(joinedload(Collection.owner))
    if scope is CollectionScope.MINE:
        if viewer is None:
            raise UnauthorizedError("Войдите в аккаунт, чтобы увидеть свои подборки.")
        statement = statement.where(Collection.owner_id == viewer.id)
    else:
        statement = statement.where(Collection.is_public.is_(True))
    rows = list(
        await session.scalars(
            statement.order_by(Collection.created_at.desc(), Collection.id.desc()).limit(limit).offset(offset)
        )
    )
    summaries = await _summaries(session, [row.id for row in rows], viewer)
    return [CollectionOut(**_out_fields(row, summaries.get(row.id, (0, None)))) for row in rows]


async def _get_collection(session: AsyncSession, collection_id: int, viewer: User | None) -> Collection:
    collection = await session.scalar(
        select(Collection).where(Collection.id == collection_id).options(joinedload(Collection.owner))
    )
    is_owner = collection is not None and viewer is not None and collection.owner_id == viewer.id
    if collection is None or not (collection.is_public or is_owner):
        raise NotFoundError(_NOT_FOUND)
    return collection


async def _get_own_collection(session: AsyncSession, collection_id: int, owner: User) -> Collection:
    collection = await _get_collection(session, collection_id, owner)
    if collection.owner_id != owner.id:
        raise ForbiddenError("Изменять подборку может только её владелец.")
    return collection


async def get_detail(session: AsyncSession, collection_id: int, viewer: User | None) -> CollectionDetail:
    now = utcnow()
    collection = await _get_collection(session, collection_id, viewer)
    rows = await session.scalars(
        place_queries.card_query()
        .join(CollectionItem, CollectionItem.place_id == Place.id)
        .where(CollectionItem.collection_id == collection.id, place_queries.listed_clause(viewer))
        .order_by(CollectionItem.created_at, CollectionItem.id)
    )
    cards = await place_queries.cards(session, list(rows), now)
    cover = next((card.cover_url for card in cards if card.cover_url), None)
    return CollectionDetail(
        **_out_fields(collection, (len(cards), cover)),
        places=cards,
        can_edit=viewer is not None and viewer.id == collection.owner_id,
    )


async def create_collection(session: AsyncSession, owner: User, payload: CollectionIn) -> CollectionOut:
    collection = Collection(
        owner=owner,
        title=payload.title,
        description=payload.description,
        is_public=payload.is_public,
        created_at=utcnow(),
    )
    session.add(collection)
    await session.commit()
    return CollectionOut(**_out_fields(collection, (0, None)))


async def update_collection(
    session: AsyncSession, owner: User, collection_id: int, payload: CollectionUpdate
) -> CollectionOut:
    collection = await _get_own_collection(session, collection_id, owner)
    if payload.title is not None:
        collection.title = payload.title
    if payload.description is not None:
        collection.description = payload.description
    if payload.is_public is not None:
        collection.is_public = payload.is_public
    await session.commit()
    return await _to_out(session, collection, owner)


async def delete_collection(session: AsyncSession, owner: User, collection_id: int) -> None:
    collection = await _get_own_collection(session, collection_id, owner)
    await session.execute(delete(CollectionItem).where(CollectionItem.collection_id == collection.id))
    await session.delete(collection)
    await session.commit()


async def add_place(session: AsyncSession, owner: User, collection_id: int, place_id: int) -> None:
    collection = await _get_own_collection(session, collection_id, owner)
    place = await place_queries.get_visible_place(session, place_id, owner)
    exists = await session.scalar(
        select(func.count())
        .select_from(CollectionItem)
        .where(CollectionItem.collection_id == collection.id, CollectionItem.place_id == place.id)
    )
    if not exists:
        session.add(CollectionItem(collection_id=collection.id, place_id=place.id, created_at=utcnow()))
        await session.commit()
        await interest_signals.on_collection(session, owner.id, place.id, added=True)


async def remove_place(session: AsyncSession, owner: User, collection_id: int, place_id: int) -> None:
    collection = await _get_own_collection(session, collection_id, owner)
    result = await session.execute(
        delete(CollectionItem).where(
            CollectionItem.collection_id == collection.id, CollectionItem.place_id == place_id
        )
    )
    await session.commit()
    if result.rowcount:
        await interest_signals.on_collection(session, owner.id, place_id, added=False)
