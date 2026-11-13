from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.user import User


class Review(Base):
    """A 1..5 rating with text, left either on a place or on a route."""

    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("author_id", "place_id"),
        UniqueConstraint("author_id", "route_id"),
        CheckConstraint("(place_id IS NULL) != (route_id IS NULL)", name="single_target"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    place_id: Mapped[int | None] = mapped_column(ForeignKey("places.id"), index=True)
    route_id: Mapped[int | None] = mapped_column(ForeignKey("routes.id"), index=True)
    rating: Mapped[int]
    text: Mapped[str] = mapped_column(Text, default="")
    is_hidden: Mapped[bool] = mapped_column(default=False)
    """Soft-hidden by the automatic pre-screening; excluded from lists and ratings."""
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)

    author: Mapped[User] = relationship(lazy="raise")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    text: Mapped[str] = mapped_column(Text)
    is_hidden: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)

    author: Mapped[User] = relationship(lazy="raise")
