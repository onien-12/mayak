from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.lost_found import LostCategory, LostKind, MatchVerdict, ResponseState
from app.models.base import Base, UTCDateTime, enum_type

if TYPE_CHECKING:
    from app.models.user import User


class LostItem(Base):
    """A post of «Потеряшки» (SPEC §26): a thing someone lost or found, and where.

    Its state (active, returned, expired) is computed from `closed_at` and `created_at` on read.
    """

    __tablename__ = "lost_items"
    __table_args__ = (Index("ix_lost_items_lat_lng", "lat", "lng"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[LostKind] = mapped_column(enum_type(LostKind), index=True)
    category: Mapped[LostCategory] = mapped_column(enum_type(LostCategory))
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    lat: Mapped[float]
    lng: Mapped[float]
    radius_m: Mapped[int | None]
    """Lost posts only: how sure the owner is about the place; None — «не знаю где»."""
    happened_on: Mapped[date] = mapped_column(Date)
    control_question: Mapped[str | None] = mapped_column(String(200))
    """Found posts only: what a claimant must answer; the finder judges the answer."""
    is_hidden: Mapped[bool] = mapped_column(default=False)
    """Screened or held (SPEC §24.1), three distinct reports, or a moderator."""
    hidden_by_moderator: Mapped[bool] = mapped_column(default=False)
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)

    author: Mapped[User] = relationship(lazy="raise")


class LostItemPhoto(Base):
    """An own upload attached to a post (the photo row itself stays free of any place)."""

    __tablename__ = "lost_item_photos"
    __table_args__ = (UniqueConstraint("photo_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("lost_items.id"), index=True)
    photo_id: Mapped[int] = mapped_column(ForeignKey("photos.id"))
    position: Mapped[int] = mapped_column(default=0)


class LostResponse(Base):
    """«Это моё» / «Я нашёл это»: seen only by the post's author and the one who responded.

    Contacts are exchanged only once the author accepts: then both see each other's line.
    """

    __tablename__ = "lost_responses"
    __table_args__ = (UniqueConstraint("item_id", "author_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("lost_items.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    message: Mapped[str] = mapped_column(String(1000))
    contact: Mapped[str] = mapped_column(String(200))
    state: Mapped[ResponseState] = mapped_column(enum_type(ResponseState), default=ResponseState.PENDING)
    owner_contact: Mapped[str | None] = mapped_column(String(200))
    """The post author's contact, given when accepting."""
    is_hidden: Mapped[bool] = mapped_column(default=False)
    """Screened or held (SPEC §24.1): the post's author does not see it yet."""
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    decided_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    author: Mapped[User] = relationship(lazy="raise")


class LostMatch(Base):
    """A shortlisted lost/found pair: the model judges it once, its authors are told once."""

    __tablename__ = "lost_matches"
    __table_args__ = (UniqueConstraint("lost_id", "found_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    lost_id: Mapped[int] = mapped_column(ForeignKey("lost_items.id"), index=True)
    found_id: Mapped[int] = mapped_column(ForeignKey("lost_items.id"), index=True)
    verdict: Mapped[MatchVerdict | None] = mapped_column(enum_type(MatchVerdict))
    judge_attempts: Mapped[int] = mapped_column(default=0)
    judged_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    notified_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class LostItemReport(Base):
    __tablename__ = "lost_item_reports"
    __table_args__ = (UniqueConstraint("item_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("lost_items.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
