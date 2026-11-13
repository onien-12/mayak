from datetime import datetime

from sqlalchemy import JSON, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.enums import AiTarget, AiVerdict
from app.models.base import Base, UTCDateTime, enum_type


class AiReview(Base):
    """Advisory opinion of the LLM pre-screening about one piece of content (SPEC §14)."""

    __tablename__ = "ai_reviews"
    __table_args__ = (Index("ix_ai_reviews_target", "target_type", "target_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    target_type: Mapped[AiTarget] = mapped_column(enum_type(AiTarget))
    target_id: Mapped[int]
    verdict: Mapped[AiVerdict] = mapped_column(enum_type(AiVerdict))
    categories: Mapped[list[str]] = mapped_column(JSON, default=list)
    confidence: Mapped[float]
    summary: Mapped[str] = mapped_column(Text, default="")
    model: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
