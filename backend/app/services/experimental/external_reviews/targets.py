"""Which of our places and areas are looked up at the source, and with what (SPEC §20)."""

from app.models import Area, Place
from app.services.experimental.external_reviews import rules
from app.services.experimental.external_reviews.matcher import Subject
from app.services.experimental.external_reviews.service import Target


def for_place(place: Place) -> Target | None:
    """Requires `place.category` and `place.area` loaded; None for places that do not qualify."""
    return place_target(place, place.category.name)


def place_target(place: Place, category_name: str) -> Target | None:
    """Requires `place.area` loaded; for lists that know the category's name without loading it."""
    if not rules.is_eligible_place(place.layer, place.title, category_name):
        return None
    parent = place.area.title if place.area is not None else None
    return Target(
        Subject(place.title, place.lat, place.lng, parent_title=parent, kind=category_name),
        place_id=place.id,
        object_id=place.object_id,
    )


def for_area(area: Area) -> Target:
    return Target(
        Subject(area.title, area.lat, area.lng, area_radius_m=area.radius_m, kind=area.kind.value),
        area_id=area.id,
        object_id=area.object_id,
    )
