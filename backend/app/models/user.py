from datetime import datetime

from sqlalchemy import JSON, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.domain import levels
from app.domain.enums import UserLevel, UserRole
from app.models.base import Base, UTCDateTime, enum_type


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    username: Mapped[str] = mapped_column(String(24), unique=True)
    display_name: Mapped[str] = mapped_column(String(60))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(enum_type(UserRole), default=UserRole.USER)
    reputation: Mapped[int] = mapped_column(default=0, index=True)
    bio: Mapped[str] = mapped_column(Text, default="")
    home_lat: Mapped[float | None]
    home_lng: Mapped[float | None]
    """Declared home area, rounded to about 100 m. Private: only its owner ever sees it."""
    home_label: Mapped[str | None] = mapped_column(String(120))
    home_set_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    home_change_allowed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    """Kept after the home is removed, so removing and re-adding does not skip the cooldown."""
    home_confidence: Mapped[float] = mapped_column(default=0.0)
    """Internal: how much the declared home is believed (SPEC §16). Never exposed."""
    is_system: Mapped[bool] = mapped_column(default=False)
    """Technical author of imported content: cannot log in, earns no reputation, gets no notices."""
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)

    @property
    def level(self) -> UserLevel:
        return levels.level_for(self.reputation)

    @property
    def is_staff(self) -> bool:
        return levels.is_staff(self.role)


class Respect(Base):
    __tablename__ = "respects"
    __table_args__ = (UniqueConstraint("from_user_id", "to_user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class Subscription(Base):
    """A circle on the map the user wants to hear news about."""

    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(80))
    lat: Mapped[float]
    lng: Mapped[float]
    radius_m: Mapped[int]
    layers: Mapped[list[str]] = mapped_column(JSON)
    is_home: Mapped[bool] = mapped_column(default=False)
    """The automatic «Мой район» subscription that follows the user's home."""
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
