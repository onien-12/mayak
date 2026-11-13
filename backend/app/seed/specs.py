"""Declarative shapes of the seed data. Times are relative to the moment the seed runs."""

from collections.abc import Mapping
from dataclasses import dataclass, field

from app.domain.attributes import AttributeValue
from app.domain.enums import (
    AreaKind,
    IssueSeverity,
    OutageResource,
    PathMode,
    RouteDifficulty,
    RouteKind,
    RouteVisibility,
    StopKind,
    UserRole,
)
from app.domain.outages import House


@dataclass(frozen=True, slots=True)
class SeedUser:
    username: str
    email: str
    display_name: str
    reputation: int
    joined_days_ago: int
    role: UserRole = UserRole.USER
    bio: str = ""
    home: tuple[float, float, str] | None = None
    """`(lat, lng, label)` of the declared home area, set ten days after joining."""


@dataclass(frozen=True, slots=True)
class SeedReview:
    author: str
    rating: int
    text: str
    days_ago: float


@dataclass(frozen=True, slots=True)
class SeedComment:
    author: str
    text: str
    days_ago: float


@dataclass(frozen=True, slots=True)
class SeedEvent:
    """`starts_in_hours` is relative to now; `weekend_day` (5 = Sat, 6 = Sun) pins the event
    to the coming weekend at `local_hour` Vladivostok time instead."""

    duration_hours: float
    starts_in_hours: float = 0.0
    weekend_day: int | None = None
    local_hour: int = 12
    capacity: int | None = None
    price: int = 0
    age_limit: int | None = None
    registration_url: str | None = None
    contact: str | None = None
    is_meetup: bool = False
    venue: str | None = None
    participants: str = ""
    repeat_weeks: int = 0


@dataclass(frozen=True, slots=True)
class SeedIssue:
    severity: IssueSeverity = IssueSeverity.MEDIUM
    radius_m: int | None = None


@dataclass(frozen=True, slots=True)
class SeedPlace:
    """Votes are listed as space-separated usernames in voting order (present, unclear, absent)
    and spread evenly between the creation time and `last_vote_days_ago`."""

    key: str
    category: str
    title: str
    lat: float
    lng: float
    author: str
    age_days: float
    description: str = ""
    address: str | None = None
    tips: str | None = None
    attributes: Mapping[str, AttributeValue] = field(default_factory=dict)
    tags: tuple[str, ...] = ()
    present: str = ""
    unclear: str = ""
    absent: str = ""
    last_vote_days_ago: float = 2.0
    reviews: tuple[SeedReview, ...] = ()
    comments: tuple[SeedComment, ...] = ()
    event: SeedEvent | None = None
    issue: SeedIssue | None = None


@dataclass(frozen=True, slots=True)
class SeedStop:
    """A waypoint: linked to a seeded place by key, or custom with its own title and coordinates."""

    place: str | None = None
    note: str = ""
    stay_min: int = 0
    kind: StopKind = StopKind.POI
    title: str | None = None
    lat: float | None = None
    lng: float | None = None
    landmark: str = ""


@dataclass(frozen=True, slots=True)
class SeedRoute:
    key: str
    title: str
    description: str
    kind: RouteKind
    author: str
    age_days: float
    stops: tuple[SeedStop, ...]
    difficulty: RouteDifficulty | None = None
    visibility: RouteVisibility = RouteVisibility.PUBLIC
    path_mode: PathMode = PathMode.ROADS
    tips: str | None = None
    tags: tuple[str, ...] = ()
    reviews: tuple[SeedReview, ...] = ()
    saved_by: str = ""


@dataclass(frozen=True, slots=True)
class SeedNote:
    author: str
    text: str
    lat: float
    lng: float
    days_ago: float
    object_id: str | None = None
    object_name: str | None = None


@dataclass(frozen=True, slots=True)
class SeedOutage:
    number: str
    resource: OutageResource
    description: str
    initiator: str | None
    started_hours_ago: float
    ends_in_hours: float | None
    complaints_count: int
    houses: tuple[House, ...]


@dataclass(frozen=True, slots=True)
class SeedArea:
    key: str
    title: str
    kind: AreaKind
    description: str
    fallback_circle: tuple[float, float, int]
    """`(lat, lng, radius_m)` used when the polygon file has no outline for the key."""


@dataclass(frozen=True, slots=True)
class SeedCollection:
    title: str
    description: str
    owner: str
    places: tuple[str, ...]
    age_days: float
    is_public: bool = True
