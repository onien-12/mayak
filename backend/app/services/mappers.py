"""Model → schema mapping for values that are computed on read (phase, staleness, viewer flags)."""

from datetime import datetime

from app.domain import cover as cover_rules
from app.domain import event_phase, trust
from app.domain.cover import CatalogueCover
from app.domain.enums import PUBLIC_STATUSES, ExternalSourceId, Layer, PlaceStatus, RouteStatus, StopKind
from app.models import Area, Comment, EventDetails, IssueDetails, Place, Route, User
from app.schemas.feedback import CommentOut
from app.schemas.place import (
    AreaRef,
    CombinedRating,
    CoverSource,
    EventBrief,
    EventDetail,
    ExternalSource,
    IssueBrief,
    OutageBrief,
    PlaceCard,
)
from app.schemas.route import RouteCard
from app.schemas.user import UserBrief

EXTERNAL_SOURCE_LABELS: dict[ExternalSourceId, str] = {
    ExternalSourceId.VL_RU: "Афиша VL.ru",
    ExternalSourceId.VL_RU_OFF: "Отключения VL.ru",
    ExternalSourceId.OSM: "OpenStreetMap",
    ExternalSourceId.WIKIVOYAGE: "Викигид",
}
CATALOGUE_LABELS: dict[str, str] = {"yandex": "Яндекс Карты", "2gis": "2ГИС", "google": "Google Maps"}
"""Names of the map services whose photos a cover may be borrowed from (SPEC §20, §25)."""


def phase_of(event: EventDetails, now: datetime) -> event_phase.EventPhase:
    return event_phase.event_phase(
        now=now,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        is_cancelled=event.is_cancelled,
        registration_closed=event.registration_closed,
        capacity=event.capacity,
        participants_count=event.participants_count,
    )


def event_brief(event: EventDetails, now: datetime) -> EventBrief:
    return EventBrief(
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        phase=phase_of(event, now),
        price=event.price,
        price_note=event.price_note,
        capacity=event.capacity,
        participants_count=event.participants_count,
        is_meetup=event.is_meetup,
    )


def event_detail(event: EventDetails, now: datetime, *, is_joined: bool, sees_contact: bool) -> EventDetail:
    return EventDetail(
        **event_brief(event, now).model_dump(),
        seats_left=event_phase.seats_left(event.capacity, event.participants_count),
        age_limit=event.age_limit,
        registration_url=event.registration_url,
        contact=event.contact if sees_contact else None,
        is_cancelled=event.is_cancelled,
        registration_closed=event.registration_closed,
        series_id=event.series_id,
        venue_place_id=event.venue_place_id,
        is_joined=is_joined,
    )


def issue_brief_fields(issue: IssueDetails) -> dict[str, object]:
    outage = None
    if issue.outage_number is not None and issue.outage_resource is not None:
        outage = OutageBrief(
            number=issue.outage_number,
            resource=issue.outage_resource,
            buildings_count=issue.outage_buildings_count,
            complaints_count=issue.outage_complaints_count,
            started_at=issue.detected_at,
            planned_end_at=issue.expected_fix_at,
            organization=issue.responsible_org,
        )
    return {
        "stage": issue.stage,
        "severity": issue.severity,
        "radius_m": issue.radius_m,
        "source": issue.source,
        "outage": outage,
    }


def is_stale(place: Place, now: datetime) -> bool:
    """Events are temporary by nature and never get the «давно не проверялось» warning."""
    if place.layer is Layer.EVENT:
        return False
    return trust.is_stale(place.last_confirmed_at or place.created_at, now)


def external_source(item: Place | Area) -> ExternalSource | None:
    """Where an imported place or territory came from; None for the community's own content."""
    if item.external_source is None or item.external_url is None:
        return None
    return ExternalSource(
        source=item.external_source,
        label=EXTERNAL_SOURCE_LABELS[item.external_source],
        url=item.external_url,
    )


def cover_fields(
    cover_url: str | None, cover_credit: dict[str, str] | None, borrowed: CatalogueCover | None
) -> dict[str, object]:
    """The cover as stored, or — only when there is none — the one borrowed from a map service,
    marked with the service and linked to the object's page there (SPEC §25)."""
    if cover_url is not None or borrowed is None:
        return {"cover_url": cover_url, "cover_credit": cover_credit, "cover_source": None}
    source = CoverSource(
        source=borrowed.source,
        label=CATALOGUE_LABELS.get(borrowed.source, borrowed.source),
        url=borrowed.page_url,
    )
    return {"cover_url": borrowed.url, "cover_credit": None, "cover_source": source}


