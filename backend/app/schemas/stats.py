from app.domain.enums import ExternalSourceId, IssueStage, Layer, PlaceStatus
from app.schemas.common import ApiModel
from app.schemas.user import UserBrief


class Totals(ApiModel):
    """`places` / `verified_places` count the community's own content only; imports are separate."""

    places: int
    verified_places: int
    imported_places: int
    confirmed_imported: int
    """Imported places that at least one resident confirmed on the spot (a `present` vote)."""
    events_upcoming: int
    events_upcoming_community: int
    issues_open: int
    issues_open_community: int
    issues_resolved: int
    routes: int
    users: int
    votes: int


class SourceCount(ApiModel):
    source: ExternalSourceId
    label: str
    count: int


class LayerCount(ApiModel):
    layer: Layer
    count: int


class CategoryCount(ApiModel):
    category_id: int
    name: str
    layer: Layer
    count: int


class StatusCount(ApiModel):
    status: PlaceStatus
    count: int


class StageCount(ApiModel):
    stage: IssueStage
    count: int


class ActivityDay(ApiModel):
    date: str
    places: int
    votes: int


class Stats(ApiModel):
    totals: Totals
    imported_by_source: list[SourceCount]
    by_layer: list[LayerCount]
    top_categories: list[CategoryCount]
    status_breakdown: list[StatusCount]
    issues_by_stage: list[StageCount]
    activity: list[ActivityDay]
    top_contributors: list[UserBrief]
