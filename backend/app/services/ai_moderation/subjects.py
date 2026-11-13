"""What is sent to the model about each kind of content. No personal data of the author."""

from dataclasses import dataclass
from typing import Any

from app.domain.enums import StopKind
from app.domain.lost_found import CATEGORY_LABELS, LostKind
from app.models import Comment, LostItem, LostResponse, MapNote, Place, Quest, Review, Route


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


def quest_subject(route: Route, quest: Quest) -> Subject:
    """A quest (SPEC §27): every stage with its riddle, question, answers, hint and story — the
    players see them one by one, the model sees them all."""
    stages = [
        {
            "place": stage.title,
            "riddle": stage.riddle,
            "question": stage.question,
            "answers": stage.answers,
            "hint": stage.hint,
            "story": stage.reward,
        }
        for stage in quest.stages
    ]
    return Subject(
        kind="quest",
        fields={
            "title": route.title,
            "description": route.description,
            "start": quest.start_title,
            "stages": stages,
        },
    )


def note_subject(note: MapNote) -> Subject:
    return Subject(kind="note", fields={"text": note.text, "object_name": note.object_name})


def comment_subject(comment: Comment) -> Subject:
    return Subject(kind="comment", fields={"text": comment.text})


def review_subject(review: Review) -> Subject:
    return Subject(kind="review", fields={"rating": review.rating, "text": review.text})


def lost_item_subject(item: LostItem) -> Subject:
    """A public lost-and-found post (SPEC §26); the place and the date stay out, like any address."""
    return Subject(
        kind="lost_item",
        fields={
            "post": "lost" if item.kind is LostKind.LOST else "found",
            "category": CATEGORY_LABELS[item.category],
            "title": item.title,
            "description": item.description,
            "control_question": item.control_question,
        },
    )


def lost_response_subject(response: LostResponse) -> Subject:
    """The private message only; the contact line never goes to the model."""
    return Subject(kind="lost_response", fields={"text": response.message})