def place_base_fields(
    place: Place,
    now: datetime,
    combined_rating: CombinedRating | None,
    status: PlaceStatus | None = None,
    borrowed_cover: CatalogueCover | None = None,
) -> dict[str, object]:
    """`status` overrides the stored one: what the author of a place in its screening window sees.
    `borrowed_cover` comes from `covers.borrowed_for_places`, loaded for a whole page."""
    return {
        "id": place.id,
        "layer": place.layer,
        "category_id": place.category_id,
        "title": place.title,
        "lat": place.lat,
        "lng": place.lng,
        "address": place.address,
        "status": status or place.status,
        "trust_score": place.trust_score,
        **cover_fields(place.cover_url, place.cover_credit, borrowed_cover),
        "tags": place.tags,
        "rating_avg": place.rating_avg,
        "rating_count": place.rating_count,
        "combined_rating": combined_rating,
        "author_id": place.author_id,
        "created_at": place.created_at,
        "last_confirmed_at": place.last_confirmed_at,
        "is_stale": is_stale(place, now),
        "external": external_source(place),
        "area": AreaRef(id=place.area.id, title=place.area.title) if place.area else None,
    }


def place_card(
    place: Place,
    now: datetime,
    *,
    combined_rating: CombinedRating | None,
    status: PlaceStatus | None = None,
    borrowed_cover: CatalogueCover | None = None,
) -> PlaceCard:
    """Requires `place.event`, `place.issue` and `place.area` to be loaded; the blend comes from
    `combined_ratings` and the borrowed cover from `covers`, which load them for a whole page."""
    return PlaceCard(
        **place_base_fields(place, now, combined_rating, status, borrowed_cover),
        event=event_brief(place.event, now) if place.event else None,
        issue=IssueBrief(**issue_brief_fields(place.issue)) if place.issue else None,
    )


def comment_out(comment: Comment, viewer: User | None, *, on_review: bool = False) -> CommentOut:
    can_delete = viewer is not None and (viewer.id == comment.author_id or viewer.is_staff)
    return CommentOut(
        id=comment.id,
        author=UserBrief.model_validate(comment.author),
        text=comment.text,
        created_at=comment.created_at,
        can_delete=can_delete,
        on_review=on_review,
    )


def route_cover(route: Route) -> str | None:
    """The best preview among the stops' photos (by shape and size, SPEC §25), else the cover of
    the first linked public place that has one."""
    photos = [photo for stop in route.stops for photo in stop.photos]
    best = cover_rules.best(
        [cover_rules.Candidate(photo.width, photo.height, own=photo.credit is None) for photo in photos]
    )
    if best is not None:
        return photos[best].url
    return next(
        (
            stop.place.cover_url
            for stop in route.stops
            if stop.place and stop.place.cover_url and stop.place.status in PUBLIC_STATUSES
        ),
        None,
    )


def route_card_fields(
    route: Route, *, is_saved: bool, status: RouteStatus | None = None
) -> dict[str, object]:
    """Requires `route.author` and `route.stops` with their photos and places to be loaded.
    `status` overrides the stored one: what the author of a route in its screening window sees."""
    return {
        "id": route.id,
        "title": route.title,
        "description": route.description,
        "kind": route.kind,
        "status": status or route.status,
        "visibility": route.visibility,
        "difficulty": route.difficulty,
        "tags": route.tags,
        "distance_m": route.distance_m,
        "travel_min": route.travel_min,
        "duration_min": route.duration_min,
        "stops_count": sum(1 for stop in route.stops if stop.kind is not StopKind.VIA),
        "cover_url": route_cover(route),
        "author": UserBrief.model_validate(route.author),
        "rating_avg": route.rating_avg,
        "rating_count": route.rating_count,
        "saves_count": route.saves_count,
        "is_saved": is_saved,
        "path": route.path,
        "created_at": route.created_at,
        "updated_at": route.updated_at,
    }


def route_card(route: Route, *, is_saved: bool, status: RouteStatus | None = None) -> RouteCard:
    return RouteCard(**route_card_fields(route, is_saved=is_saved, status=status))
