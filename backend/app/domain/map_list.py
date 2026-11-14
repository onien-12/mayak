"""The «Карта» list (SPEC §17, §18): every place that matches the filters, city-wide, in pages.

Pure rules: which imported objects stay in the background unless asked for, and the order —
what is in the current map view first, then residents' places before imported ones, the nearest
to the centre first within each.
"""

from app.domain.enums import ExternalSourceId, Layer

DEFAULT_PAGE = 40
MAX_PAGE = 200


def is_unconfirmed_osm(source: ExternalSourceId | None, confirmed: bool) -> bool:
    """An object of the OpenStreetMap base layer no resident has confirmed: the trust filters
    leave it out."""
    return source is ExternalSourceId.OSM and not confirmed


def is_bare_background(
    *,
    source: ExternalSourceId | None,
    confirmed: bool,
    title: str,
    category_name: str,
    layer: Layer,
    pictured: bool,
) -> bool:
    """Such an object with nothing to show for itself: titled by its category («Детская
    площадка»), or a sight without a photo. The client's `isBareBackground` is the same rule."""
    if not is_unconfirmed_osm(source, confirmed):
        return False
    return title == category_name or (layer is Layer.TOURISM and not pictured)


def order_key(
    *, in_view: bool, community: bool, distance_m: float, place_id: int
) -> tuple[int, int, float, int]:
    """In view first; residents' before imported; the nearest first; then a stable order."""
    return (0 if in_view else 1, 0 if community else 1, distance_m, place_id)
