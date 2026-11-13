from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UTCDateTime

if TYPE_CHECKING:
    from app.models.user import User


class MapNote(Base):
    """A short public comment pinned to a 2GIS map object or to bare coordinates (SPEC §13)."""

    __tablename__ = "map_notes"
    __table_args__ = (Index("ix_map_notes_lat_lng", "lat", "lng"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    lat: Mapped[float]
    lng: Mapped[float]
    text: Mapped[str] = mapped_column(String(500))
    object_id: Mapped[str | None] = mapped_column(String(64), index=True)
    object_name: Mapped[str | None] = mapped_column(String(200))
    is_hidden: Mapped[bool] = mapped_column(default=False)
    """Set by three distinct reports or by the automatic pre-screening."""
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)

    author: Mapped[User] = relationship(lazy="raise")


class NoteReport(Base):
    __tablename__ = "note_reports"
    __table_args__ = (UniqueConstraint("note_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("map_notes.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
