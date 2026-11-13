from datetime import datetime
from typing import Annotated, Self

from pydantic import Field, SerializationInfo, StringConstraints, field_serializer, model_validator

from app.domain.enums import Layer, UserLevel, UserRole
from app.schemas.common import ApiModel, Latitude, Longitude, OwnedText

DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=60)]
Bio = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class UserBrief(OwnedText):
    """The display name is the user's own text: masked for everyone else (SPEC §24.5)."""

    id: int
    username: str
    display_name: str
    level: UserLevel
    role: UserRole
    reputation: int

    @model_validator(mode="after")
    def _own_texts(self) -> Self:
        self._own(self.id)
        return self

    @field_serializer("display_name")
    def _display_name(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class Permissions(ApiModel):
    can_moderate: bool
    publishes_directly: bool
    can_respect: bool
    daily_place_limit: int
    places_left_today: int


class HomeArea(ApiModel):
    """The user's declared home area (SPEC §16). Private: only ever returned to its owner."""

    lat: float
    lng: float
    label: str | None
    set_at: datetime
    can_change_at: datetime | None


class HomeIn(ApiModel):
    lat: Latitude
    lng: Longitude
    label: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None


class UserMe(UserBrief):
    """Always about the caller themselves (also right after login), so never masked."""

    email: str
    bio: str
    created_at: datetime
    permissions: Permissions
    unread_notifications: int
    home: HomeArea | None

    @field_serializer("display_name")
    def _display_name(self, value: str, info: SerializationInfo) -> str:
        return value


class UserStats(ApiModel):
    places_total: int
    places_verified: int
    votes: int
    reviews: int
    routes: int
    events_organized: int
    respects_received: int


class NextLevel(ApiModel):
    level: UserLevel
    reputation_required: int


class UserProfile(UserBrief):
    bio: str
    created_at: datetime
    stats: UserStats
    next_level: NextLevel | None
    respected_by_me: bool

    @field_serializer("bio")
    def _bio(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class UserUpdate(ApiModel):
    display_name: DisplayName | None = None
    bio: Bio | None = None


class ReputationEventOut(ApiModel):
    id: int
    delta: int
    reason: str
    message: str
    place_id: int | None
    created_at: datetime


class SubscriptionIn(ApiModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    lat: Latitude
    lng: Longitude
    radius_m: int = Field(ge=200, le=10_000)
    layers: list[Layer] = Field(min_length=1, max_length=4)


class SubscriptionOut(ApiModel):
    id: int
    title: str
    lat: float
    lng: float
    radius_m: int
    layers: list[Layer]
    created_at: datetime
    is_home: bool
