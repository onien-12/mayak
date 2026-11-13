from datetime import datetime
from typing import Annotated, Self

from pydantic import (
    Field,
    SerializationInfo,
    StringConstraints,
    field_serializer,
    field_validator,
    model_validator,
)

from app.domain import routing
from app.domain.enums import (
    PathMode,
    PathSource,
    RouteDifficulty,
    RouteKind,
    RouteStatus,
    RouteVisibility,
    StopKind,
)
from app.schemas.common import (
    ApiModel,
    Latitude,
    LatLng,
    Longitude,
    LongText,
    MediumText,
    OwnedText,
    Title,
)
from app.schemas.place import PhotoOut, PlaceCard, ScreeningHold, normalize_tags
from app.schemas.user import UserBrief

MAX_STAY_MIN = 600
MAX_STOP_PHOTOS = 6

StopTitle = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
Landmark = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
RoutePoints = Annotated[list[LatLng], Field(min_length=routing.MIN_POINTS, max_length=routing.MAX_POINTS)]


class RouteCard(OwnedText):
    """Free texts are the author's; masked for everyone else (SPEC §24.5)."""

    id: int
    title: str
    description: str
    kind: RouteKind
    status: RouteStatus
    visibility: RouteVisibility
    difficulty: RouteDifficulty | None
    tags: list[str]
    distance_m: int
    travel_min: int
    duration_min: int
    stops_count: int
    cover_url: str | None
    author: UserBrief
    rating_avg: float | None
    rating_count: int
    saves_count: int
    is_saved: bool
    path: list[tuple[float, float]]
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def _own_texts(self) -> Self:
        self._own(self.author.id, getattr(self, "stops", None) or [])
        return self

    @field_serializer("title", "description")
    def _texts(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)

    @field_serializer("tags")
    def _tags(self, value: list[str], info: SerializationInfo) -> list[str]:
        return self._shown_list(value, info)


class RouteStopOut(OwnedText):
    position: int
    kind: StopKind
    title: str
    lat: float
    lng: float
    note: str
    landmark: str
    stay_min: int
    photos: list[PhotoOut]
    distance_from_prev_m: int | None
    place: PlaceCard | None

    @field_serializer("title", "note", "landmark")
    def _texts(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class RouteDetail(RouteCard):
    tips: str | None
    path_mode: PathMode
    path_source: PathSource
    stops: list[RouteStopOut]
    can_edit: bool
    my_rating: int | None
    screening_hold: ScreeningHold | None
    """Only for the author and moderators, while the route waits for a moderator (SPEC §24.1)."""

    @field_serializer("tips")
    def _tips(self, value: str | None, info: SerializationInfo) -> str | None:
        return self._shown_optional(value, info)


class StopInput(ApiModel):
    place_id: int | None = None
    kind: StopKind = StopKind.POI
    title: StopTitle | None = None
    lat: Latitude | None = None
    lng: Longitude | None = None
    note: MediumText = ""
    landmark: Landmark = ""
    stay_min: int = Field(default=0, ge=0, le=MAX_STAY_MIN)
    photo_ids: Annotated[list[int], Field(max_length=MAX_STOP_PHOTOS)] = Field(default_factory=list)

    @model_validator(mode="after")
    def _custom_stop_is_complete(self) -> Self:
        if self.place_id is not None:
            return self
        if self.lat is None or self.lng is None:
            raise ValueError("Укажите координаты точки маршрута")
        if not self.title and self.kind is not StopKind.VIA:
            raise ValueError("Укажите название точки маршрута")
        return self


def _enough_visible_stops(stops: list[StopInput]) -> list[StopInput]:
    visible = sum(1 for stop in stops if stop.kind is not StopKind.VIA)
    if visible < routing.MIN_VISIBLE_STOPS:
        raise ValueError(f"В маршруте должно быть не меньше {routing.MIN_VISIBLE_STOPS} остановок")
    return stops


RouteStops = Annotated[list[StopInput], Field(min_length=routing.MIN_POINTS, max_length=routing.MAX_POINTS)]


class RouteInput(ApiModel):
    title: Title
    description: LongText = ""
    kind: RouteKind
    difficulty: RouteDifficulty | None = None
    visibility: RouteVisibility = RouteVisibility.PUBLIC
    path_mode: PathMode = PathMode.ROADS
    tips: MediumText | None = None
    tags: list[str] = Field(default_factory=list)
    stops: RouteStops

    _tags = field_validator("tags")(normalize_tags)
    _stops = field_validator("stops")(_enough_visible_stops)


class RouteUpdate(ApiModel):
    title: Title | None = None
    description: LongText | None = None
    kind: RouteKind | None = None
    difficulty: RouteDifficulty | None = None
    visibility: RouteVisibility | None = None
    path_mode: PathMode | None = None
    tips: MediumText | None = None
    tags: list[str] | None = None
    stops: RouteStops | None = None

    @field_validator("tags")
    @classmethod
    def _tags(cls, tags: list[str] | None) -> list[str] | None:
        return None if tags is None else normalize_tags(tags)

    @field_validator("stops")
    @classmethod
    def _stops(cls, stops: list[StopInput] | None) -> list[StopInput] | None:
        return None if stops is None else _enough_visible_stops(stops)


class RoutePreviewIn(ApiModel):
    kind: RouteKind
    path_mode: PathMode = PathMode.ROADS
    points: RoutePoints


class RoutePreviewOut(ApiModel):
    path: list[tuple[float, float]]
    distance_m: int
    travel_min: int
    legs_m: list[int]
    source: PathSource
