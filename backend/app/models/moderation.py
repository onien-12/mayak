from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.enums import (
    AiTarget,
    CaseState,
    ComplaintReason,
    ComplaintState,
    Layer,
    ModerationAction,
    TargetType,
)
from app.models.base import Base, UTCDateTime, enum_type

if TYPE_CHECKING:
    from app.models.user import User


class Complaint(Base):
    __tablename__ = "complaints"
    __table_args__ = (Index("ix_complaints_target", "target_type", "target_id", "state"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    target_type: Mapped[TargetType] = mapped_column(enum_type(TargetType))
    target_id: Mapped[int]
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    reason: Mapped[ComplaintReason] = mapped_column(enum_type(ComplaintReason))
    comment: Mapped[str] = mapped_column(Text, default="")
    weight: Mapped[float]
    state: Mapped[ComplaintState] = mapped_column(enum_type(ComplaintState), default=ComplaintState.OPEN)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("moderation_cases.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    author: Mapped[User] = relationship(lazy="raise")


class ModerationCase(Base):
    """One open case per target. Title, layer and author are snapshots so the queue needs no joins.

    Places and routes are the queue; held photos, comments, reviews and notes get cases of their
    own (SPEC §24.1) that are listed apart.
    """

    __tablename__ = "moderation_cases"
    __table_args__ = (Index("ix_moderation_cases_target", "target_type", "target_id", "state"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    target_type: Mapped[AiTarget] = mapped_column(enum_type(AiTarget))
    target_id: Mapped[int]
    target_title: Mapped[str] = mapped_column(String(120))
    layer: Mapped[Layer | None] = mapped_column(enum_type(Layer))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    triggers: Mapped[list[str]] = mapped_column(JSON, default=list)
    flags: Mapped[list[str]] = mapped_column(JSON, default=list)
    appeal_text: Mapped[str | None] = mapped_column(Text)
    appealed: Mapped[bool] = mapped_column(default=False)
    """Set on a resolved case once its decision has been appealed (one appeal per decision)."""
    risk: Mapped[int] = mapped_column(default=0)
    complaints_count: Mapped[int] = mapped_column(default=0)
    state: Mapped[CaseState] = mapped_column(enum_type(CaseState), default=CaseState.OPEN, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    resolution_action: Mapped[ModerationAction | None] = mapped_column(enum_type(ModerationAction))
    resolution_reason: Mapped[str | None] = mapped_column(Text)
    moderator_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    author: Mapped[User] = relationship(lazy="raise", foreign_keys=[author_id])
    moderator: Mapped[User | None] = relationship(lazy="raise", foreign_keys=[moderator_id])


class ModerationLog(Base):
    """Immutable audit trail of moderator decisions; rows are only ever inserted."""

    __tablename__ = "moderation_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("moderation_cases.id"), index=True)
    moderator_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[ModerationAction] = mapped_column(enum_type(ModerationAction))
    reason: Mapped[str] = mapped_column(Text)
    target_type: Mapped[AiTarget] = mapped_column(enum_type(AiTarget))
    target_id: Mapped[int]
    target_title: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)

    moderator: Mapped[User] = relationship(lazy="raise")
