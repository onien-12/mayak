from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

SourceName = Literal["yandex", "2gis", "google"]


class ExternalReviewLink(ApiModel):
    source: SourceName
    label: str
    url: str


class ExternalReviewOut(ApiModel):
    rating: int | None
    text: str
    published_at: datetime | None


class ExternalReviewSourceOut(ApiModel):
    source: SourceName
    label: str
    url: str
    rating: float | None
    ratings_count: int | None
    reviews_count: int | None
    reviews: list[ExternalReviewOut]
    photos: list[str]
    fetched_at: datetime
    reviews_available: bool = True
    has_more: bool = False
    """The source holds more review texts than are stored and this provider can page."""


class ExternalReviews(ApiModel):
    enabled: bool
    sources: list[ExternalReviewSourceOut]
    pending: bool = False
    pending_sources: list[SourceName] = Field(default_factory=list)
    """The providers still being asked; `pending` is true exactly when this is not empty."""
    links: list[ExternalReviewLink] = Field(default_factory=list)
