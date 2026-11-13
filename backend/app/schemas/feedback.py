from datetime import datetime
from typing import Self

from pydantic import SerializationInfo, field_serializer, model_validator

from app.schemas.common import ApiModel, CommentText, OwnedText, Rating, ReviewText
from app.schemas.user import UserBrief


class _AuthoredText(OwnedText):
    """`text` written by `author`: masked for everyone else (SPEC §24.5)."""

    author: UserBrief
    text: str

    @model_validator(mode="after")
    def _own_texts(self) -> Self:
        self._own(self.author.id)
        return self

    @field_serializer("text")
    def _text(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class ReviewOut(_AuthoredText):
    id: int
    author: UserBrief
    rating: int
    text: str
    created_at: datetime
    on_review: bool = False
    """The viewer's own review that did not pass the screening: only they and moderators see it."""


class ReviewIn(ApiModel):
    rating: Rating
    text: ReviewText = ""


class CommentOut(_AuthoredText):
    id: int
    author: UserBrief
    text: str
    created_at: datetime
    can_delete: bool
    on_review: bool = False
    """The viewer's own comment that did not pass the screening: only they and moderators see it."""


class CommentIn(ApiModel):
    text: CommentText
