"""«Для вас» (SPEC §23.5): what to show first on the map or in the afisha for a profile.

Candidates come with their topics in one query per kind, restricted to the profile's topics (the
others cannot add to the match); scoring, the diversity rule and the cut happen here, and only the
chosen ones are loaded as cards. A fixed number of queries whatever the size of the city.
"""

import hashlib
from collections import defaultdict
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.domain import interests as rules
from app.domain.enums import Layer, PlaceStatus
from app.domain.geo import BBox
from app.domain.interests import InterestTarget, Profile, Topic
from app.models import Area, EventDetails, EventParticipant, Favorite, InterestTag, Place, User
from app.schemas.interest import Recommendation, Recommendations
from app.services import areas, place_quality, place_queries

DEFAULT_LIMIT = 12
MAX_LIMIT = 30
RECOMMENDED_STATUSES = (PlaceStatus.UNVERIFIED, PlaceStatus.PRELIMINARY, PlaceStatus.VERIFIED)
"""Public, and nothing a moderator is still looking at."""
_SCORE_PRECISION = 4


class Scope(StrEnum):
    MAP = "map"
    EVENTS = "events"


@dataclass(frozen=True, slots=True)
class RecommendationQuery:
    scope: Scope = Scope.MAP
    bbox: BBox | None = None
    starts_from: datetime | None = None
    ends_to: datetime | None = None
    limit: int = DEFAULT_LIMIT


@dataclass(frozen=True, slots=True)
class Candidate:
    target_type: InterestTarget
    target_id: int
    title: str
    match: float
    score: float
    reasons: list[Topic]
    discovery: bool = False
    """A little-known object: nobody has rated it yet. Never an area or an event."""
    starts_at: datetime | None = None
    """Events only: among equal scores the sooner comes first."""


def _with_tags(
    statement: Select[Any], target_type: InterestTarget, id_column: Any, profile: Profile
) -> Select[Any]:
    """Candidate rows joined with their tags on the profile's topics, one row per topic."""
    return (
        statement.add_columns(InterestTag.topic, func.max(InterestTag.weight))
        .join(
            InterestTag,
            and_(
                InterestTag.target_type == target_type,
                InterestTag.target_id == id_column,
                InterestTag.topic.in_(list(profile)),
            ),
        )
        .group_by(id_column, InterestTag.topic)
    )


def _score(
    target_type: InterestTarget,
    rows: Sequence[Any],
    profile: Profile,
    quality_of: Callable[[Any], float],
    *,
    discovery_of: Callable[[Any], bool] = lambda row: False,
) -> list[Candidate]:
    tags: dict[int, dict[Topic, float]] = defaultdict(dict)
    first: dict[int, Any] = {}
    for row in rows:
        tags[row.id][row.topic] = row[-1]
        first.setdefault(row.id, row)
    candidates = []
    for target_id, object_tags in tags.items():
        match = rules.match(profile, object_tags)
        if match < rules.MIN_MATCH:
            continue
        row = first[target_id]
        candidates.append(
            Candidate(
                target_type,
                target_id,
                row.title,
                match,
                round(rules.score(match, quality_of(row)), _SCORE_PRECISION),
                rules.reasons(profile, object_tags),
                discovery=discovery_of(row),
                starts_at=getattr(row, "starts_at", None),
            )
        )
    return candidates


def _rank(candidates: list[Candidate]) -> list[Candidate]:
    """Best first; equal events by start, the rest in a stable order. One result per title."""
    ranked = sorted(
        candidates,
        key=lambda item: (
            -item.score,
            item.starts_at or datetime.min,
            item.target_type,
            item.target_id,
        ),
    )
    return rules.without_repeats(ranked, lambda item: rules.title_key(item.title))


def _discoveries(ranked: Sequence[Candidate], today: date) -> list[Candidate]:
    """The little-known ones by how well they fit; equals take turns from day to day."""

    def turn(item: Candidate) -> str:
        return hashlib.sha256(f"{today.isoformat()}:{item.target_id}".encode()).hexdigest()

    found = [item for item in ranked if item.discovery]
    return sorted(found, key=lambda item: (-round(item.match, 1), turn(item)))


def _not_mine(viewer: User | None) -> list[Any]:
    """Not the person's own and not already in their favourites."""
    if viewer is None:
        return []
    favourites = select(Favorite.place_id).where(Favorite.user_id == viewer.id)
    return [Place.author_id != viewer.id, Place.id.not_in(favourites)]


