"""What enrichment from free sources leaves behind besides photos (SPEC §19, §21).

Kept in their own tables so that existing databases gain them with `create_all` alone.
"""

from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UTCDateTime


class TextCredit(Base):
    """The licence notice for a description taken from a free source («Текст: Викигид, CC BY-SA»).

    One per place or area; shown with the description for as long as it is not empty.
    """

    __tablename__ = "text_credits"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int | None] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"), unique=True)
    area_id: Mapped[int | None] = mapped_column(ForeignKey("areas.id", ondelete="CASCADE"), unique=True)
    label: Mapped[str] = mapped_column(String(60))
    license: Mapped[str] = mapped_column(String(60))
    url: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class ExternalLink(Base):
    """An entry of an external source that describes one of our existing places or areas instead
    of becoming a place of its own (a Wikivoyage listing merged into a resident's place).

    `ref` uses the same form as `Place.external_id` (`wikivoyage:<listing>`), so enrichment
    snapshots find the place by either.
    """

    __tablename__ = "external_links"
    __table_args__ = (UniqueConstraint("ref"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    ref: Mapped[str] = mapped_column(String(80))
    place_id: Mapped[int | None] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"), index=True)
    area_id: Mapped[int | None] = mapped_column(ForeignKey("areas.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class AppliedSnapshot(Base):
    """Which version of a committed enrichment snapshot this database has received (SPEC §19).

    The application applies a new snapshot once at start-up; afterwards the data is the
    community's to change — a deleted archive photo is not brought back on the next restart.
    """

    __tablename__ = "applied_snapshots"
    __table_args__ = (UniqueConstraint("name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40))
    version: Mapped[str] = mapped_column(String(64))
    """A digest of the snapshot file as committed."""
    applied_at: Mapped[datetime] = mapped_column(UTCDateTime)
