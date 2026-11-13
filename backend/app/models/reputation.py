from datetime import datetime

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.enums import ReputationReason
from app.models.base import Base, UTCDateTime, enum_type


class ReputationEvent(Base):
    __tablename__ = "reputation_events"
    __table_args__ = (Index("ix_reputation_events_user_reason", "user_id", "reason", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    delta: Mapped[int]
    reason: Mapped[ReputationReason] = mapped_column(enum_type(ReputationReason))
    message: Mapped[str] = mapped_column(String(200))
    place_id: Mapped[int | None] = mapped_column(ForeignKey("places.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
