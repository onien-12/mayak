"""City statistics for the public dashboard.

What residents did is counted apart from what was imported: thousands of OpenStreetMap objects
and the VL.ru afisha must not read as "verified by residents" or as a spike of new places.
"""

from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.domain.enums import (
    PUBLIC_ROUTE_STATUSES,
    PUBLIC_STATUSES,
    AiTarget,
    ExternalSourceId,
    IssueStage,
    Layer,
    PlaceStatus,
    RouteVisibility,
    VoteKind,
)
from app.models import Category, EventDetails, IssueDetails, Place, Route, User, Vote
from app.schemas.stats import (
    ActivityDay,
    CategoryCount,
    LayerCount,
    SourceCount,
    StageCount,
    Stats,
    StatusCount,
    Totals,
)
from app.schemas.user import UserBrief
from app.services import quiet_holds
from app.services.mappers import EXTERNAL_SOURCE_LABELS
from app.services.quests import lookup as quest_lookup

ACTIVITY_DAYS = 30
TOP_CATEGORIES = 10
TOP_CONTRIBUTORS = 5

_IS_PUBLIC = Place.status.in_(PUBLIC_STATUSES)
_IS_COMMUNITY = Place.external_source.is_(None)


async def _count(session: AsyncSession, statement: object) -> int:
    return await session.scalar(statement) or 0


async def _place_counts(
    session: AsyncSession,
) -> dict[tuple[ExternalSourceId | None, Layer, PlaceStatus], int]:
    """Every public place in one grouped query: by source, layer and status."""
    rows = await session.execute(
        select(Place.external_source, Place.layer, Place.status, func.count())
        .where(_IS_PUBLIC)
        .group_by(Place.external_source, Place.layer, Place.status)
    )
    return {(source, layer, status): count for source, layer, status, count in rows}


async def _split_counts(session: AsyncSession, statement: object) -> tuple[int, int]:
    """`(all, community)` of a grouped-by-"is community" count."""
    counts = dict((await session.execute(statement)).all())
    return sum(counts.values()), counts.get(True, 0)


async def _confirmed_imported(session: AsyncSession) -> int:
    return await _count(
        session,
        select(func.count(Vote.place_id.distinct()))
        .join(Place, Place.id == Vote.place_id)
        .where(_IS_PUBLIC, ~_IS_COMMUNITY, Vote.kind == VoteKind.PRESENT),
    )


async def _issue_counts(session: AsyncSession) -> dict[tuple[bool, IssueStage], int]:
    rows = await session.execute(
        select(_IS_COMMUNITY, IssueDetails.stage, func.count())
        .join(Place, Place.id == IssueDetails.place_id)
        .where(_IS_PUBLIC)
        .group_by(_IS_COMMUNITY, IssueDetails.stage)
    )
    return {(bool(community), stage): count for community, stage, count in rows}


async def _totals(
    session: AsyncSession,
    places: dict[tuple[ExternalSourceId | None, Layer, PlaceStatus], int],
    issues: dict[tuple[bool, IssueStage], int],
    now: datetime,
) -> Totals:
    community = {key: count for key, count in places.items() if key[0] is None}
    events_upcoming, events_upcoming_community = await _split_counts(
        session,
        select(_IS_COMMUNITY, func.count())
        .join(EventDetails, EventDetails.place_id == Place.id)
        .where(_IS_PUBLIC, EventDetails.ends_at >= now, EventDetails.is_cancelled.is_(False))
        .group_by(_IS_COMMUNITY),
    )
    open_issues = {key: count for key, count in issues.items() if key[1] is not IssueStage.RESOLVED}
    return Totals(
        places=sum(community.values()),
        verified_places=sum(
            count for (_, _, status), count in community.items() if status is PlaceStatus.VERIFIED
        ),
        imported_places=sum(places.values()) - sum(community.values()),
        confirmed_imported=await _confirmed_imported(session),
        events_upcoming=events_upcoming,
        events_upcoming_community=events_upcoming_community,
        issues_open=sum(open_issues.values()),
        issues_open_community=sum(count for (is_community, _), count in open_issues.items() if is_community),
        issues_resolved=sum(count for (_, stage), count in issues.items() if stage is IssueStage.RESOLVED),
        routes=await _count(
            session,
            select(func.count())
            .select_from(Route)
            .where(
                Route.visibility == RouteVisibility.PUBLIC,
                Route.status.in_(PUBLIC_ROUTE_STATUSES),
                ~quest_lookup.is_quest_clause(),
            ),
        ),
        users=await _count(session, select(func.count()).select_from(User).where(User.is_system.is_(False))),
        votes=await _count(session, select(func.count()).select_from(Vote)),
    )


