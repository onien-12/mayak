from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, SessionDep
from app.schemas.notification import NotificationOut, NotificationsReadIn, UnreadOut
from app.services import notifications

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    user: CurrentUser,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[NotificationOut]:
    return await notifications.list_notifications(session, user, limit=limit, offset=offset)


@router.post("/read")
async def mark_read(
    user: CurrentUser, session: SessionDep, payload: NotificationsReadIn | None = None
) -> UnreadOut:
    return UnreadOut(unread=await notifications.mark_read(session, user, payload.ids if payload else None))
