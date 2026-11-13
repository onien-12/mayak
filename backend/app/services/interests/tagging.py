"""Rule tags of places and areas (SPEC §23.2): category or kind, the keyword lexicon, and what an
area inherits from the places inside it.

Every object has a state with the fingerprint of the text that was classified. An edited object
(new fingerprint) loses its rule and LLM tags and is tagged by the rules again, which also queues
it for the LLM; an unchanged one is never classified twice. Called on create / edit / import and
for everything unclassified at start-up. Issues carry no topics.
"""

from collections import defaultdict
from collections.abc import Collection, Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import Row, and_, delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import interests as rules
from app.domain.areas import COUNTED_LAYERS
from app.domain.enums import PUBLIC_STATUSES, Layer
from app.domain.interests import InterestTarget, TagBasis, TagMethod, Topic
from app.models import Area, Category, InterestTag, InterestTagState, Place

CHUNK = 500
"""Ids per `IN (…)`: well below SQLite's limit of bound parameters."""


@dataclass(frozen=True, slots=True)
class Subject:
    """What the rules (and the LLM) read about one object."""

    target_type: InterestTarget
    target_id: int
    fingerprint: str
    category_topics: tuple[Topic, ...]
    texts: tuple[str, ...]


def _chunks(ids: Sequence[int]) -> Iterable[list[int]]:
    for start in range(0, len(ids), CHUNK):
        yield list(ids[start : start + CHUNK])


def place_subject(row: Row[Any]) -> Subject:
    tags = " ".join(row.tags or [])
    return Subject(
        InterestTarget.PLACE,
        row.id,
        rules.fingerprint(row.category_slug, row.title, row.description, tags),
        rules.place_category_topics(row.category_slug),
        (row.title, tags, row.description or ""),
    )


def area_subject(row: Row[Any]) -> Subject:
    return Subject(
        InterestTarget.AREA,
        row.id,
        rules.fingerprint(row.kind, row.title, row.description),
        rules.area_kind_topics(row.kind),
        (row.title, row.description or ""),
    )


def place_columns() -> Any:
    """Everything a place subject needs; issues are never tagged."""
    return (
        select(Place.id, Place.title, Place.description, Place.tags, Category.slug.label("category_slug"))
        .join(Category, Category.id == Place.category_id)
        .where(Place.layer != Layer.ISSUE)
    )


def area_columns() -> Any:
    return select(Area.id, Area.title, Area.description, Area.kind)


async def _place_subjects(session: AsyncSession, place_ids: Collection[int] | None) -> list[Subject]:
    if place_ids is None:
        return [place_subject(row) for row in await session.execute(place_columns())]
    subjects: list[Subject] = []
    for chunk in _chunks(list(place_ids)):
        rows = await session.execute(place_columns().where(Place.id.in_(chunk)))
        subjects += [place_subject(row) for row in rows]
    return subjects


async def _area_subjects(session: AsyncSession, area_ids: Collection[int] | None) -> list[Subject]:
    statement = area_columns()
    if area_ids is not None:
        statement = statement.where(Area.id.in_(list(area_ids)))
    return [area_subject(row) for row in await session.execute(statement)]


async def _states(
    session: AsyncSession, target_type: InterestTarget, target_ids: Collection[int] | None
) -> dict[int, InterestTagState]:
    statement = select(InterestTagState).where(InterestTagState.target_type == target_type)
    if target_ids is None:
        return {state.target_id: state for state in await session.scalars(statement)}
    states: dict[int, InterestTagState] = {}
    for chunk in _chunks(list(target_ids)):
        for state in await session.scalars(statement.where(InterestTagState.target_id.in_(chunk))):
            states[state.target_id] = state
    return states


def _rule_rows(subject: Subject, *, with_keywords: bool) -> list[dict[str, Any]]:
    bases = [(TagBasis.CATEGORY, rules.category_tags(subject.category_topics))]
    if with_keywords:
        bases.append((TagBasis.KEYWORD, rules.keyword_tags(*subject.texts)))
    return [
        {
            "target_type": subject.target_type,
            "target_id": subject.target_id,
            "topic": topic,
            "weight": weight,
            "method": rules.BASIS_METHOD[basis],
            "basis": basis,
        }
        for basis, tags in bases
        for topic, weight in tags.items()
    ]


async def delete_tags(
    session: AsyncSession, target_type: InterestTarget, target_ids: Sequence[int], bases: Collection[TagBasis]
) -> None:
    for chunk in _chunks(target_ids):
        await session.execute(
            delete(InterestTag).where(
                InterestTag.target_type == target_type,
                InterestTag.target_id.in_(chunk),
                InterestTag.basis.in_(list(bases)),
            )
        )


async def insert_tags(session: AsyncSession, rows: list[dict[str, Any]]) -> None:
    if rows:
        await session.execute(insert(InterestTag), rows)


