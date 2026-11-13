from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.enums import AreaKind, ExternalSourceId
from app.models.base import Base, UTCDateTime, enum_type

if TYPE_CHECKING:
    from app.models.user import User


class Area(Base):
    """A named location with an exact polygon; concrete places live inside it (SPEC §17).

    Everything from `places_count` down is denormalised and refreshed by `services.areas`
    whenever a place inside changes, so listing areas is a single query.
    """

    __tablename__ = "areas"
    __table_args__ = (Index("ix_areas_bbox", "min_lat", "max_lat", "min_lng", "max_lng"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(80))
    search_text: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[AreaKind] = mapped_column(enum_type(AreaKind), index=True)
    geometry: Mapped[dict[str, Any]] = mapped_column(JSON)
    """GeoJSON Polygon / MultiPolygon, positions `[lng, lat]`, simplified for transfer."""
    lat: Mapped[float]
    lng: Mapped[float]
    """Label point, guaranteed to lie inside the territory."""
    radius_m: Mapped[int]
    """Bounding radius around the label point."""
    area_m2: Mapped[float]
    min_lat: Mapped[float]
    max_lat: Mapped[float]
    min_lng: Mapped[float]
    max_lng: Mapped[float]
    """Bounding box: the cheap pre-filter before exact point-in-polygon checks."""
    description: Mapped[str] = mapped_column(Text, default="")
    object_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    external_source: Mapped[ExternalSourceId | None] = mapped_column(enum_type(ExternalSourceId))
    external_id: Mapped[str | None] = mapped_column(String(80), unique=True)
    external_url: Mapped[str | None] = mapped_column(String(500))
    """Territories imported from OpenStreetMap keep their origin for the ODbL credit."""
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)

    places_count: Mapped[int] = mapped_column(default=0)
    interest: Mapped[int] = mapped_column(default=0, index=True)
    rating_avg: Mapped[float | None]
    highlights: Mapped[list[dict[str, int]]] = mapped_column(JSON, default=list)
    events_upcoming: Mapped[int] = mapped_column(default=0)
    issues_open: Mapped[int] = mapped_column(default=0)
    cover_url: Mapped[str | None] = mapped_column(String(1000))
    cover_credit: Mapped[dict[str, str] | None] = mapped_column(JSON)

    author: Mapped[User | None] = relationship(lazy="raise")
