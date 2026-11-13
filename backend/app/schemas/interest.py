from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.domain.interests import Topic
from app.schemas.area import AreaCard, CommunityEventRef
from app.schemas.common import ApiModel
from app.schemas.place import PlaceCard

SearchText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=100)]


class TopicOut(ApiModel):
    slug: Topic
    label: str
    description: str


class MyInterests(ApiModel):
    topics: list[Topic]
    noticed: list[Topic]
    onboarded: bool


class InterestsIn(ApiModel):
    topics: Annotated[list[Topic], Field(max_length=len(Topic))]


class SearchSignalIn(ApiModel):
    kind: Literal["search"]
    q: SearchText


class Recommendation(ApiModel):
    type: Literal["area", "place"]
    score: float
    topics: list[Topic]
    area: AreaCard | None
    place: PlaceCard | None
    reason_event: CommunityEventRef | None
    """A location recommended for the residents' upcoming event inside it (SPEC §23.5)."""


class Recommendations(ApiModel):
    personalized: bool
    items: list[Recommendation]
