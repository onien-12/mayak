from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import (
    Field,
    SerializationInfo,
    StringConstraints,
    field_serializer,
    field_validator,
    model_validator,
)

from app.domain import event_formats
from app.domain.attributes import AttributeValue
from app.domain.enums import (
    EventPhase,
    ExternalSourceId,
    HistoryKind,
    InfoSource,
    IssueSeverity,
    IssueStage,
    Layer,
    OutageResource,
    PlaceStatus,
    VoteKind,
)
from app.domain.interests import Topic
from app.schemas.catalog import CategoryOut
from app.schemas.common import (
    ApiModel,
    Latitude,
    Longitude,
    LongText,
    MediumText,
    OwnedText,
    Title,
    UtcDatetime,
)
from app.schemas.user import UserBrief

MAX_TAGS = 8
MAX_TAG_LENGTH = 24
MAX_INPUT_PHOTOS = 8

Address = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Url = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]
PhotoIds = Annotated[list[int], Field(max_length=MAX_INPUT_PHOTOS)]


ObjectId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
"""Id of a 2GIS map object (a building, a park) as reported by the map."""


class PhotoCredit(ApiModel):
    """Attribution of a freely licensed external photo; must be shown with it (SPEC §19)."""

    author: str
    license: str
    source_url: str


class CoverSource(ApiModel):
    """The map service a hot-linked cover is borrowed from (SPEC §20, §25): shown on the cover as
    «Фото: <label>» linking to the object's page there."""

    source: str
    label: str
    url: str


class TextCredit(ApiModel):
    """Licence notice of a description taken from a free source; must be shown with it (SPEC §19, §21)."""

    label: str
    license: str
    url: str


class PhotoOut(ApiModel):
    id: int
    url: str
    width: int
    height: int
    credit: PhotoCredit | None
    on_review: bool = False
    """The viewer's own photo that did not pass the screening: only they and moderators see it."""


class ScreeningHold(ApiModel):
    """The publication did not pass the automatic check and waits for a moderator (SPEC §24.1).
    Only for its author and moderators; the reasons are in words without the model's numbers."""

    reasons: list[str]


class ExternalRating(ApiModel):
    """Aggregate rating of the linked 2GIS object; a reference, never mixed into `rating_avg`."""

    source: Literal["2gis"]
    rating: float
    count: int
    url: str


class CombinedRatingPart(ApiModel):
    source: Literal["mayak", "yandex", "2gis", "google"]
    rating: float
    count: int | None


class CombinedRating(ApiModel):
    """Our rating blended with the external catalogues' (SPEC §22); cached data only. A separate
    figure: `rating_avg`, trust, interest, sorting and filters never use it."""

    value: float
    count: int
    parts: list[CombinedRatingPart]
    """Ours first when present."""


class ExternalSource(ApiModel):
    """Where imported content came from (SPEC §11)."""

    source: ExternalSourceId
    label: str
    url: str


