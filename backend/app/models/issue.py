from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.enums import ExternalSourceId, InfoSource, IssueSeverity, IssueStage, OutageResource
from app.models.base import Base, UTCDateTime, enum_type

if TYPE_CHECKING:
    from app.models.place import Place


class IssueDetails(Base):
    """1:1 extension of a place on the `issue` layer."""

    __tablename__ = "issue_details"

    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), primary_key=True)
    stage: Mapped[IssueStage] = mapped_column(enum_type(IssueStage), default=IssueStage.DETECTED, index=True)
    stage_changed_at: Mapped[datetime] = mapped_column(UTCDateTime)
    severity: Mapped[IssueSeverity] = mapped_column(enum_type(IssueSeverity), default=IssueSeverity.MEDIUM)
    radius_m: Mapped[int | None]
    source: Mapped[InfoSource] = mapped_column(enum_type(InfoSource), default=InfoSource.USER)
    detected_at: Mapped[datetime] = mapped_column(UTCDateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    official_note: Mapped[str | None] = mapped_column(Text)
    expected_fix_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    appeal_number: Mapped[str | None] = mapped_column(String(60))
    responsible_org: Mapped[str | None] = mapped_column(String(160))
    outage_number: Mapped[str | None] = mapped_column(String(20))
    """Set for utility outages imported from VL.ru, together with the fields below."""
    outage_resource: Mapped[OutageResource | None] = mapped_column(enum_type(OutageResource))
    outage_buildings_count: Mapped[int] = mapped_column(default=0)
    outage_complaints_count: Mapped[int] = mapped_column(default=0)

    place: Mapped[Place] = relationship(lazy="raise", back_populates="issue")


class OutageBuilding(Base):
    """A house affected by an imported outage; one row per (outage, house)."""

    __tablename__ = "outage_buildings"
    __table_args__ = (Index("ix_outage_buildings_lat_lng", "lat", "lng"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), index=True)
    address: Mapped[str] = mapped_column(String(200))
    address_key: Mapped[str] = mapped_column(String(220), index=True)
    """Normalised address tokens padded with spaces, for token search («проверить адрес»)."""
    lat: Mapped[float]
    lng: Mapped[float]


class ImportRun(Base):
    """A finished import from an external source; the latest row tells how fresh the data is."""

    __tablename__ = "import_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[ExternalSourceId] = mapped_column(enum_type(ExternalSourceId), index=True)
    finished_at: Mapped[datetime] = mapped_column(UTCDateTime)
    summary: Mapped[dict[str, int]] = mapped_column(JSON, default=dict)
