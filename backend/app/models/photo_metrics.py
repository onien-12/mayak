from datetime import datetime

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UTCDateTime


class PhotoMetrics(Base):
    """Measurements of an uploaded picture for the cover choice (SPEC §25), each 0..1.

    Only photos whose file is ours have a row; hot-linked ones are judged by their size alone.
    """

    __tablename__ = "photo_metrics"

    photo_id: Mapped[int] = mapped_column(ForeignKey("photos.id"), primary_key=True)
    sharpness: Mapped[float]
    exposure: Mapped[float]
    contrast: Mapped[float]
    colour: Mapped[float]
    photo: Mapped[float]
    """1 for a photograph, towards 0 for a flat graphic."""
    measured_at: Mapped[datetime] = mapped_column(UTCDateTime)