class AreaRef(OwnedText):
    """The location a place belongs to (SPEC §17)."""

    id: int
    title: str

    @field_serializer("title")
    def _title(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class EventBrief(OwnedText):
    starts_at: datetime
    ends_at: datetime
    phase: EventPhase
    price: int | None
    price_note: str | None
    capacity: int | None
    participants_count: int
    is_meetup: bool

    @field_serializer("price_note")
    def _price_note(self, value: str | None, info: SerializationInfo) -> str | None:
        return self._shown_optional(value, info)


class EventDetail(EventBrief):
    seats_left: int | None
    age_limit: int | None
    registration_url: str | None
    contact: str | None
    is_cancelled: bool
    registration_closed: bool
    series_id: str | None
    venue_place_id: int | None
    is_joined: bool

    @field_serializer("contact")
    def _contact(self, value: str | None, info: SerializationInfo) -> str | None:
        return self._shown_optional(value, info)


class OutageBrief(ApiModel):
    number: str
    resource: OutageResource
    buildings_count: int
    complaints_count: int
    started_at: datetime
    planned_end_at: datetime | None
    organization: str | None


class OutageBuildingOut(ApiModel):
    address: str
    lat: float
    lng: float


class IssueBrief(OwnedText):
    stage: IssueStage
    severity: IssueSeverity
    radius_m: int | None
    source: InfoSource
    outage: OutageBrief | None


class IssueDetail(IssueBrief):
    detected_at: datetime
    resolved_at: datetime | None
    official_note: str | None
    expected_fix_at: datetime | None
    appeal_number: str | None
    responsible_org: str | None
    outage_buildings: list[OutageBuildingOut]

    @field_serializer("official_note")
    def _official_note(self, value: str | None, info: SerializationInfo) -> str | None:
        return self._shown_optional(value, info)


class PlaceBase(OwnedText):
    """Free texts are the author's; masked for everyone else (SPEC §24.5)."""

    id: int
    layer: Layer
    category_id: int
    title: str
    lat: float
    lng: float
    address: str | None
    status: PlaceStatus
    trust_score: int
    cover_url: str | None
    cover_credit: PhotoCredit | None
    cover_source: CoverSource | None = None
    tags: list[str]
    rating_avg: float | None
    rating_count: int
    combined_rating: CombinedRating | None
    author_id: int
    created_at: datetime
    last_confirmed_at: datetime | None
    is_stale: bool
    external: ExternalSource | None
    area: AreaRef | None

    @model_validator(mode="after")
    def _own_texts(self) -> Self:
        self._own(self.author_id, getattr(self, "event", None), getattr(self, "issue", None))
        return self

    @field_serializer("title")
    def _title(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)

    @field_serializer("address")
    def _address(self, value: str | None, info: SerializationInfo) -> str | None:
        return self._shown_optional(value, info)

    @field_serializer("tags")
    def _tags(self, value: list[str], info: SerializationInfo) -> list[str]:
        return self._shown_list(value, info)


class PlaceCard(PlaceBase):
    event: EventBrief | None
    issue: IssueBrief | None


class MyVote(ApiModel):
    kind: VoteKind
    created_at: datetime


class VerificationSummary(ApiModel):
    present: int
    absent: int
    unclear: int
    my_vote: MyVote | None


class PlaceDetail(PlaceBase):
    description: str
    description_credit: TextCredit | None
    tips: str | None
    attributes: dict[str, AttributeValue]
    category: CategoryOut
    photos: list[PhotoOut]
    author: UserBrief
    updated_at: datetime
    verification: VerificationSummary
    my_rating: int | None
    is_favorite: bool
    can_edit: bool
    can_appeal: bool
    moderation_note: str | None
    screening_hold: ScreeningHold | None
    object_id: str | None
    external_rating: ExternalRating | None
    comments_count: int
    event: EventDetail | None
    issue: IssueDetail | None
    topics: list[Topic]

    @field_serializer("description")
    def _description(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)

    @field_serializer("tips", "moderation_note")
    def _optional_texts(self, value: str | None, info: SerializationInfo) -> str | None:
        return self._shown_optional(value, info)

    @field_serializer("attributes")
    def _attributes(
        self, value: dict[str, AttributeValue], info: SerializationInfo
    ) -> dict[str, AttributeValue]:
        return {
            key: self._shown(item, info) if isinstance(item, str) else item for key, item in value.items()
        }


class HistoryEntry(OwnedText):
    id: int
    kind: HistoryKind
    message: str
    actor: UserBrief | None
    old_status: PlaceStatus | None
    new_status: PlaceStatus | None
    created_at: datetime

    @field_serializer("message")
    def _message(self, value: str, info: SerializationInfo) -> str:
        return self._shown(value, info)


class RepeatInput(ApiModel):
    interval_days: int = Field(ge=1, le=30)
    count: int = Field(ge=2, le=12)


class EventFields(ApiModel):
    capacity: int | None = Field(default=None, ge=1, le=100_000)
    price: int | None = Field(default=0, ge=0, le=1_000_000)
    price_note: ShortText | None = None
    age_limit: int | None = Field(default=None, ge=0, le=21)
    registration_url: Url | None = None
    contact: ShortText | None = None
    is_meetup: bool = False
    venue_place_id: int | None = None


class EventInput(EventFields):
    starts_at: UtcDatetime
    ends_at: UtcDatetime
    repeat: RepeatInput | None = None

    @model_validator(mode="after")
    def _ends_after_start(self) -> Self:
        if self.ends_at <= self.starts_at:
            raise ValueError("Окончание события должно быть позже начала")
        return self


class EventUpdate(EventFields):
    starts_at: UtcDatetime | None = None
    ends_at: UtcDatetime | None = None
    is_cancelled: bool | None = None
    registration_closed: bool | None = None


class EventJoinInput(ApiModel):
    note: (
        Annotated[
            str,
            StringConstraints(strip_whitespace=True, min_length=1, max_length=event_formats.NOTE_MAX_LENGTH),
        ]
        | None
    ) = None
    """Swap only: what the participant brings, posted as a comment in the discussion."""


class IssueInput(ApiModel):
    severity: IssueSeverity | None = None
    detected_at: UtcDatetime | None = None
    radius_m: int | None = Field(default=None, ge=50, le=5000)


def normalize_tags(tags: list[str]) -> list[str]:
    normalized: list[str] = []
    for tag in tags:
        cleaned = tag.strip().lower().lstrip("#")
        if not cleaned:
            continue
        if len(cleaned) > MAX_TAG_LENGTH:
            raise ValueError(f"Тег не длиннее {MAX_TAG_LENGTH} символов")
        if cleaned not in normalized:
            normalized.append(cleaned)
    if len(normalized) > MAX_TAGS:
        raise ValueError(f"Не больше {MAX_TAGS} тегов")
    return normalized


class PlaceInput(ApiModel):
    layer: Layer
    category_id: int
    title: Title
    description: LongText = ""
    lat: Latitude
    lng: Longitude
    address: Address | None = None
    object_id: ObjectId | None = None
    attributes: dict[str, AttributeValue | None] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    tips: MediumText | None = None
    photo_ids: PhotoIds = Field(default_factory=list)
    area_id: int | None = None
    """Omitted: chosen automatically by position. Null: explicitly none."""
    event: EventInput | None = None
    issue: IssueInput | None = None

    _tags = field_validator("tags")(normalize_tags)

    @model_validator(mode="after")
    def _extension_matches_layer(self) -> Self:
        if self.layer is Layer.EVENT and self.event is None:
            raise ValueError("Для события укажите дату и время проведения")
        if self.layer is not Layer.EVENT and self.event is not None:
            raise ValueError("Параметры события доступны только в слое событий")
        if self.layer is not Layer.ISSUE and self.issue is not None:
            raise ValueError("Параметры проблемы доступны только в слое проблем")
        return self


class PlaceUpdate(ApiModel):
    category_id: int | None = None
    title: Title | None = None
    description: LongText | None = None
    lat: Latitude | None = None
    lng: Longitude | None = None
    address: Address | None = None
    object_id: ObjectId | None = None
    attributes: dict[str, AttributeValue | None] | None = None
    tags: list[str] | None = None
    tips: MediumText | None = None
    photo_ids: Annotated[list[int], Field(max_length=12)] | None = None
    area_id: int | None = None
    event: EventUpdate | None = None
    issue: IssueInput | None = None

    @field_validator("tags")
    @classmethod
    def _tags(cls, tags: list[str] | None) -> list[str] | None:
        return None if tags is None else normalize_tags(tags)


class VoteIn(ApiModel):
    kind: VoteKind
    comment: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None
    lat: Latitude | None = None
    lng: Longitude | None = None


class PhotoIdsIn(ApiModel):
    photo_ids: Annotated[list[int], Field(min_length=1, max_length=12)]


class AppealIn(ApiModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=2000)]


class AppealOut(ApiModel):
    case_id: int


class OfficialInfoIn(ApiModel):
    stage: IssueStage | None = None
    official_note: MediumText | None = None
    expected_fix_at: UtcDatetime | None = None
    appeal_number: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] | None = None
    responsible_org: Annotated[str, StringConstraints(strip_whitespace=True, max_length=160)] | None = None


class PlacePage(ApiModel):
    """A page of the «Карта» list (SPEC §17): `total` matches city-wide, `in_view` of them in the
    current map view — those come first."""

    total: int
    in_view: int
    items: list[PlaceCard]
