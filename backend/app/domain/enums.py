"""Enumerations shared by every layer of the application (mirrors docs/API.md)."""

from enum import StrEnum


class Layer(StrEnum):
    INFRASTRUCTURE = "infrastructure"
    EVENT = "event"
    TOURISM = "tourism"
    ISSUE = "issue"


class PlaceStatus(StrEnum):
    PENDING = "pending"
    UNVERIFIED = "unverified"
    PRELIMINARY = "preliminary"
    VERIFIED = "verified"
    NEEDS_REVIEW = "needs_review"
    HIDDEN = "hidden"
    ARCHIVED = "archived"


PUBLIC_STATUSES: tuple[PlaceStatus, ...] = (
    PlaceStatus.UNVERIFIED,
    PlaceStatus.PRELIMINARY,
    PlaceStatus.VERIFIED,
    PlaceStatus.NEEDS_REVIEW,
)
"""Statuses shown on the map to everyone."""

LOCKED_STATUSES: tuple[PlaceStatus, ...] = (
    PlaceStatus.PENDING,
    PlaceStatus.HIDDEN,
    PlaceStatus.ARCHIVED,
)
"""Statuses that automatic derivation never overrides (moderators / lifecycle only)."""


class AreaKind(StrEnum):
    PARK = "park"
    EMBANKMENT = "embankment"
    SQUARE = "square"
    BEACH = "beach"
    ISLAND = "island"
    VIEWPOINT = "viewpoint"
    CAMPUS = "campus"
    QUARTER = "quarter"
    COMPLEX = "complex"
    OTHER = "other"


class VoteKind(StrEnum):
    PRESENT = "present"
    ABSENT = "absent"
    UNCLEAR = "unclear"


class UserLevel(StrEnum):
    NEWCOMER = "newcomer"
    RESIDENT = "resident"
    TRUSTED = "trusted"
    EXPERT = "expert"


class UserRole(StrEnum):
    USER = "user"
    MODERATOR = "moderator"
    ADMIN = "admin"


class EventPhase(StrEnum):
    OPEN = "open"
    CLOSED = "closed"
    SOON = "soon"
    ONGOING = "ongoing"
    FINISHED = "finished"
    CANCELLED = "cancelled"


class IssueStage(StrEnum):
    DETECTED = "detected"
    CONFIRMED = "confirmed"
    FORWARDED = "forwarded"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"


class IssueSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class InfoSource(StrEnum):
    USER = "user"
    OFFICIAL = "official"


class RouteKind(StrEnum):
    WALK = "walk"
    CAR = "car"
    BIKE = "bike"
    HIKE = "hike"
    EXCURSION = "excursion"


class RouteVisibility(StrEnum):
    PRIVATE = "private"
    PUBLIC = "public"