async def _map_candidates(
    session: AsyncSession, viewer: User | None, profile: Profile, query: RecommendationQuery
) -> list[Candidate]:
    area_statement = _with_tags(
        select(Area.id, Area.title, Area.interest), InterestTarget.AREA, Area.id, profile
    )
    place_statement = _with_tags(
        select(Place.id, Place.title, Place.trust_score, Place.rating_avg, Place.rating_count),
        InterestTarget.PLACE,
        Place.id,
        profile,
    ).where(Place.layer == Layer.TOURISM, Place.status.in_(RECOMMENDED_STATUSES), *_not_mine(viewer))
    if viewer is not None:
        area_statement = area_statement.where(or_(Area.author_id.is_(None), Area.author_id != viewer.id))
    if query.bbox is not None:
        box = query.bbox
        area_statement = area_statement.where(
            Area.min_lat <= box.max_lat,
            Area.max_lat >= box.min_lat,
            Area.min_lng <= box.max_lng,
            Area.max_lng >= box.min_lng,
        )
        place_statement = place_statement.where(
            Place.lat.between(box.min_lat, box.max_lat), Place.lng.between(box.min_lng, box.max_lng)
        )
    area_rows = list(await session.execute(area_statement))
    place_rows = list(await session.execute(place_statement))
    found_areas = _score(
        InterestTarget.AREA, area_rows, profile, lambda row: rules.area_quality(row.interest)
    )
    useful = await place_quality.usefulness_for(session, {row.id for row in place_rows})
    found_places = _score(
        InterestTarget.PLACE,
        place_rows,
        profile,
        lambda row: rules.with_usefulness(
            rules.place_quality(row.trust_score, row.rating_avg), useful.get(row.id)
        ),
        discovery_of=lambda row: row.rating_count == 0,
    )
    # A location and the place it is named after are one thing to a person: the location stays.
    area_titles = {rules.title_key(item.title) for item in found_areas}
    return [
        *found_areas,
        *(item for item in found_places if rules.title_key(item.title) not in area_titles),
    ]


async def _event_candidates(
    session: AsyncSession, viewer: User | None, profile: Profile, query: RecommendationQuery, now: datetime
) -> list[Candidate]:
    statement = (
        _with_tags(
            select(Place.id, Place.title, Place.status, Place.external_source, EventDetails.starts_at),
            InterestTarget.PLACE,
            Place.id,
            profile,
        )
        .join(EventDetails, EventDetails.place_id == Place.id)
        .where(
            Place.layer == Layer.EVENT,
            Place.status.in_(RECOMMENDED_STATUSES),
            EventDetails.ends_at >= now,
            EventDetails.is_cancelled.is_(False),
            or_(EventDetails.capacity.is_(None), EventDetails.participants_count < EventDetails.capacity),
            *_not_mine(viewer),
        )
    )
    if viewer is not None:
        joined = select(EventParticipant.place_id).where(EventParticipant.user_id == viewer.id)
        statement = statement.where(Place.id.not_in(joined))
    if query.starts_from is not None:
        statement = statement.where(EventDetails.ends_at >= query.starts_from)
    if query.ends_to is not None:
        statement = statement.where(EventDetails.starts_at <= query.ends_to)
    rows = list(await session.execute(statement))
    useful = await place_quality.usefulness_for(session, {row.id for row in rows})
    return _score(
        InterestTarget.PLACE,
        rows,
        profile,
        lambda row: rules.with_usefulness(
            rules.event_quality(row.external_source is not None, row.status is PlaceStatus.VERIFIED),
            useful.get(row.id),
        ),
    )


async def recommend(
    session: AsyncSession, viewer: User | None, profile: Profile, query: RecommendationQuery
) -> Recommendations:
    if not profile:
        return Recommendations(personalized=False, items=[])
    now = utcnow()
    if query.scope is Scope.EVENTS:
        candidates = await _event_candidates(session, viewer, profile, query, now)
    else:
        candidates = await _map_candidates(session, viewer, profile, query)
    ranked = _rank(candidates)
    chosen = rules.arrange(
        ranked, lambda item: item.reasons[0], _discoveries(ranked, now.date()), query.limit
    )

    area_ids = [item.target_id for item in chosen if item.target_type is InterestTarget.AREA]
    place_ids = [item.target_id for item in chosen if item.target_type is InterestTarget.PLACE]
    area_rows = list(await session.scalars(select(Area).where(Area.id.in_(area_ids)))) if area_ids else []
    area_cards = {card.id: card for card in await areas.area_cards(session, area_rows, profile)}
    place_rows = (
        list(await session.scalars(place_queries.card_query().where(Place.id.in_(place_ids))))
        if place_ids
        else []
    )
    place_cards = {card.id: card for card in await place_queries.cards(session, place_rows, now)}
    items = [
        Recommendation(
            type="area" if item.target_type is InterestTarget.AREA else "place",
            score=item.score,
            topics=item.reasons,
            area=area_cards.get(item.target_id) if item.target_type is InterestTarget.AREA else None,
            place=place_cards.get(item.target_id) if item.target_type is InterestTarget.PLACE else None,
        )
        for item in chosen
    ]
    return Recommendations(personalized=True, items=[item for item in items if item.area or item.place])
