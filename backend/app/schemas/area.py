from datetime import datetime
from typing import Annotated, Any, Literal, Self

from pydantic import Field, SerializationInfo, StringConstraints, field_serializer, model_validator

from app.domain.enums import AreaKind
from app.domain.interests import Topic
from app.schemas.common import ApiModel, Latitude, Longitude, LongText, OwnedText
from app.schemas.place import (
    CombinedRating,
    CoverSource,
    ExternalRating,
    ExternalSource,
    ObjectId,
    PhotoCredit,
    PhotoOut,
    PlaceCard,
    TextCredit,
)
from app.schemas.user import UserBrief

AreaTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=80)]
Radius = Annotated[int, Field(ge=50, le=5000)]
GeoPolygon = dict[str, Any]
"""GeoJSON `Polygon` / `MultiPolygon`; validated by `domain.geometry`, not by the schema."""


class Highlight(ApiModel):
    category_id: int
    count: int


class PersonalInterest(ApiModel):
    """`interest` moved towards the viewer (SPEC §23.4) and the 1–2 topics that explain why."""

    value: int
    topics: list[Topic]


class CommunityEventRef(OwnedText):
    """An upcoming event residents made inside a location: enough to name it and open it.
    Its title is the event author's text."""

    id: int
    title: str
    starts_at: datetime

    @field_serializer("title")
    def _title(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)

    @classmethod
    def of(cls, place_id: int, title: str, starts_at: datetime, author_id: int) -> Self:
        ref = cls(id=place_id, title=title, starts_at=starts_at)
        ref._own(author_id)
        return ref


class AreaCard(OwnedText):
    """Title and description are user texts: masked for all but moderators and the author."""

    id: int
    title: str
    kind: AreaKind
    geometry: GeoPolygon
    lat: float
    lng: float
    radius_m: int
    cover_url: str | None
    cover_credit: PhotoCredit | None
    cover_source: CoverSource | None = None
    places_count: int
    interest: int
    rating_avg: float | None
    combined_rating: CombinedRating | None
    highlights: list[Highlight]
    events_upcoming: int
    community_events_upcoming: int
    """Of `events_upcoming`, those residents made (SPEC §17)."""
    next_community_event: CommunityEventRef | None
    """The nearest of them by start."""
    bare_background: bool
    """A small imported territory with nothing residents made inside: not drawn on the «Карта»
    section by default (SPEC §18)."""
    issues_open: int
    external: ExternalSource | None
    personal_interest: PersonalInterest | None

    @field_serializer("title")
    def _title(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class AreaDetail(AreaCard):
    description: str
    description_credit: TextCredit | None
    object_id: str | None
    author: UserBrief | None
    created_at: datetime
    can_edit: bool
    photos: list[PhotoOut]
    external_rating: ExternalRating | None
    places: list[PlaceCard]
    topics: list[Topic]

    @model_validator(mode="after")
    def _own_texts(self) -> Self:
        self._own(self.author.id if self.author else None)
        return self

    @field_serializer("description")
    def _description(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class TerritoryInput(ApiModel):
    """Either an exact `geometry` or the circle fallback `lat` + `lng` + `radius_m`."""

    geometry: GeoPolygon | None = None
    lat: Latitude | None = None
    lng: Longitude | None = None
    radius_m: Radius | None = None

    @property
    def has_circle(self) -> bool:
        return self.lat is not None and self.lng is not None and self.radius_m is not None

    @property
    def has_territory(self) -> bool:
        return self.geometry is not None or self.has_circle


class AreaInput(TerritoryInput):
    title: AreaTitle
    kind: AreaKind
    description: LongText = ""
    object_id: ObjectId | None = None

    @model_validator(mode="after")
    def _territory_is_given(self) -> Self:
        if not self.has_territory:
            raise ValueError("Укажите контур территории или круг: центр и радиус")
        return self


class AreaUpdate(TerritoryInput):
    title: AreaTitle | None = None
    kind: AreaKind | None = None
    description: LongText | None = None
    object_id: ObjectId | None = None


class AreaGeometryCandidate(ApiModel):
    title: str
    source: Literal["2gis", "osm"]
    geometry: GeoPolygon
    attribution: str | None
