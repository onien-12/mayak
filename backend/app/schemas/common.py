"""Building blocks shared by all request/response schemas."""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    PrivateAttr,
    SerializationInfo,
    StringConstraints,
)

from app.core import viewer


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class OwnedText(ApiModel):
    """A response whose free texts were written by one person (SPEC §24.5).

    Its text fields are serialized masked (profanity keeps its first and last letter) for
    everyone except that person and moderators. Only JSON output is masked: services that copy
    one schema into another through `model_dump()` keep the original. `_owner_id` is set by the
    model itself or by the model it is part of; None means "nobody in particular", masked for
    all but moderators.
    """

    _owner_id: int | None = PrivateAttr(default=None)

    def _shown(self, text: str, info: SerializationInfo) -> str:
        return viewer.shown(text, self._owner_id) if info.mode_is_json() else text

    def _shown_optional(self, text: str | None, info: SerializationInfo) -> str | None:
        return None if text is None else self._shown(text, info)

    def _shown_list(self, texts: list[str], info: SerializationInfo) -> list[str]:
        return [self._shown(text, info) for text in texts]

    def _own(self, owner_id: int | None, *parts: object) -> None:
        """Make `owner_id` the owner of this model and of the given nested parts."""
        self._owner_id = owner_id
        for part in parts:
            items = part if isinstance(part, list) else [part]
            for item in items:
                if isinstance(item, OwnedText):
                    item._owner_id = owner_id


def _to_utc(value: datetime) -> datetime:
    """Naive datetimes are taken as UTC; aware ones are converted."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


UtcDatetime = Annotated[datetime, AfterValidator(_to_utc)]
Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]
Rating = Annotated[int, Field(ge=1, le=5)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=120)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]
MediumText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
ReviewText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
CommentText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class LatLng(ApiModel):
    lat: Latitude
    lng: Longitude
