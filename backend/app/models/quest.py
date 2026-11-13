"""Quests (SPEC §27): a route-like publication whose stages are secrets until a player passes them.

The public side of a quest — title, description, status, visibility, reviews, complaints and
moderation — is an ordinary `Route` row, so everything that screens and moderates routes works for
quests too; the route has no stops and is never listed or opened as a route. What makes it a quest
lives in these tables, keyed by that route's id (the quest id is the route id).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import JSON, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain.quests import QuestCondition, QuestZone
from app.models.base import Base, UTCDateTime, enum_type

if TYPE_CHECKING:
    from app.models.place import Photo
    from app.models.route import Route
    from app.models.user import User


class Quest(Base):
    __tablename__ = "quests"

    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id", ondelete="CASCADE"), primary_key=True)
    start_title: Mapped[str] = mapped_column(String(120))
    """Where the quest starts — public, unlike every stage («у входа в ГУМ со Светланской»)."""
    start_lat: Mapped[float]
    start_lng: Mapped[float]
    duration_min: Mapped[int]
    """How long the author expects it to take."""
    cover_photo_id: Mapped[int | None] = mapped_column(ForeignKey("photos.id"))

    route: Mapped[Route] = relationship(lazy="raise")
    cover_photo: Mapped[Photo | None] = relationship(lazy="raise")
    stages: Mapped[list[QuestStage]] = relationship(
        lazy="raise", order_by="QuestStage.position", cascade="all, delete-orphan"
    )


class QuestStage(Base):
    """One riddle leading to one place. Nothing here reaches a player before they pass the stage,
    except the riddle, its photo, the question and the search circle of the stage they are on."""

    __tablename__ = "quest_stages"
    __table_args__ = (UniqueConstraint("quest_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(32), unique=True, default=lambda: uuid4().hex)
    """Never reused (unlike an id after a delete): what runs remember the stages they passed by."""
    quest_id: Mapped[int] = mapped_column(ForeignKey("quests.route_id", ondelete="CASCADE"), index=True)
    position: Mapped[int]
    """1-based."""
    title: Mapped[str] = mapped_column(String(120))
    """The place the riddle leads to; shown once the stage is passed."""
    lat: Mapped[float]
    lng: Mapped[float]
    place_id: Mapped[int | None] = mapped_column(ForeignKey("places.id"))
    riddle: Mapped[str] = mapped_column(Text)
    photo_id: Mapped[int | None] = mapped_column(ForeignKey("photos.id"))
    condition: Mapped[QuestCondition] = mapped_column(enum_type(QuestCondition))
    check_arrival: Mapped[bool] = mapped_column(default=False)
    """For a code or an answer: the player must also be on site."""
    radius_m: Mapped[int]
    question: Mapped[str] = mapped_column(Text, default="")
    answers: Mapped[list[str]] = mapped_column(JSON, default=list)
    """Accepted answers, or the one code; compared after `quests.normalize_answer`."""
    hint: Mapped[str] = mapped_column(Text, default="")
    reward: Mapped[str] = mapped_column(Text, default="")
    """The story of the place, told after the stage is passed."""
    zone: Mapped[QuestZone] = mapped_column(enum_type(QuestZone), default=QuestZone.RIDDLE)
    zone_radius_m: Mapped[int | None]

    photo: Mapped[Photo | None] = relationship(lazy="raise")


class QuestRun(Base):
    """One attempt at a quest, solo or by a team; progress is shared by all its members."""

    __tablename__ = "quest_runs"
    __table_args__ = (Index("ix_quest_runs_board", "quest_id", "ranked", "finished_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    quest_id: Mapped[int] = mapped_column(ForeignKey("quests.route_id", ondelete="CASCADE"), index=True)
    captain_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    is_team: Mapped[bool] = mapped_column(default=False)
    team_name: Mapped[str | None] = mapped_column(String(40))
    join_code: Mapped[str | None] = mapped_column(String(12), unique=True)
    """Set while a team run is open to join; cleared when it ends."""
    is_test: Mapped[bool] = mapped_column(default=False)
    """The author's own run: arrival can be confirmed by a button, counted nowhere."""
    stage_index: Mapped[int] = mapped_column(default=0)
    """How many stages were passed (for lists); progress itself is `passes`, by stage key."""
    lead_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    """Team runs: the member who sees the riddle of the current stage."""
    hints: Mapped[list[str]] = mapped_column(JSON, default=list)
    """Keys of the stages whose hint was taken."""
    passes: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    """`{"stage", "user_id", "at"}` per passed stage, by stage key: an author who reorders or
    rewrites the quest mid-run never shows a player a stage they did not pass."""
    wrong_tries: Mapped[int] = mapped_column(default=0)
    """Wrong tries on the current stage since the last pause."""
    locked_until: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ranked: Mapped[bool] = mapped_column(default=False)
    """Finished and on the results board: not a test, and none of its players had finished the
    quest before."""
    started_at: Mapped[datetime] = mapped_column(UTCDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    abandoned_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)

    members: Mapped[list[QuestRunMember]] = relationship(
        lazy="raise", order_by="QuestRunMember.id", cascade="all, delete-orphan"
    )


class QuestRunMember(Base):
    __tablename__ = "quest_run_members"
    __table_args__ = (UniqueConstraint("run_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("quest_runs.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime)
    left_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    user: Mapped[User] = relationship(lazy="raise")