async def _apply_rules(
    session: AsyncSession,
    target_type: InterestTarget,
    subjects: Sequence[Subject],
    states: dict[int, InterestTagState],
    now: datetime,
) -> int:
    """Tag the stale subjects; returns how many were (re)tagged."""
    reset: list[Subject] = []
    rerun: dict[TagMethod, list[Subject]] = defaultdict(list)
    for subject in subjects:
        state = states.get(subject.target_id)
        if state is None or state.fingerprint != subject.fingerprint:
            reset.append(subject)
        elif state.rules_version != rules.RULES_VERSION:
            rerun[state.method].append(subject)
    # A changed text invalidates everything classified before, LLM tags included.
    await delete_tags(
        session,
        target_type,
        [subject.target_id for subject in reset],
        (TagBasis.CATEGORY, TagBasis.KEYWORD, TagBasis.LLM),
    )
    # New rules for an unchanged text: LLM tags stay, and keep replacing the keyword tags.
    await delete_tags(
        session,
        target_type,
        [subject.target_id for subject in rerun[TagMethod.RULE]],
        (TagBasis.CATEGORY, TagBasis.KEYWORD),
    )
    await delete_tags(
        session, target_type, [subject.target_id for subject in rerun[TagMethod.LLM]], (TagBasis.CATEGORY,)
    )
    rows: list[dict[str, Any]] = []
    for subject in [*reset, *rerun[TagMethod.RULE]]:
        rows += _rule_rows(subject, with_keywords=True)
    for subject in rerun[TagMethod.LLM]:
        rows += _rule_rows(subject, with_keywords=False)
    await insert_tags(session, rows)

    for subject in reset:
        state = states.get(subject.target_id)
        if state is None:
            state = InterestTagState(target_type=target_type, target_id=subject.target_id)
            session.add(state)
            states[subject.target_id] = state
        state.fingerprint = subject.fingerprint
        state.method = TagMethod.RULE
        state.llm_attempts = 0
        state.rules_version = rules.RULES_VERSION
        state.classified_at = now
    for subject in [*rerun[TagMethod.RULE], *rerun[TagMethod.LLM]]:
        states[subject.target_id].rules_version = rules.RULES_VERSION
    await session.flush()
    return len(reset) + len(rerun[TagMethod.RULE]) + len(rerun[TagMethod.LLM])


async def refresh_inside(session: AsyncSession, area_ids: Collection[int] | None = None) -> None:
    """What areas inherit from their public infrastructure and tourism places; writes only changes."""
    if area_ids is not None and not area_ids:
        return
    carried = and_(
        InterestTag.target_type == InterestTarget.PLACE,
        InterestTag.target_id == Place.id,
        InterestTag.weight >= rules.SHOWN_MIN_WEIGHT,
    )
    members_query = (
        select(Place.area_id, Place.id, InterestTag.topic)
        .outerjoin(InterestTag, carried)
        .where(
            Place.area_id.is_not(None),
            Place.status.in_(PUBLIC_STATUSES),
            Place.layer.in_(COUNTED_LAYERS),
        )
    )
    existing_query = select(InterestTag.target_id, InterestTag.topic, InterestTag.weight).where(
        InterestTag.target_type == InterestTarget.AREA, InterestTag.basis == TagBasis.INSIDE
    )
    if area_ids is not None:
        members_query = members_query.where(Place.area_id.in_(list(area_ids)))
        existing_query = existing_query.where(InterestTag.target_id.in_(list(area_ids)))

    members: dict[int, dict[int, set[Topic]]] = defaultdict(lambda: defaultdict(set))
    for area_id, place_id, topic in await session.execute(members_query):
        topics = members[area_id][place_id]
        if topic is not None:
            topics.add(topic)
    wanted = {area_id: rules.inside_tags(list(places.values())) for area_id, places in members.items()}
    existing: dict[int, dict[Topic, float]] = defaultdict(dict)
    for area_id, topic, weight in await session.execute(existing_query):
        existing[area_id][topic] = weight

    changed = [
        area_id
        for area_id in wanted.keys() | existing.keys()
        if wanted.get(area_id, {}) != existing.get(area_id, {})
    ]
    await delete_tags(session, InterestTarget.AREA, changed, (TagBasis.INSIDE,))
    await insert_tags(
        session,
        [
            {
                "target_type": InterestTarget.AREA,
                "target_id": area_id,
                "topic": topic,
                "weight": weight,
                "method": TagMethod.RULE,
                "basis": TagBasis.INSIDE,
            }
            for area_id in changed
            for topic, weight in wanted.get(area_id, {}).items()
        ],
    )


async def tag_places(
    session: AsyncSession,
    place_ids: Collection[int],
    now: datetime,
    *,
    also_areas: Collection[int | None] = (),
) -> None:
    """After a place was created or edited: its rule tags and what its area inherits."""
    await session.flush()
    subjects = await _place_subjects(session, place_ids)
    states = await _states(session, InterestTarget.PLACE, place_ids)
    await _apply_rules(session, InterestTarget.PLACE, subjects, states, now)
    area_ids = set(
        await session.scalars(
            select(Place.area_id).where(Place.id.in_(list(place_ids)), Place.area_id.is_not(None))
        )
    )
    await refresh_inside(session, area_ids | {area_id for area_id in also_areas if area_id is not None})


async def tag_areas(session: AsyncSession, area_ids: Collection[int], now: datetime) -> None:
    """After an area was created or edited (its places may have been re-attached too)."""
    await session.flush()
    subjects = await _area_subjects(session, area_ids)
    states = await _states(session, InterestTarget.AREA, area_ids)
    await _apply_rules(session, InterestTarget.AREA, subjects, states, now)
    await refresh_inside(session, None)


async def tag_stale(session: AsyncSession, now: datetime) -> int:
    """Everything new, edited or tagged by older rules; at start-up and after imports."""
    await session.flush()
    tagged = 0
    for target_type, subjects in (
        (InterestTarget.PLACE, await _place_subjects(session, None)),
        (InterestTarget.AREA, await _area_subjects(session, None)),
    ):
        tagged += await _apply_rules(
            session, target_type, subjects, await _states(session, target_type, None), now
        )
    await refresh_inside(session, None)
    return tagged
