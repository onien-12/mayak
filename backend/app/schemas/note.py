from datetime import datetime
from typing import Annotated, Self

from pydantic import SerializationInfo, StringConstraints, field_serializer, model_validator

from app.schemas.common import ApiModel, Latitude, Longitude, OwnedText
from app.schemas.user import UserBrief

NoteText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
ObjectId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
ObjectName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


class MapNoteOut(OwnedText):
    id: int
    lat: float
    lng: float
    text: str
    object_id: str | None
    object_name: str | None
    author: UserBrief
    created_at: datetime
    can_delete: bool
    reported_by_me: bool
    on_review: bool = False
    """The viewer's own note that did not pass the screening: only they and moderators see it."""

    @model_validator(mode="after")
    def _own_texts(self) -> Self:
        self._own(self.author.id)
        return self

    @field_serializer("text")
    def _text(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)

    @field_serializer("object_name")
    def _object_name(self, value: str | None, info: SerializationInfo) -> str | None:
        return self._shown_optional(value, info)


class MapNoteIn(ApiModel):
    lat: Latitude
    lng: Longitude
    text: NoteText
    object_id: ObjectId | None = None
    object_name: ObjectName | None = None
