from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.enums import (
    PathMode,
    PathSource,
    RouteDifficulty,
    RouteKind,
    RouteStatus,
    RouteVisibility,
    StopKind,
)
from app.models.base import Base, UTCDateTime, enum_type

if TYPE_CHECKING:
    from app.models.place import Photo, Place
    from app.models.user import User


class Route(Base):
    """An author route: ordered custom waypoints plus the path computed once at save time."""

    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    tips: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    search_text: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[RouteKind] = mapped_column(enum_type(RouteKind))
    difficulty: Mapped[RouteDifficulty | None] = mapped_column(enum_type(RouteDifficulty))
    visibility: Mapped[RouteVisibility] = mapped_column(enum_type(RouteVisibility), index=True)
    status: Mapped[RouteStatus] = mapped_column(enum_type(RouteStatus), index=True)
    path_mode: Mapped[PathMode] = mapped_column(enum_type(PathMode))
    distance_m: Mapped[int]
    travel_min: Mapped[int]
    duration_min: Mapped[int]
    path: Mapped[list[list[float]]] = mapped_column(JSON)
    path_source: Mapped[PathSource] = mapped_column(enum_type(PathSource))
    rating_avg: Mapped[float | None]
    rating_count: Mapped[int] = mapped_column(default=0)
    saves_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)

    author: Mapped[User] = relationship(lazy="raise")
    stops: Mapped[list[RouteStop]] = relationship(
        lazy="raise", order_by="RouteStop.position", cascade="all, delete-orphan"
    )


class RouteStop(Base):
    """A waypoint with its own title and coordinates, optionally linked to a map place.

    `via` stops are invisible shaping points of the track.
    """

    __tablename__ = "route_stops"
    __table_args__ = (UniqueConstraint("route_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    place_id: Mapped[int | None] = mapped_column(ForeignKey("places.id"), index=True)
    position: Mapped[int]
    kind: Mapped[StopKind] = mapped_column(enum_type(StopKind), default=StopKind.POI)
    title: Mapped[str] = mapped_column(String(120), default="")
    lat: Mapped[float]
    lng: Mapped[float]
    note: Mapped[str] = mapped_column(Text, default="")
    landmark: Mapped[str] = mapped_column(String(500), default="")
    stay_min: Mapped[int] = mapped_column(default=0)
    distance_from_prev_m: Mapped[int | None]

    place: Mapped[Place | None] = relationship(lazy="raise")
    photos: Mapped[list[Photo]] = relationship(lazy="raise", order_by="Photo.position")


class RouteSave(Base):
    __tablename__ = "route_saves"
    __table_args__ = (UniqueConstraint("user_id", "route_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
