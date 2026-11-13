from datetime import datetime
from typing import Annotated, Self

from pydantic import SerializationInfo, StringConstraints, field_serializer, model_validator

from app.schemas.common import ApiModel, MediumText, OwnedText
from app.schemas.place import PlaceCard
from app.schemas.user import UserBrief

CollectionTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=80)]


class CollectionOut(OwnedText):
    id: int
    title: str
    description: str
    is_public: bool
    owner: UserBrief
    items_count: int
    cover_url: str | None
    created_at: datetime

    @model_validator(mode="after")
    def _own_texts(self) -> Self:
        self._own(self.owner.id)
        return self

    @field_serializer("title", "description")
    def _texts(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class CollectionDetail(CollectionOut):
    places: list[PlaceCard]
    can_edit: bool


class CollectionIn(ApiModel):
    title: CollectionTitle
    description: MediumText = ""
    is_public: bool = False


class CollectionUpdate(ApiModel):
    title: CollectionTitle | None = None
    description: MediumText | None = None
    is_public: bool | None = None
