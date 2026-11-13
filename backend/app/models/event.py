from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.place import Place
    from app.models.user import User


class EventDetails(Base):
    """1:1 extension of a place on the `event` layer."""

    __tablename__ = "event_details"

    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), primary_key=True)
    starts_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    ends_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    capacity: Mapped[int | None]
    price: Mapped[int | None]
    """Roubles; 0 is free, None is unknown (imported events)."""
    price_note: Mapped[str | None] = mapped_column(String(200))
    age_limit: Mapped[int | None]
    registration_url: Mapped[str | None] = mapped_column(String(300))
    contact: Mapped[str | None] = mapped_column(String(200))
    is_meetup: Mapped[bool] = mapped_column(default=False)
    is_cancelled: Mapped[bool] = mapped_column(default=False)
    registration_closed: Mapped[bool] = mapped_column(default=False)
    series_id: Mapped[str | None] = mapped_column(String(32), index=True)
    venue_place_id: Mapped[int | None] = mapped_column(ForeignKey("places.id"))
    participants_count: Mapped[int] = mapped_column(default=0)

    place: Mapped[Place] = relationship(lazy="raise", back_populates="event", foreign_keys=[place_id])


class EventParticipant(Base):
    __tablename__ = "event_participants"
    __table_args__ = (UniqueConstraint("place_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)

    user: Mapped[User] = relationship(lazy="raise")
