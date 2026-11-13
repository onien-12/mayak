from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, OptionalUser, SessionDep
from app.schemas.collection import CollectionDetail, CollectionIn, CollectionOut, CollectionUpdate
from app.services import collections
from app.services.collections import CollectionScope

router = APIRouter(prefix="/collections", tags=["collections"])


@router.get("")
async def list_collections(
    viewer: OptionalUser,
    session: SessionDep,
    scope: CollectionScope = CollectionScope.PUBLIC,
    limit: Annotated[int, Query(ge=1, le=collections.MAX_LIMIT)] = collections.DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[CollectionOut]:
    return await collections.list_collections(session, viewer, scope, limit=limit, offset=offset)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_collection(payload: CollectionIn, user: CurrentUser, session: SessionDep) -> CollectionOut:
    return await collections.create_collection(session, user, payload)


@router.get("/{collection_id}")
async def get_collection(collection_id: int, viewer: OptionalUser, session: SessionDep) -> CollectionDetail:
    return await collections.get_detail(session, collection_id, viewer)


@router.patch("/{collection_id}")
async def update_collection(
    collection_id: int, payload: CollectionUpdate, user: CurrentUser, session: SessionDep
) -> CollectionOut:
    return await collections.update_collection(session, user, collection_id, payload)


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(collection_id: int, user: CurrentUser, session: SessionDep) -> None:
    await collections.delete_collection(session, user, collection_id)


@router.put("/{collection_id}/places/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_place(collection_id: int, place_id: int, user: CurrentUser, session: SessionDep) -> None:
    await collections.add_place(session, user, collection_id, place_id)


@router.delete("/{collection_id}/places/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_place(collection_id: int, place_id: int, user: CurrentUser, session: SessionDep) -> None:
    await collections.remove_place(session, user, collection_id, place_id)
