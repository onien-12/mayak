from datetime import datetime

from pydantic import SerializationInfo, field_serializer

from app.domain.enums import NotificationKind
from app.schemas.common import ApiModel, OwnedText


class NotificationOut(OwnedText):
    """Titles and bodies quote other people's texts (a comment, a place title): always masked."""

    id: int
    kind: NotificationKind
    title: str
    body: str
    link: str | None
    is_read: bool
    created_at: datetime

    @field_serializer("title", "body")
    def _texts(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class NotificationsReadIn(ApiModel):
    ids: list[int] | None = None


class UnreadOut(ApiModel):
    unread: int
