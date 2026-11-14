"""The «Карта» list (SPEC §17, §18): every place that matches the filters, city-wide, in pages.

One query takes the light columns of every match (a few thousand at most, even with the whole
OpenStreetMap layer), the rules of `domain.map_list` filter and order them in Python, and only
the requested page is loaded as cards. Map markers keep loading by viewport (`GET /places`).
"""

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.domain import geo
from app.domain import map_list as rules
from app.domain.geo import BBox
from app.models import Category, Place, User
from app.schemas.place import PlacePage
from app.services import combined_ratings, place_queries, places
from app.services.experimental.external_reviews import photos as catalogue_photos
from app.services.places import MinStatus, PlaceFilters


@dataclass(frozen=True, slots=True)
class ListOrder:
    view: BBox | None = None
    """The visible part of the map: what is inside comes first."""
    center: tuple[float, float] | None = None
    """`(lat, lng)` the distances are measured from: the viewer or the map centre."""
    hide_background: bool = False
    """Leave bare OpenStreetMap objects out: the default list (no search, no category, no
    «Всё из OpenStreetMap»)."""
    offset: int = 0
    limit: int = rules.DEFAULT_PAGE


def _inside(box: BBox | None, row: Any) -> bool:
    return box is not None and box.min_lat <= row.lat <= box.max_lat and box.min_lng <= row.lng <= box.max_lng


async def page(
    session: AsyncSession, viewer: User | None, filters: PlaceFilters, order: ListOrder
) -> PlacePage:
    now = utcnow()
    rows = list(
        await session.execute(
            select(
                Place.id,
                Place.lat,
                Place.lng,
                Place.layer,
                Place.title,
                Place.cover_url,
                Place.external_source,
                Place.last_confirmed_at,
                Place.attributes,
                Place.tags,
                Category.name.label("category_name"),
                place_queries.community_clause().label("community"),
            )
            .join(Category, Category.id == Place.category_id)
            .outerjoin(Place.event)
            .outerjoin(Place.issue)
            .where(*places.filter_clauses(filters, viewer, now))
        )
    )
    # A cover borrowed from a map service counts as a photo, as on the cards (SPEC §25).
    borrowed: set[int] = set()
    if order.hide_background and combined_ratings.enabled(session):
        borrowed = set(await session.scalars(catalogue_photos.matched_places()))
    trusted_only = filters.min_status is not MinStatus.ANY

    def kept(row: Any) -> bool:
        if not places.matches_json_filters(row, filters):
            return False
        confirmed = row.last_confirmed_at is not None
        if trusted_only and rules.is_unconfirmed_osm(row.external_source, confirmed):
            return False
        return not order.hide_background or not rules.is_bare_background(
            source=row.external_source,
            confirmed=confirmed,
            title=row.title,
            category_name=row.category_name,
            layer=row.layer,
            pictured=row.cover_url is not None or row.id in borrowed,
        )

    def key(row: Any) -> tuple[int, int, float, int]:
        distance = geo.haversine_m(*order.center, row.lat, row.lng) if order.center else 0.0
        return rules.order_key(
            in_view=_inside(order.view, row),
            community=bool(row.community),
            distance_m=distance,
            place_id=row.id,
        )

    listed = sorted((row for row in rows if kept(row)), key=key)
    chosen = [row.id for row in listed[order.offset : order.offset + order.limit]]
    loaded: dict[int, Place] = {}
    if chosen:
        statement = place_queries.card_query().where(Place.id.in_(chosen))
        loaded = {place.id: place for place in await session.scalars(statement)}
    return PlacePage(
        total=len(listed),
        in_view=sum(1 for row in listed if _inside(order.view, row)),
        items=await place_queries.cards(session, [loaded[place_id] for place_id in chosen], now),
    )
