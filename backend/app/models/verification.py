from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.enums import VoteKind
from app.models.base import Base, UTCDateTime, enum_type


class Vote(Base):
    """The single active verification vote of a user on a place."""

    __tablename__ = "votes"
    __table_args__ = (UniqueConstraint("place_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[VoteKind] = mapped_column(enum_type(VoteKind))
    is_near: Mapped[bool] = mapped_column(default=False)
    """Geo-confirmed: the voter was physically within 300 m of the place."""
    weight: Mapped[float]
    """Voter weight frozen at cast time: level, account age, proximity bonus and locality factor.
    Time decay is applied on read."""
    comment: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
