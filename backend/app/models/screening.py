"""Screening before anyone sees it (SPEC §24): holds, hidden usefulness and author standing.

New tables only: an existing database gains them at start-up and nothing else changes.
"""

from datetime import datetime

from sqlalchemy import JSON, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.enums import AiTarget, HoldSource, HoldState, StandingReason
from app.models.base import Base, UTCDateTime, enum_type


class QuietHold(Base):
    """One row per screened item: its window, its hold and how it ended.

    While `state` is screening or held the item is invisible to everyone but its author and
    moderators; places and routes are kept `pending` for that. During the screening window
    `shown_status` is what the author sees; once held they see `pending` and the reasons. A photo
    screened together with its place or route names it as parent: the parent's check decides for
    both. The table name is historical: holds are no longer kept from their authors.
    """

    __tablename__ = "quiet_holds"
    __table_args__ = (
        UniqueConstraint("target_type", "target_id"),
        Index("ix_quiet_holds_parent", "parent_type", "parent_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    target_type: Mapped[AiTarget] = mapped_column(enum_type(AiTarget))
    target_id: Mapped[int]
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    state: Mapped[HoldState] = mapped_column(enum_type(HoldState), index=True)
    source: Mapped[HoldSource | None] = mapped_column(enum_type(HoldSource))
    reasons: Mapped[list[str]] = mapped_column(JSON, default=list)
    """Human-readable lines for moderators; the author reads `hold_reasons.for_author` of them."""
    shown_status: Mapped[str | None] = mapped_column(String(32))
    """Place or route status the item gets back when released: what its author sees during the
    screening window."""
    parent_type: Mapped[AiTarget | None] = mapped_column(enum_type(AiTarget))
    parent_id: Mapped[int | None]
    announce: Mapped[bool] = mapped_column(default=False)
    """A new place: tell territory subscribers once it is released."""
    penalized: Mapped[bool] = mapped_column(default=False)
    """The author's standing lost points for this hold and the author was told; a release
    returns the points."""
    revision: Mapped[int] = mapped_column(default=1)
    """Bumped by every new window, so a check of an older version never decides."""
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)
    decided_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class PlaceQuality(Base):
    """Hidden usefulness of a place (SPEC §24.3): never part of any public schema."""

    __tablename__ = "place_quality"

    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), primary_key=True)
    usefulness: Mapped[int]
    model: Mapped[str] = mapped_column(String(120))
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class AuthorStanding(Base):
    """Hidden standing of an author (SPEC §24.4); absent row = the starting score."""

    __tablename__ = "author_standing"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    score: Mapped[int]
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class StandingEvent(Base):
    """Audit log of standing changes; rows are only ever inserted."""

    __tablename__ = "author_standing_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    delta: Mapped[int]
    score: Mapped[int]
    """The score after the change."""
    reason: Mapped[StandingReason] = mapped_column(enum_type(StandingReason))
    target_type: Mapped[AiTarget | None] = mapped_column(enum_type(AiTarget))
    target_id: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
