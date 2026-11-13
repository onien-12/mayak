"""«Для вас» (SPEC §23.5): what to show first on the map or in the afisha for a profile.

Candidates come with their topics in one query per kind, restricted to the profile's topics (the
others cannot add to the match); what residents made inside the candidate locations comes in two
more. Scoring — residents' objects lead —, the diversity rule and the cut happen here, and only the
chosen ones are loaded as cards. A fixed number of queries whatever the size of the city.
"""

import hashlib
from collections import defaultdict
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.domain import interests as rules
from app.domain.enums import AreaKind, Layer, PlaceStatus
from app.domain.geo import BBox
from app.domain.interests import InterestTarget, Profile, Provenance, Topic
from app.models import Area, EventDetails, EventParticipant, Favorite, InterestTag, Place, User
from app.schemas.area import CommunityEventRef
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
    provenance: Provenance = Provenance.COMMUNITY
    discovery: bool = False
    """A little-rated place. Never an area or an event."""
    starts_at: datetime | None = None
    """Events only: among equal scores the sooner comes first."""
    area_kind: AreaKind | None = None
    """Areas only: at most `PER_AREA_KIND` locations of a kind lead."""
    reason_event: CommunityEventRef | None = None
    """The residents' upcoming event the object is recommended for: inside a location, or at a
    place that is its venue."""


@dataclass(frozen=True, slots=True)
class _EventInside:
    match: float
    reasons: list[Topic]
    ref: CommunityEventRef


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


def _grouped(rows: Sequence[Any]) -> tuple[dict[int, dict[Topic, float]], dict[int, Any]]:
    """The tags of every object and its first row."""
    tags: dict[int, dict[Topic, float]] = defaultdict(dict)
    first: dict[int, Any] = {}
    for row in rows:
        tags[row.id][row.topic] = row[-1]
        first.setdefault(row.id, row)
    return tags, first


def _provenance_columns() -> tuple[Any, ...]:
    """What tells a resident's place or event from an imported one, and an imported one with
    something to show from a bare one."""
    return (
        place_queries.community_clause().label("community"),
        (func.length(func.trim(Place.description)) > 0).label("described"),
        Place.cover_url,
        Place.external_image_url,
    )


def _place_provenance(row: Any, usefulness: int | None) -> Provenance:
    return rules.place_provenance(
        community=bool(row.community),
        described=bool(row.described),
        pictured=row.cover_url is not None or row.external_image_url is not None,
        usefulness=usefulness,
    )