class RouteDifficulty(StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class PathMode(StrEnum):
    ROADS = "roads"
    DIRECT = "direct"


class StopKind(StrEnum):
    POI = "poi"
    VIEWPOINT = "viewpoint"
    LANDMARK = "landmark"
    WATER = "water"
    FOOD = "food"
    REST = "rest"
    CAMP = "camp"
    TRANSPORT = "transport"
    DANGER = "danger"
    VIA = "via"


class ExternalSourceId(StrEnum):
    VL_RU = "vl_ru"
    VL_RU_OFF = "vl_ru_off"
    OSM = "osm"
    WIKIVOYAGE = "wikivoyage"


class OutageResource(StrEnum):
    COLD_WATER = "cold_water"
    HOT_WATER = "hot_water"
    HEAT = "heat"
    ELECTRICITY = "electricity"


class RouteStatus(StrEnum):
    PENDING = "pending"
    PUBLISHED = "published"
    NEEDS_REVIEW = "needs_review"
    HIDDEN = "hidden"


PUBLIC_ROUTE_STATUSES: tuple[RouteStatus, ...] = (RouteStatus.PUBLISHED, RouteStatus.NEEDS_REVIEW)


class ComplaintReason(StrEnum):
    INACCURATE = "inaccurate"
    DUPLICATE = "duplicate"
    OUTDATED = "outdated"
    SPAM = "spam"
    OFFENSIVE = "offensive"
    RULES = "rules"
    FRAUD = "fraud"
    IMPASSABLE = "impassable"


class ComplaintState(StrEnum):
    OPEN = "open"
    UPHELD = "upheld"
    DISMISSED = "dismissed"
    CLOSED = "closed"


class TargetType(StrEnum):
    PLACE = "place"
    ROUTE = "route"


class ModerationTrigger(StrEnum):
    PREMODERATION = "premoderation"
    COMPLAINTS = "complaints"
    ABSENT_VOTES = "absent_votes"
    AUTO_TEXT = "auto_text"
    AUTO_IMAGE = "auto_image"
    AUTO_AI = "auto_ai"
    APPEAL = "appeal"
    CLARIFICATION = "clarification"
    """A resident voted «требует уточнения» and wrote what is wrong (SPEC §3.1)."""


class ModerationAction(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_CHANGES = "request_changes"
    HIDE = "hide"
    RESTORE = "restore"
    RELEASE = "release"
    """A held photo, comment, review or note is shown after all (SPEC §24.1); log entries only."""
    REMOVE = "remove"
    """A held photo, comment, review or note is taken down; log entries only."""


class CaseState(StrEnum):
    OPEN = "open"
    RESOLVED = "resolved"


class NotificationKind(StrEnum):
    EVENT_JOINED = "event_joined"
    EVENT_CHANGED = "event_changed"
    EVENT_CANCELLED = "event_cancelled"
    COMMENT = "comment"
    RESPECT = "respect"
    MODERATION = "moderation"
    PLACE_VERIFIED = "place_verified"
    LEVEL_UP = "level_up"
    ISSUE_UPDATE = "issue_update"
    TERRITORY = "territory"


class HistoryKind(StrEnum):
    CREATED = "created"
    EDITED = "edited"
    STATUS_CHANGED = "status_changed"
    MODERATION = "moderation"
    ISSUE_STAGE = "issue_stage"
    OFFICIAL_INFO = "official_info"
    PHOTOS_ADDED = "photos_added"


class ReputationReason(StrEnum):
    VOTE_CAST = "vote_cast"
    PLACE_VERIFIED = "place_verified"
    PLACE_PRELIMINARY = "place_preliminary"
    ISSUE_RESOLVED = "issue_resolved"
    ROUTE_PUBLISHED = "route_published"
    REVIEW_WRITTEN = "review_written"
    RESPECT_RECEIVED = "respect_received"
    COMPLAINT_UPHELD = "complaint_upheld"
    COMPLAINT_DISMISSED = "complaint_dismissed"
    CONTENT_REJECTED = "content_rejected"
    PLACE_HIDDEN_AUTO = "place_hidden_auto"
    MODERATION_APPROVED = "moderation_approved"


class AiVerdict(StrEnum):
    OK = "ok"
    SUSPICIOUS = "suspicious"
    VIOLATION = "violation"


class AiCategory(StrEnum):
    SPAM = "spam"
    ADS = "ads"
    OFFENSIVE = "offensive"
    PERSONAL_DATA = "personal_data"
    FRAUD = "fraud"
    OFF_TOPIC = "off_topic"
    NONSENSE = "nonsense"
    DANGEROUS = "dangerous"
    INAPPROPRIATE_IMAGE = "inappropriate_image"
    """Old combined reviews only; photos are now checked one by one with the categories below."""
    NUDITY = "nudity"
    SEXUAL = "sexual"
    VIOLENCE = "violence"
    SHOCKING = "shocking"
    OBSCENE = "obscene"
    ADVERTISING = "advertising"
    NOT_A_PLACE = "not_a_place"
    """A selfie, a portrait, a meme or a screenshot instead of a photo of the place."""


class AiTarget(StrEnum):
    """Everything that is screened before others see it (SPEC §14, §24) and can carry a case."""

    PLACE = "place"
    ROUTE = "route"
    NOTE = "note"
    COMMENT = "comment"
    REVIEW = "review"
    PHOTO = "photo"


class HoldState(StrEnum):
    """Lifecycle of a screening hold (SPEC §24.1; table `quiet_holds`, a historical name)."""

    SCREENING = "screening"
    HELD = "held"
    RELEASED = "released"
    DECIDED = "decided"
    """A moderator confirmed the hold (reject, hide, request changes, removal)."""


ACTIVE_HOLD_STATES: tuple[HoldState, ...] = (HoldState.SCREENING, HoldState.HELD)
"""States in which the item is invisible to everyone but its author and moderators."""


class HoldSource(StrEnum):
    HEURISTIC = "heuristic"
    AI = "ai"
    STANDING = "standing"


class StandingReason(StrEnum):
    """Changes of the hidden author standing (SPEC §24.4)."""

    PASSED = "passed"
    USEFUL = "useful"
    HELD = "held"
    CONFIRMED = "confirmed"
    RELEASED = "released"


class FieldType(StrEnum):
    BOOLEAN = "boolean"
    NUMBER = "number"
    TEXT = "text"
    SELECT = "select"


class PathSource(StrEnum):
    OSM = "osm"
    TWOGIS = "2gis"
    STRAIGHT = "straight"
