from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.enums import ExternalSourceId, HistoryKind, Layer, PlaceStatus
from app.models.base import Base, UTCDateTime, enum_type

if TYPE_CHECKING:
    from app.models.area import Area
    from app.models.catalog import Category
    from app.models.event import EventDetails
    from app.models.issue import IssueDetails
    from app.models.user import User


class Place(Base):
    """Everything shown on the map. Counters and scores are denormalised and kept by services."""

    __tablename__ = "places"
    __table_args__ = (
        Index("ix_places_layer_status", "layer", "status"),
        Index("ix_places_lat_lng", "lat", "lng"),
        Index("ix_places_trust_score", "trust_score"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    layer: Mapped[Layer] = mapped_column(enum_type(Layer))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    area_id: Mapped[int | None] = mapped_column(ForeignKey("areas.id"), index=True)
    area_pinned: Mapped[bool] = mapped_column(default=False)
    """The author chose the area (or "none") explicitly: automatic re-attachment skips the place."""
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    tips: Mapped[str | None] = mapped_column(Text)
    lat: Mapped[float]
    lng: Mapped[float]
    address: Mapped[str | None] = mapped_column(String(200))
    object_id: Mapped[str | None] = mapped_column(String(64), index=True)
    """The 2GIS map object this place is (tapped on the map), if any (SPEC §19)."""
    attributes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    search_text: Mapped[str] = mapped_column(Text, default="")
    """Case-folded title, description, address and tags (SQLite cannot case-fold Cyrillic)."""
    title_key: Mapped[str] = mapped_column(String(120), default="", index=True)
    """Normalised title used by the duplicate check."""

    status: Mapped[PlaceStatus] = mapped_column(enum_type(PlaceStatus))
    trust_score: Mapped[int] = mapped_column(default=0)
    author_prior: Mapped[float]
    """Weight of the author's own word (level weight × 0.5), frozen at creation."""
    author_local_factor: Mapped[float] = mapped_column(default=1.0)
    """Internal locality multiplier of the author prior (SPEC §16), frozen at creation."""
    last_confirmed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    """Last moderator approval; absent votes cast earlier no longer dispute the place."""

    external_source: Mapped[ExternalSourceId | None] = mapped_column(enum_type(ExternalSourceId))
    external_id: Mapped[str | None] = mapped_column(String(80), unique=True)
    external_url: Mapped[str | None] = mapped_column(String(500))
    external_image_url: Mapped[str | None] = mapped_column(String(500))
    """Hot-linked image of imported content; used as the cover while the place has no photos."""
    locally_edited: Mapped[bool] = mapped_column(default=False)
    """An imported place edited by a moderator is no longer overwritten by re-imports."""

    cover_url: Mapped[str | None] = mapped_column(String(1000))
    cover_credit: Mapped[dict[str, str] | None] = mapped_column(JSON)
    """Credit of the cover when it is a freely licensed external photo (SPEC §19)."""
    rating_avg: Mapped[float | None]
    rating_count: Mapped[int] = mapped_column(default=0)
    comments_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)

    @property
    def effective_author_prior(self) -> float:
        return self.author_prior * self.author_local_factor

    category: Mapped[Category] = relationship(lazy="raise")
    author: Mapped[User] = relationship(lazy="raise")
    area: Mapped[Area | None] = relationship(lazy="raise")
    event: Mapped[EventDetails | None] = relationship(
        lazy="raise",
        back_populates="place",
        cascade="all, delete-orphan",
        foreign_keys="EventDetails.place_id",
    )
    issue: Mapped[IssueDetails | None] = relationship(
        lazy="raise", back_populates="place", cascade="all, delete-orphan"
    )


class Photo(Base):
    """An image of a place, a route stop or an area.

    Either uploaded by a user (free until the uploader attaches it) or a freely licensed photo
    from an external archive: then it has no uploader, carries its credit and is hot-linked.
    """

    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    uploader_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    place_id: Mapped[int | None] = mapped_column(ForeignKey("places.id"), index=True)
    route_stop_id: Mapped[int | None] = mapped_column(ForeignKey("route_stops.id"), index=True)
    area_id: Mapped[int | None] = mapped_column(ForeignKey("areas.id"), index=True)
    position: Mapped[int] = mapped_column(default=0)
    url: Mapped[str] = mapped_column(String(1000))
    width: Mapped[int]
    height: Mapped[int]
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    credit_author: Mapped[str | None] = mapped_column(String(200))
    credit_license: Mapped[str | None] = mapped_column(String(60))
    credit_url: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)

    @property
    def credit(self) -> dict[str, str] | None:
        """Attribution of an external photo; None for the platform's own uploads."""
        if self.credit_license is None or self.credit_url is None:
            return None
        return {
            "author": self.credit_author or "",
            "license": self.credit_license,
            "source_url": self.credit_url,
        }


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "place_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class PlaceHistory(Base):
    __tablename__ = "place_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), index=True)
    kind: Mapped[HistoryKind] = mapped_column(enum_type(HistoryKind))
    message: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    old_status: Mapped[PlaceStatus | None] = mapped_column(enum_type(PlaceStatus))
    new_status: Mapped[PlaceStatus | None] = mapped_column(enum_type(PlaceStatus))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)

    actor: Mapped[User | None] = relationship(lazy="raise")