def _score_places(
    rows: Sequence[Any],
    profile: Profile,
    quality_of: Callable[[Any], float],
    provenance_of: Callable[[Any], Provenance],
    *,
    discovery_of: Callable[[Any], bool] = lambda row: False,
    hosted: Mapping[int, _EventInside] | None = None,
    untagged: Sequence[Any] = (),
) -> list[Candidate]:
    """`hosted`: the residents' events that fit, by the place that is their venue; such a place
    is scored like a location with one (`untagged`: those of them without a topic of the person)."""
    hosted = hosted or {}
    tags, first = _grouped(rows)
    for row in untagged:
        first.setdefault(row.id, row)
        tags.setdefault(row.id, {})
    candidates = []
    for target_id, object_tags in tags.items():
        row = first[target_id]
        own_match = rules.match(profile, object_tags)
        provenance = provenance_of(row)
        event = hosted.get(target_id)
        if event is not None:
            match, quality = max(own_match, event.match), rules.EVENT_HOST_QUALITY
            reasons = event.reasons if event.match >= own_match else rules.reasons(profile, object_tags)
        else:
            match, quality, reasons = own_match, quality_of(row), rules.reasons(profile, object_tags)
        if match < rules.min_match(provenance):
            continue
        candidates.append(
            Candidate(
                InterestTarget.PLACE,
                target_id,
                row.title,
                match,
                round(rules.score(match, quality, provenance), _SCORE_PRECISION),
                reasons,
                provenance,
                discovery=discovery_of(row),
                starts_at=getattr(row, "starts_at", None),
                reason_event=event.ref if event else None,
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
    """The little-rated ones, residents' first, by how well they fit; equals take turns from day
    to day."""

    def turn(item: Candidate) -> str:
        return hashlib.sha256(f"{today.isoformat()}:{item.target_id}".encode()).hexdigest()

    found = [item for item in ranked if item.discovery]
    return sorted(found, key=lambda item: (*rules.discovery_rank(item.provenance, item.match), turn(item)))


def _not_mine(viewer: User | None) -> list[Any]:
    """Not the person's own and not already in their favourites."""
    if viewer is None:
        return []
    favourites = select(Favorite.place_id).where(Favorite.user_id == viewer.id)
    return [Place.author_id != viewer.id, Place.id.not_in(favourites)]


def _not_by(viewer: User | None) -> list[ColumnElement[bool]]:
    """A person's own event is no news to them."""
    return [] if viewer is None else [Place.author_id != viewer.id]


def _area_in_view(box: BBox | None) -> list[ColumnElement[bool]]:
    if box is None:
        return []
    return [
        Area.min_lat <= box.max_lat,
        Area.max_lat >= box.min_lat,
        Area.min_lng <= box.max_lng,
        Area.max_lng >= box.min_lng,
    ]


def _residents_events(now: datetime) -> list[ColumnElement[bool]]:
    """Upcoming events residents made, open to everyone."""
    return [
        Place.layer == Layer.EVENT,
        Place.status.in_(RECOMMENDED_STATUSES),
        place_queries.community_clause(),
        EventDetails.ends_at >= now,
        EventDetails.is_cancelled.is_(False),
    ]


def _best_events_inside(rows: Sequence[Any], profile: Profile) -> dict[int, _EventInside]:
    """Per host (`row.host_id`: the area or the venue), the residents' upcoming event that fits
    the person best (the sooner of equals)."""
    tags, first = _grouped(rows)
    best: dict[int, tuple[tuple[float, datetime, int], _EventInside]] = {}
    for event_id, event_tags in tags.items():
        row = first[event_id]
        match = rules.match(profile, event_tags)
        if not rules.event_leads(match):
            continue
        key = (-match, row.starts_at, event_id)
        if row.host_id in best and best[row.host_id][0] <= key:
            continue
        ref = CommunityEventRef.of(event_id, row.title, row.starts_at, row.author_id)
        best[row.host_id] = (key, _EventInside(match, rules.reasons(profile, event_tags), ref))
    return {host_id: found for host_id, (_, found) in best.items()}


async def _area_candidates(
    session: AsyncSession, viewer: User | None, profile: Profile, query: RecommendationQuery, now: datetime
) -> list[Candidate]:
    """Locations by their own topics or by a residents' upcoming event inside that fits the person.
    One with nothing residents made inside is bare: it needs a clearly stronger match."""
    in_view = _area_in_view(query.bbox)
    not_mine = [] if viewer is None else [or_(Area.author_id.is_(None), Area.author_id != viewer.id)]
    own_rows = list(
        await session.execute(
            _with_tags(
                select(Area.id, Area.title, Area.interest, Area.kind), InterestTarget.AREA, Area.id, profile
            ).where(*in_view, *not_mine)
        )
    )
    event_rows = list(
        await session.execute(
            _with_tags(
                select(
                    Place.id,
                    Place.title,
                    Place.author_id,
                    Place.area_id.label("host_id"),
                    EventDetails.starts_at,
                    Area.title.label("area_title"),
                    Area.interest,
                    Area.kind,
                ),
                InterestTarget.PLACE,
                Place.id,
                profile,
            )
            .join(EventDetails, EventDetails.place_id == Place.id)
            .join(Area, Area.id == Place.area_id)
            .where(*_residents_events(now), *_not_by(viewer), *in_view, *not_mine)
        )
    )
    own_tags, own_first = _grouped(own_rows)
    events = _best_events_inside(event_rows, profile)
    # Title, interest and kind of every candidate location, also of one found by its event alone.
    known: dict[int, tuple[str, int, AreaKind]] = {
        row.host_id: (row.area_title, row.interest, row.kind) for row in event_rows
    }
    known.update({area_id: (row.title, row.interest, row.kind) for area_id, row in own_first.items()})
    area_ids = set(own_tags) | set(events)
    places_inside = await areas.community_places(session, area_ids)
    events_inside = await areas.community_events(session, area_ids, now)

    candidates = []
    for area_id in area_ids:
        title, interest, kind = known[area_id]
        tags = own_tags.get(area_id, {})
        own_match = rules.match(profile, tags)
        community = events_inside.get(area_id)
        provenance = rules.area_provenance(places_inside.get(area_id, 0), community.count if community else 0)
        event = events.get(area_id)
        if event is not None:
            match, quality = max(own_match, event.match), rules.EVENT_HOST_QUALITY
            reasons = event.reasons if event.match >= own_match else rules.reasons(profile, tags)
        else:
            match, quality, reasons = own_match, rules.area_quality(interest), rules.reasons(profile, tags)
        if match < rules.min_match(provenance):
            continue
        candidates.append(
            Candidate(
                InterestTarget.AREA,
                area_id,
                title,
                match,
                round(rules.score(match, quality, provenance), _SCORE_PRECISION),
                reasons,
                provenance,
                area_kind=kind,
                reason_event=event.ref if event else None,
            )
        )
    return candidates


async def _venues_of_events(
    session: AsyncSession, viewer: User | None, profile: Profile, now: datetime
) -> dict[int, _EventInside]:
    """Places that are the venue of a residents' upcoming event that fits the person."""
    rows = await session.execute(
        _with_tags(
            select(
                Place.id,
                Place.title,
                Place.author_id,
                EventDetails.venue_place_id.label("host_id"),
                EventDetails.starts_at,
            ),
            InterestTarget.PLACE,
            Place.id,
            profile,
        )
        .join(EventDetails, EventDetails.place_id == Place.id)
        .where(*_residents_events(now), EventDetails.venue_place_id.is_not(None), *_not_by(viewer))
    )
    return _best_events_inside(list(rows), profile)


async def _map_candidates(
    session: AsyncSession, viewer: User | None, profile: Profile, query: RecommendationQuery, now: datetime
) -> list[Candidate]:
    """Locations and sights; a sight that is the venue of a residents' event that fits is raised
    like a location with one."""
    places = select(
        Place.id,
        Place.title,
        Place.trust_score,
        Place.rating_avg,
        Place.rating_count,
        *_provenance_columns(),
    ).where(Place.layer == Layer.TOURISM, Place.status.in_(RECOMMENDED_STATUSES), *_not_mine(viewer))
    if query.bbox is not None:
        box = query.bbox
        places = places.where(
            Place.lat.between(box.min_lat, box.max_lat), Place.lng.between(box.min_lng, box.max_lng)
        )
    found_areas = await _area_candidates(session, viewer, profile, query, now)
    venues = await _venues_of_events(session, viewer, profile, now)
    place_rows = list(await session.execute(_with_tags(places, InterestTarget.PLACE, Place.id, profile)))
    untagged = set(venues) - {row.id for row in place_rows}
    venue_rows = list(await session.execute(places.where(Place.id.in_(untagged)))) if untagged else []
    useful = await place_quality.usefulness_for(session, {row.id for row in [*place_rows, *venue_rows]})
    found_places = _score_places(
        place_rows,
        profile,
        lambda row: rules.with_usefulness(
            rules.place_quality(row.trust_score, row.rating_avg), useful.get(row.id)
        ),
        lambda row: _place_provenance(row, useful.get(row.id)),
        discovery_of=lambda row: rules.is_discovery(row.rating_count),
        hosted=venues,
        untagged=venue_rows,
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
            select(
                Place.id,
                Place.title,
                Place.status,
                Place.external_source,
                EventDetails.starts_at,
                *_provenance_columns(),
            ),
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
    return _score_places(
        rows,
        profile,
        lambda row: rules.with_usefulness(
            rules.event_quality(row.external_source is not None, row.status is PlaceStatus.VERIFIED),
            useful.get(row.id),
        ),
        lambda row: _place_provenance(row, useful.get(row.id)),
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
        candidates = await _map_candidates(session, viewer, profile, query, now)
    ranked = _rank(candidates)
    chosen = rules.arrange(
        ranked,
        lambda item: item.reasons[0],
        _discoveries(ranked, now.date()),
        query.limit,
        lambda item: item.area_kind,
        lambda item: item.provenance is Provenance.COMMUNITY,
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
            reason_event=item.reason_event,
        )
        for item in chosen
    ]
    return Recommendations(personalized=True, items=[item for item in items if item.area or item.place])
