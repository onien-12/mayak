from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UTCDateTime


class ExternalRatingCache(Base):
    """Last answer of 2GIS about the aggregate rating of one map object (SPEC §19).

    One row per object; `fetched_at` of the rows doubles as the request log for the daily cap.
    """

    __tablename__ = "external_ratings"

    id: Mapped[int] = mapped_column(primary_key=True)
    object_id: Mapped[str] = mapped_column(String(64), unique=True)
    rating: Mapped[float | None]
    count: Mapped[int] = mapped_column(default=0)
    succeeded: Mapped[bool]
    fetched_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
