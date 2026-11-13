"""The original Yandex cache and a separate cache for additional providers."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, CheckConstraint, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UTCDateTime, enum_type


class Outcome(StrEnum):
    MATCHED = "matched"
    NO_MATCH = "no_match"
    BLOCKED = "blocked"
    """The source answered this lookup with a captcha or refused it: the target is retried in an
    hour; nothing else changes."""
    FAILED = "failed"
    """This lookup could not be read (connection error, unexpected answer): the target is retried
    in an hour."""


class ExternalReviewSource(Base):
    """What the source said about one place or area. Rows also serve as the request log for the
    daily cap, so the limit survives restarts."""

    __tablename__ = "external_review_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int | None] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"), unique=True)
    area_id: Mapped[int | None] = mapped_column(ForeignKey("areas.id", ondelete="CASCADE"), unique=True)
    outcome: Mapped[Outcome] = mapped_column(enum_type(Outcome))
    org_id: Mapped[str | None] = mapped_column(String(32))
    url: Mapped[str | None] = mapped_column(String(300))
    rating: Mapped[float | None]
    ratings_count: Mapped[int | None]
    reviews_count: Mapped[int | None]
    photos: Mapped[list[str]] = mapped_column(JSON, default=list)
    """Hot-linked image URLs at the source; the images themselves are never stored."""
    requests: Mapped[int] = mapped_column(default=0)
    fetched_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)

    reviews: Mapped[list[ExternalReview]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by="ExternalReview.position"
    )


class ExternalReview(Base):
    """Rating, text (≤ 600 characters) and date. Nothing about the reviewer, by design."""

    __tablename__ = "external_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(
        ForeignKey("external_review_sources.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int]
    rating: Mapped[int | None]
    text: Mapped[str] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class CatalogueReviewSource(Base):
    """Additional providers. New tables preserve the existing Yandex cache without ALTERs."""

    __tablename__ = "external_catalogue_sources"
    __table_args__ = (
        UniqueConstraint("source", "place_id"),
        UniqueConstraint("source", "area_id"),
        CheckConstraint("(place_id IS NULL) <> (area_id IS NULL)", name="one_target"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20), index=True)
    place_id: Mapped[int | None] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    area_id: Mapped[int | None] = mapped_column(ForeignKey("areas.id", ondelete="CASCADE"))
    object_id: Mapped[str | None] = mapped_column(String(64))
    """Input binding, so changing a linked object invalidates this provider's cached answer."""
    outcome: Mapped[Outcome] = mapped_column(enum_type(Outcome))
    org_id: Mapped[str | None] = mapped_column(String(128))
    url: Mapped[str | None] = mapped_column(String(500))
    rating: Mapped[float | None]
    ratings_count: Mapped[int | None]
    reviews_count: Mapped[int | None]
    photos: Mapped[list[str]] = mapped_column(JSON, default=list)
    requests: Mapped[int] = mapped_column(default=0)
    fetched_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    reviews: Mapped[list[CatalogueReview]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by="CatalogueReview.position"
    )
    cursor: Mapped[CatalogueReviewCursor | None] = relationship(lazy="selectin", cascade="all, delete-orphan")


class CatalogueReview(Base):
    __tablename__ = "external_catalogue_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(
        ForeignKey("external_catalogue_sources.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int]
    rating: Mapped[int | None]
    text: Mapped[str] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class CatalogueReviewCursor(Base):
    """Where the next page of a provider row's reviews starts, and the page requests spent on it.

    A table of its own keeps create_all upgrades ALTER-free. Page requests do not touch the row's
    `fetched_at` — the match ages as it did — so they are counted for the daily cap here.
    """

    __tablename__ = "external_catalogue_cursors"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(
        ForeignKey("external_catalogue_sources.id", ondelete="CASCADE"), unique=True
    )
    next_offset: Mapped[int | None]
    """The source's offset of the next page; None when there is nothing more to load."""
    requests: Mapped[int] = mapped_column(default=0)
    requested_at: Mapped[datetime | None] = mapped_column(UTCDateTime, index=True)


class ReviewMatchEvidence(Base):
    """Versioned identity evidence; pre-policy cached rows have none and are never served.

    A separate table lets create_all upgrade an existing installation without ALTERing or
    deleting its review rows/request budget. Evidence and the source row commit together.
    """

    __tablename__ = "external_review_match_evidence"
    __table_args__ = (
        UniqueConstraint("source", "place_id"),
        UniqueConstraint("source", "area_id"),
        CheckConstraint("(place_id IS NULL) <> (area_id IS NULL)", name="one_target"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20))
    place_id: Mapped[int | None] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    area_id: Mapped[int | None] = mapped_column(ForeignKey("areas.id", ondelete="CASCADE"))
    fingerprint: Mapped[str] = mapped_column(String(64))
    org_id: Mapped[str | None] = mapped_column(String(128))
    title: Mapped[str | None] = mapped_column(String(300))
    lat: Mapped[float | None]
    lng: Mapped[float | None]
    method: Mapped[str] = mapped_column(String(32))
    fetched_at: Mapped[datetime] = mapped_column(UTCDateTime)