def _imported_by_source(
    places: dict[tuple[ExternalSourceId | None, Layer, PlaceStatus], int],
) -> list[SourceCount]:
    counts: dict[ExternalSourceId, int] = defaultdict(int)
    for (source, _, _), count in places.items():
        if source is not None:
            counts[source] += count
    return [
        SourceCount(source=source, label=EXTERNAL_SOURCE_LABELS[source], count=counts[source])
        for source in ExternalSourceId
    ]


def _by_layer(places: dict[tuple[ExternalSourceId | None, Layer, PlaceStatus], int]) -> list[LayerCount]:
    counts: dict[Layer, int] = defaultdict(int)
    for (source, layer, _), count in places.items():
        if source is None:
            counts[layer] += count
    return [LayerCount(layer=layer, count=counts[layer]) for layer in Layer]


def _status_breakdown(
    places: dict[tuple[ExternalSourceId | None, Layer, PlaceStatus], int],
) -> list[StatusCount]:
    counts: dict[PlaceStatus, int] = defaultdict(int)
    for (source, _, status), count in places.items():
        if source is None:
            counts[status] += count
    return [StatusCount(status=status, count=counts[status]) for status in PUBLIC_STATUSES]


async def _top_categories(session: AsyncSession) -> list[CategoryCount]:
    rows = await session.execute(
        select(Category.id, Category.name, Category.layer, func.count().label("places"))
        .join(Place, Place.category_id == Category.id)
        .where(_IS_PUBLIC, _IS_COMMUNITY)
        .group_by(Category.id)
        .order_by(func.count().desc(), Category.id)
        .limit(TOP_CATEGORIES)
    )
    return [
        CategoryCount(category_id=row.id, name=row.name, layer=row.layer, count=row.places) for row in rows
    ]


def _issues_by_stage(issues: dict[tuple[bool, IssueStage], int]) -> list[StageCount]:
    counts: dict[IssueStage, int] = defaultdict(int)
    for (_, stage), count in issues.items():
        counts[stage] += count
    return [StageCount(stage=stage, count=counts[stage]) for stage in IssueStage]


async def _daily_counts(
    session: AsyncSession, created_at: object, since: datetime, *conditions: object
) -> dict[str, int]:
    day = func.date(created_at)
    rows = await session.execute(
        select(day, func.count()).where(created_at >= since, *conditions).group_by(day)
    )
    return dict(rows.all())


async def _activity(session: AsyncSession, now: datetime) -> list[ActivityDay]:
    """Residents' places and votes per UTC day for the last 30 days, without gaps; places still
    screened or held are not counted (SPEC §24.1)."""
    first_day = (now - timedelta(days=ACTIVITY_DAYS - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    not_held = Place.id.not_in(quiet_holds.active_ids(AiTarget.PLACE))
    places = await _daily_counts(session, Place.created_at, first_day, _IS_COMMUNITY, not_held)
    votes = await _daily_counts(session, Vote.created_at, first_day)
    days = [(first_day + timedelta(days=offset)).date().isoformat() for offset in range(ACTIVITY_DAYS)]
    return [ActivityDay(date=day, places=places.get(day, 0), votes=votes.get(day, 0)) for day in days]


async def _top_contributors(session: AsyncSession) -> list[UserBrief]:
    rows = await session.scalars(
        select(User)
        .where(User.is_system.is_(False))
        .order_by(User.reputation.desc(), User.id)
        .limit(TOP_CONTRIBUTORS)
    )
    return [UserBrief.model_validate(row) for row in rows]


async def collect(session: AsyncSession) -> Stats:
    now = utcnow()
    places = await _place_counts(session)
    issues = await _issue_counts(session)
    return Stats(
        totals=await _totals(session, places, issues, now),
        imported_by_source=_imported_by_source(places),
        by_layer=_by_layer(places),
        top_categories=await _top_categories(session),
        status_breakdown=_status_breakdown(places),
        issues_by_stage=_issues_by_stage(issues),
        activity=await _activity(session, now),
        top_contributors=await _top_contributors(session),
    )
