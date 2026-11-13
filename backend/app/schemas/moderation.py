from datetime import datetime
from typing import Annotated

from pydantic import StringConstraints

from app.domain.enums import (
    AiCategory,
    AiTarget,
    AiVerdict,
    CaseState,
    ComplaintReason,
    HoldSource,
    HoldState,
    Layer,
    ModerationAction,
    ModerationTrigger,
)
from app.schemas.common import ApiModel
from app.schemas.place import HistoryEntry, PhotoOut, PlaceDetail
from app.schemas.route import RouteDetail
from app.schemas.user import UserBrief


class Resolution(ApiModel):
    action: ModerationAction
    reason: str
    moderator: UserBrief


class ModerationCaseOut(ApiModel):
    id: int
    target_type: AiTarget
    target_id: int
    target_title: str
    layer: Layer | None
    author: UserBrief
    triggers: list[ModerationTrigger]
    risk: int
    complaints_count: int
    state: CaseState
    created_at: datetime
    resolved_at: datetime | None
    ai_verdict: AiVerdict | None
    quiet: bool
    """The target is quietly held (SPEC §24.1): its author does not know and sees it as published."""
    resolution: Resolution | None


class ComplaintItem(ApiModel):
    id: int
    reason: ComplaintReason
    comment: str
    author: UserBrief
    created_at: datetime


class ClarificationItem(ApiModel):
    """An «unclear» vote with what the resident wrote (SPEC §3.1); the original text."""

    id: int
    text: str
    author: UserBrief
    created_at: datetime


class AiReviewOut(ApiModel):
    """Latest advisory opinion of the screening model (SPEC §14, §24)."""

    verdict: AiVerdict
    categories: list[AiCategory]
    confidence: float
    summary: str
    model: str
    created_at: datetime


class QuietHoldOut(ApiModel):
    """The screening window or quiet hold of a case target (SPEC §24.1); moderators only."""

    state: HoldState
    source: HoldSource | None
    reasons: list[str]
    shown_status: str | None
    """What the author sees instead of the real status."""
    created_at: datetime
    updated_at: datetime


class PhotoReview(ApiModel):
    """One photo of the target with its own check (SPEC §24.2)."""

    photo: PhotoOut
    state: HoldState
    reasons: list[str]
    ai_review: AiReviewOut | None


class ModerationCaseDetail(ModerationCaseOut):
    place: PlaceDetail | None
    route: RouteDetail | None
    complaints: list[ComplaintItem]
    clarifications: list[ClarificationItem]
    """What residents asked to clarify about the place, newest first; empty for other targets."""
    flags: list[str]
    ai_review: AiReviewOut | None
    appeal_text: str | None
    history: list[HistoryEntry]
    hold: QuietHoldOut | None
    photo_reviews: list[PhotoReview]
    usefulness: int | None
    """Hidden usefulness of a place, 0..100 (SPEC §24.3); null when never rated."""
    author_standing: int
    """Hidden standing of the author, 0..100 (SPEC §24.4)."""


class HeldOwner(ApiModel):
    id: int
    title: str


class HeldItemOut(ApiModel):
    """A photo, comment, review or note held on its own, waiting for a moderator (SPEC §24.1)."""

    id: int
    kind: AiTarget
    target_id: int
    case_id: int
    author: UserBrief
    author_standing: int
    text: str | None = None
    rating: int | None = None
    object_name: str | None = None
    photo: PhotoOut | None = None
    place: HeldOwner | None = None
    route: HeldOwner | None = None
    reasons: list[str]
    source: HoldSource | None
    ai_review: AiReviewOut | None
    created_at: datetime


class HeldDecisionIn(ApiModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=1000)]


class ModerationLogEntry(ApiModel):
    id: int
    case_id: int
    moderator: UserBrief
    action: ModerationAction
    reason: str
    target_type: AiTarget
    target_id: int
    target_title: str
    created_at: datetime


class ResolveIn(ApiModel):
    action: ModerationAction
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=1000)]


class ModerationSummary(ApiModel):
    open: int
    resolved_today: int
    by_trigger: dict[ModerationTrigger, int]
    held_items: int
    """Photos, comments, reviews and notes held on their own (`GET /moderation/held`)."""
