"""Interests (SPEC §23): topics of places and areas, and the private interest profile of a person.

New tables only, so that existing databases gain them with `create_all` alone; nothing here is
referenced from the existing tables.
"""

from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.interests import InterestTarget, TagBasis, TagMethod, Topic
from app.models.base import Base, UTCDateTime, enum_type


class InterestTag(Base):
    """One topic of a place or an area with its weight 0..1 and where it came from.

    An object may carry the same topic from several bases; the strongest one counts.
    """

    __tablename__ = "interest_tags"
    __table_args__ = (
        UniqueConstraint("target_type", "target_id", "topic", "basis"),
        Index("ix_interest_tags_topic_target", "topic", "target_type", "target_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    target_type: Mapped[InterestTarget] = mapped_column(enum_type(InterestTarget))
    target_id: Mapped[int]
    topic: Mapped[Topic] = mapped_column(enum_type(Topic))
    weight: Mapped[float]
    method: Mapped[TagMethod] = mapped_column(enum_type(TagMethod))
    basis: Mapped[TagBasis] = mapped_column(enum_type(TagBasis))


class InterestTagState(Base):
    """What text of an object was classified and how far: an edited object is classified again,
    an unchanged one never twice."""

    __tablename__ = "interest_tag_states"
    __table_args__ = (UniqueConstraint("target_type", "target_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    target_type: Mapped[InterestTarget] = mapped_column(enum_type(InterestTarget))
    target_id: Mapped[int]
    fingerprint: Mapped[str] = mapped_column(String(40))
    method: Mapped[TagMethod] = mapped_column(enum_type(TagMethod), index=True)
    rules_version: Mapped[int] = mapped_column(default=0)
    llm_attempts: Mapped[int] = mapped_column(default=0)
    """Requests that carried the object without an answer for it; the classifier gives up at a few."""
    classified_at: Mapped[datetime] = mapped_column(UTCDateTime)


class UserInterest(Base):
    """A topic of a person's profile: chosen by them and/or learned from what they do.

    Private: never shown to anyone else. Only the resulting numbers are kept, never the text of a
    search or the objects behind the affinity.
    """

    __tablename__ = "user_interests"
    __table_args__ = (UniqueConstraint("user_id", "topic"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    topic: Mapped[Topic] = mapped_column(enum_type(Topic))
    chosen: Mapped[bool] = mapped_column(default=False)
    affinity: Mapped[float] = mapped_column(default=0.0)
    searched_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    """Last search that moved this topic: searches count at most once per topic per day."""
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class UserInterestSettings(Base):
    """Whether the «Что вам интересно?» picker was answered (even with nothing chosen)."""

    __tablename__ = "user_interest_settings"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    onboarded_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
