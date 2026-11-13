"""What is sent to the model about each kind of content. No personal data of the author."""

from dataclasses import dataclass
from typing import Any

from app.domain.enums import StopKind
from app.models import Comment, MapNote, Place, Review, Route


@dataclass(frozen=True, slots=True)
class Subject:
    kind: str
    fields: dict[str, Any]


def place_subject(place: Place) -> Subject:
    """Requires `place.category` to be loaded."""
    return Subject(
        kind="place",
        fields={
            "layer": place.layer.value,
            "category": place.category.name,
            "title": place.title,
            "description": place.description,
            "tips": place.tips,
            "address": place.address,
            "tags": place.tags,
            "attributes": place.attributes,
        },
    )


def route_subject(route: Route) -> Subject:
    """Requires `route.stops` to be loaded."""
    stops = [
        {"title": stop.title, "note": stop.note, "landmark": stop.landmark}
        for stop in route.stops
        if stop.kind is not StopKind.VIA
    ]
    return Subject(
        kind="route",
        fields={
            "title": route.title,
            "description": route.description,
            "tips": route.tips,
            "tags": route.tags,
            "stops": stops,
        },
    )


def note_subject(note: MapNote) -> Subject:
    return Subject(kind="note", fields={"text": note.text, "object_name": note.object_name})


def comment_subject(comment: Comment) -> Subject:
    return Subject(kind="comment", fields={"text": comment.text})


def review_subject(review: Review) -> Subject:
    return Subject(kind="review", fields={"rating": review.rating, "text": review.text})
