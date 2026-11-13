"""«Потеряшки» (SPEC §26). No public schema carries a contact: only `LostResponseOut`, which is
served to the two people of one response, has contact fields, and they are filled per viewer."""

from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import Field, SerializationInfo, StringConstraints, field_serializer, model_validator

from app.domain.lost_found import LostCategory, LostKind, LostState, ResponseState
from app.schemas.common import ApiModel, Latitude, Longitude, OwnedText
from app.schemas.place import PhotoOut
from app.schemas.user import UserBrief

LostTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=120)]
LostDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
ControlQuestion = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)]
ResponseMessage = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
ContactLine = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)]
Radius = Literal[300, 1000, 3000]


class LostItemIn(ApiModel):
    kind: LostKind
    category: LostCategory
    title: LostTitle
    description: LostDescription = ""
    lat: Latitude
    lng: Longitude
    radius_m: Radius | None = None
    """Lost posts: 300, 1000 or 3000 m; none — «не знаю где» (the whole city). Ignored for found posts."""
    happened_on: date
    control_question: ControlQuestion | None = None
    """Found posts only."""
    photo_ids: list[int] = Field(default_factory=list, max_length=3)


class LostItemCard(OwnedText):
    id: int
    kind: LostKind
    category: LostCategory
    title: str
    description: str
    lat: float
    lng: float
    radius_m: int | None
    happened_on: date
    state: LostState
    created_at: datetime
    expires_at: datetime
    author: UserBrief
    cover_url: str | None
    photos_count: int
    on_review: bool = False
    """The viewer's own post in the screening that did not pass it: only they and moderators see it."""

    @model_validator(mode="after")
    def _own_texts(self) -> Self:
        self._own(self.author.id)
        return self

    @field_serializer("title", "description")
    def _texts(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class LostResponseOut(OwnedText):
    id: int
    item_id: int
    author: UserBrief
    message: str
    state: ResponseState
    created_at: datetime
    decided_at: datetime | None
    on_review: bool = False
    contact: str | None
    """The responder's contact: theirs to see, and the post author's once accepted."""
    owner_contact: str | None
    """The post author's contact: theirs to see, and the responder's once accepted."""

    @model_validator(mode="after")
    def _own_texts(self) -> Self:
        self._own(self.author.id)
        return self

    @field_serializer("message")
    def _message(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class LostItemOut(LostItemCard):
    photos: list[PhotoOut]
    control_question: str | None
    is_mine: bool
    can_respond: bool
    """Logged in, not the author, the post is active and the viewer has not responded yet."""
    can_delete: bool
    can_moderate: bool
    is_hidden: bool
    """Moderators only: hidden by reports or by a moderator."""
    reported_by_me: bool
    pending_responses: int
    """The author only: responses waiting for an answer."""
    my_response: LostResponseOut | None
    """The viewer's own response to this post."""

    @field_serializer("control_question")
    def _question(self, value: str | None, info: SerializationInfo) -> str | None:
        return self._shown_optional(value, info)


class LostResponseIn(ApiModel):
    message: ResponseMessage
    """Includes the answer to the control question, when the post has one."""
    contact: ContactLine


class LostAcceptIn(ApiModel):
    contact: ContactLine


class LostMatchOut(ApiModel):
    """A post that may be the same thing, in order; why — in plain words, never a score."""

    item: LostItemCard
    reason: str
