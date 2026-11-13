"""Seed runner: replays a year of city life through the real services (SPEC §10).

Everything is deterministic apart from "now": the same data, voters and time offsets every run.
Votes, reviews, complaints and moderation decisions go through the same functions the API uses,
so statuses, trust scores, history, reputation events and notifications are produced by the
actual business rules rather than written by hand.
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.clock import utcnow
from app.core.config import Settings
from app.domain import attributes as attribute_rules
from app.domain import geo
from app.domain.enums import (
    Layer,
    PathMode,
    PathSource,
    ReputationReason,
    VoteKind,
)
from app.domain.geo import LngLat
from app.domain.reputation import RULES
from app.models import (
    Category,
    Collection,
    CollectionItem,
    Favorite,
    MapNote,
    Notification,
    ReputationEvent,
    RouteSave,
    Subscription,
    User,
    UserInterest,
    UserInterestSettings,
)
from app.schemas.area import AreaInput
from app.schemas.feedback import ReviewIn
from app.schemas.place import EventInput, IssueInput, PlaceInput, RepeatInput
from app.schemas.route import RouteInput, StopInput
from app.seed import areas as area_data
from app.seed import catalog, scenarios
from app.seed import notes as notes_data
from app.seed import outages as outages_data
from app.seed import routes as route_data
from app.seed.context import SeedContext
from app.seed.lookup import ALL_PLACES, seed_objects
from app.seed.specs import SeedEvent, SeedPlace, SeedReview, SeedRoute, SeedStop
from app.seed.users import DEMO_INTERESTS, DEMO_PASSWORD, USERS
from app.services import areas, comments, enrichment, places, reviews, routes, uploads, users, verification
from app.services import events as event_service
from app.services.osm import importer as osm_importer
from app.services.osm import snapshot as osm_snapshot
from app.services.route_planner import PlannedPath, straight_plan
from app.services.vlru import outages_importer
from app.services.vlru.outages_importer import Outage
from app.services.wikimedia import apply as wikimedia_apply
from app.services.wikimedia import snapshot as wikimedia_snapshot
from app.services.wikivoyage import importer as wikivoyage_importer
from app.services.wikivoyage import snapshot as wikivoyage_snapshot

logger = logging.getLogger(__name__)

SEED_DIR = Path(__file__).resolve().parent
SEED_MEDIA_DIR = SEED_DIR / "media"
ROUTE_PATHS_FILE = SEED_DIR / "route_paths.json"
AREA_POLYGONS_FILE = SEED_DIR / "area_polygons.json"
OSM_SNAPSHOT_FILE = SEED_DIR / "osm_snapshot.json"
WIKIVOYAGE_SNAPSHOT_FILE = SEED_DIR / "wikivoyage_snapshot.json"
WIKIMEDIA_SNAPSHOT_FILE = SEED_DIR / "wikimedia_snapshot.json"
AREAS_AGE_DAYS = 400

CITY_UTC_OFFSET = timedelta(hours=10)
WEEK_DAYS = 7
FIRST_VOTE_DELAY = 0.9
"""The first vote lands when 10 % of the place's age has passed."""
LEGACY_PERIOD_SHARE = 0.05
"""Pre-seed reputation is dated within the first 5 % of the account's lifetime."""
READ_AFTER = timedelta(days=2)
HOME_SET_AFTER_DAYS = 10
NEIGHBOURHOOD_M = 1500.0
"""Seeded voters confirm places of their own neighbourhood on the spot (geo-confirmed votes)."""

LEGACY_REASONS: tuple[ReputationReason, ...] = (
    ReputationReason.PLACE_VERIFIED,
    ReputationReason.VOTE_CAST,
    ReputationReason.RESPECT_RECEIVED,
    ReputationReason.ROUTE_PUBLISHED,
    ReputationReason.REVIEW_WRITTEN,
    ReputationReason.PLACE_PRELIMINARY,
)

DEMO_FAVORITES = (
    "tokarevsky_mayak",
    "orlinoe_gnezdo",
    "basketball_dynamo",
    "supra",
    "toilet_sport_nab",
    "millionka",
)
DEMO_SUBSCRIPTIONS: tuple[tuple[str, float, float, int, tuple[Layer, ...]], ...] = (
    ("Центр", 43.1160, 131.8860, 1500, (Layer.EVENT, Layer.ISSUE, Layer.INFRASTRUCTURE)),
    ("Эгершельд, работа", 43.0950, 131.8620, 2000, (Layer.ISSUE, Layer.EVENT)),
)
SUBSCRIPTIONS_AGE_DAYS = 6
RESPECTS: tuple[tuple[str, str, float], ...] = (
    ("oleg", "anya", 48),
    ("anya", "oleg", 47),
    ("vera", "anya", 21),
    ("anya", "vera", 20),
    ("kostya", "anya", 3),
    ("anya", "kostya", 30),
    ("lena", "vera", 90),
    ("igor", "kostya", 12),
    ("oleg", "vera", 140),
)


@dataclass(frozen=True, slots=True)
class PlannedVote:
    at: datetime
    place_key: str
    voter: str
    kind: VoteKind
    is_near: bool


async def seed_if_empty(session: AsyncSession, settings: Settings) -> bool:
    """Seed a fresh database; returns False when it already has users."""
    if await session.scalar(select(func.count()).select_from(User)):
        return False
    await run_seed(session, settings)
    return True


async def run_seed(session: AsyncSession, settings: Settings) -> None:
    ctx = SeedContext(session=session, settings=settings, now=utcnow())
    await _seed_catalog(ctx)
    await _seed_users(ctx)
    await _seed_interests(ctx)
    await _seed_areas(ctx)
    await _seed_places(ctx)
    await _seed_votes(ctx)
    await _seed_feedback(ctx)
    await _seed_participants(ctx)
    await scenarios.run(ctx)
    await _seed_routes(ctx)
    await _seed_social(ctx)
    await _seed_notes(ctx)
    await _seed_outages(ctx)
    await _seed_osm(ctx)
    await _seed_wikivoyage(ctx)
    await _seed_wikimedia(ctx)
    await scenarios.add_ai_reviews(ctx)
    await _mark_old_notifications_read(ctx)
    await session.commit()
    await verification.refresh_trust_scores(session, ctx.now)
    await areas.refresh_all(session, ctx.now)
    await session.commit()
    logger.info(
        "Seed complete: %d places, %d routes, %d users", len(ctx.places), len(ctx.routes), len(ctx.users)
    )


async def _seed_catalog(ctx: SeedContext) -> None:
    for slug, layer, group, name, icon, fields in catalog.CATEGORIES:
        category = Category(slug=slug, layer=layer, group=group, name=name, icon=icon, fields=fields)
        ctx.session.add(category)
        ctx.categories[slug] = category
    await ctx.session.flush()


def _legacy_reasons(total: int) -> list[ReputationReason]:
    """Split pre-seed reputation into believable events, cycling through the rule table."""
    reasons: list[ReputationReason] = []
    remaining = total
    while remaining > 0:
        affordable = [reason for reason in LEGACY_REASONS if RULES[reason].delta <= remaining]
        reason = affordable[len(reasons) % len(affordable)]
        reasons.append(reason)
        remaining -= RULES[reason].delta
    return reasons


async def _seed_users(ctx: SeedContext) -> None:
    """Demo accounts with the reputation they earned before the seeded year, backed by events."""
    password_hash = security.hash_password(DEMO_PASSWORD)
    for spec in USERS:
        joined_at = ctx.ago(spec.joined_days_ago)
        user = User(
            email=spec.email,
            username=spec.username,
            display_name=spec.display_name,
            password_hash=password_hash,
            role=spec.role,
            reputation=spec.reputation,
            bio=spec.bio,
            created_at=joined_at,
        )
        ctx.session.add(user)
        ctx.users[spec.username] = user
    await ctx.session.flush()

    for spec in USERS:
        reasons = _legacy_reasons(spec.reputation)
        legacy_period = timedelta(days=spec.joined_days_ago * LEGACY_PERIOD_SHARE)
        for index, reason in enumerate(reasons, start=1):
            ctx.session.add(
                ReputationEvent(
                    user_id=ctx.users[spec.username].id,
                    delta=RULES[reason].delta,
                    reason=reason,
                    message=RULES[reason].message,
                    created_at=ctx.ago(spec.joined_days_ago) + legacy_period * index / len(reasons),
                )
            )
    for spec in USERS:
        if spec.home is not None:
            lat, lng, label = spec.home
            set_at = ctx.ago(spec.joined_days_ago - HOME_SET_AFTER_DAYS)
            await users.apply_home(ctx.session, ctx.users[spec.username], lat, lng, label, set_at)
    demo = ctx.users["anya"]
    for title, lat, lng, radius_m, layers in DEMO_SUBSCRIPTIONS:
        ctx.session.add(
            Subscription(
                user_id=demo.id,
                title=title,
                lat=lat,
                lng=lng,
                radius_m=radius_m,
                layers=[layer.value for layer in layers],
                created_at=ctx.ago(SUBSCRIPTIONS_AGE_DAYS),
            )
        )


def load_area_outlines() -> dict[str, dict[str, Any]]:
    if not AREA_POLYGONS_FILE.exists():
        return {}
    return json.loads(AREA_POLYGONS_FILE.read_text(encoding="utf-8"))["areas"]


async def _seed_interests(ctx: SeedContext) -> None:
    """The demo accounts' chosen topics; their learned affinity starts empty."""
    for username, topics in DEMO_INTERESTS.items():
        user = ctx.users[username]
        for topic in topics:
            ctx.session.add(
                UserInterest(user_id=user.id, topic=topic, chosen=True, affinity=0.0, updated_at=ctx.now)
            )
        ctx.session.add(UserInterestSettings(user_id=user.id, onboarded_at=ctx.now))
    await ctx.session.flush()


async def _seed_areas(ctx: SeedContext) -> None:
    """Locations come first so that every seeded place is attached by the automatic rule."""
    outlines = load_area_outlines()
    for spec in area_data.AREAS:
        lat, lng, radius_m = spec.fallback_circle
        outline = outlines.get(spec.key)
        payload = AreaInput(
            title=spec.title,
            kind=spec.kind,
            description=spec.description,
            geometry=outline["geometry"] if outline else None,
            lat=lat,
            lng=lng,
            radius_m=radius_m,
        )
        created_at = ctx.ago(AREAS_AGE_DAYS)
        ctx.areas[spec.key] = await areas.insert_area(
            ctx.session, None, payload, areas.build_territory(payload), created_at
        )


def _weekend_start(now: datetime, weekday: int, local_hour: int) -> datetime:
    """The next given weekday at `local_hour` Vladivostok time, strictly in the future."""
    local_now = now + CITY_UTC_OFFSET
    candidate = local_now.replace(hour=local_hour, minute=0, second=0, microsecond=0)
    candidate += timedelta(days=(weekday - local_now.weekday()) % WEEK_DAYS)
    if candidate <= local_now:
        candidate += timedelta(days=WEEK_DAYS)
    return candidate - CITY_UTC_OFFSET


def _event_input(ctx: SeedContext, event: SeedEvent) -> EventInput:
    if event.weekend_day is not None:
        starts_at = _weekend_start(ctx.now, event.weekend_day, event.local_hour)
    else:
        starts_at = (ctx.now + timedelta(hours=event.starts_in_hours)).replace(
            minute=0, second=0, microsecond=0
        )
    return EventInput(
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=event.duration_hours),
        capacity=event.capacity,
        price=event.price,
        age_limit=event.age_limit,
        registration_url=event.registration_url,
        contact=event.contact,
        is_meetup=event.is_meetup,
        venue_place_id=ctx.places[event.venue].id if event.venue else None,
        repeat=RepeatInput(interval_days=WEEK_DAYS, count=event.repeat_weeks) if event.repeat_weeks else None,
    )


async def _seed_place(ctx: SeedContext, spec: SeedPlace) -> None:
    author = ctx.users[spec.author]
    category = ctx.categories[spec.category]
    created_at = ctx.ago(spec.age_days)
    payload = PlaceInput(
        layer=category.layer,
        category_id=category.id,
        title=spec.title,
        description=spec.description,
        lat=spec.lat,
        lng=spec.lng,
        address=spec.address,
        tags=list(spec.tags),
        tips=spec.tips,
        event=_event_input(ctx, spec.event) if spec.event else None,
        issue=IssueInput(severity=spec.issue.severity, radius_m=spec.issue.radius_m) if spec.issue else None,
    )
    photos = []
    photo_file = SEED_MEDIA_DIR / f"{spec.key}.jpg"
    if photo_file.exists():
        photos.append(
            await uploads.store_image(
                ctx.session, author, photo_file.read_bytes(), ctx.settings.media_dir, created_at
            )
        )
    ctx.places[spec.key] = await places.publish_place(
        ctx.session,
        author,
        category,
        payload,
        attributes=attribute_rules.coerce_attributes(category.fields, spec.attributes),
        photos=photos,
        now=created_at,
    )


async def _seed_places(ctx: SeedContext) -> None:
    """Oldest first, so ids grow with time; venues are created before the events held there."""
    for spec in sorted(ALL_PLACES, key=lambda item: -item.age_days):
        await _seed_place(ctx, spec)


def _planned_votes(ctx: SeedContext, spec: SeedPlace) -> list[PlannedVote]:
    ballots = [
        *((name, VoteKind.PRESENT) for name in spec.present.split()),
        *((name, VoteKind.UNCLEAR) for name in spec.unclear.split()),
        *((name, VoteKind.ABSENT) for name in spec.absent.split()),
    ]
    first_days_ago = spec.age_days * FIRST_VOTE_DELAY
    step = (first_days_ago - spec.last_vote_days_ago) / max(len(ballots) - 1, 1)
    planned: list[PlannedVote] = []
    for index, (voter, kind) in enumerate(ballots):
        days_ago = spec.last_vote_days_ago if len(ballots) == 1 else first_days_ago - step * index
        if voter == spec.author or days_ago >= _joined_days_ago(voter) or days_ago >= spec.age_days:
            raise ValueError(
                f"seed vote of {voter!r} on {spec.key!r} is impossible at {days_ago:.1f} days ago"
            )
        is_near = kind is VoteKind.PRESENT and (index % 2 == 0 or _lives_near(voter, spec))
        planned.append(PlannedVote(ctx.ago(days_ago), spec.key, voter, kind, is_near))
    return planned


def _lives_near(username: str, spec: SeedPlace) -> bool:
    home = next(user.home for user in USERS if user.username == username)
    return home is not None and geo.haversine_m(home[0], home[1], spec.lat, spec.lng) <= NEIGHBOURHOOD_M


def _joined_days_ago(username: str) -> int:
    return next(user.joined_days_ago for user in USERS if user.username == username)


async def _seed_votes(ctx: SeedContext) -> None:
    """All votes in chronological order, each followed by the real recompute."""
    planned = [vote for spec in ALL_PLACES for vote in _planned_votes(ctx, spec)]
    for vote in sorted(planned, key=lambda item: item.at):
        await verification.apply_vote(
            ctx.session,
            ctx.places[vote.place_key],
            ctx.users[vote.voter],
            vote.kind,
            now=vote.at,
            is_near=vote.is_near,
        )


async def _seed_reviews(ctx: SeedContext, items: tuple[SeedReview, ...], **target: object) -> None:
    for item in items:
        await reviews.upsert_review(
            ctx.session,
            ctx.users[item.author],
            ReviewIn(rating=item.rating, text=item.text),
            now=ctx.ago(item.days_ago),
            **target,
        )


async def _seed_feedback(ctx: SeedContext) -> None:
    for spec in ALL_PLACES:
        place = ctx.places[spec.key]
        await _seed_reviews(ctx, spec.reviews, place=place)
        for comment in sorted(spec.comments, key=lambda item: -item.days_ago):
            await comments.insert_comment(
                ctx.session, place, ctx.users[comment.author], comment.text, ctx.ago(comment.days_ago)
            )


async def _seed_participants(ctx: SeedContext) -> None:
    """Participants join one after another between the announcement and now."""
    for spec in ALL_PLACES:
        if spec.event is None:
            continue
        names = spec.event.participants.split()
        for index, name in enumerate(names, start=1):
            joined_at = ctx.ago(spec.age_days * (1 - index / (len(names) + 1)))
            await event_service.add_participant(ctx.session, ctx.places[spec.key], ctx.users[name], joined_at)


def _load_route_paths() -> dict[str, dict[str, Any]]:
    if not ROUTE_PATHS_FILE.exists():
        return {}
    return json.loads(ROUTE_PATHS_FILE.read_text(encoding="utf-8"))


def _planned_path(spec: SeedRoute, points: list[LngLat], stored: dict[str, dict[str, Any]]) -> PlannedPath:
    """The pre-computed routed path when it matches the current stops, else straight segments."""
    entry = stored.get(spec.key)
    if (
        spec.path_mode is PathMode.DIRECT
        or entry is None
        or entry["stops"] != [list(point) for point in points]
    ):
        return straight_plan(spec.kind, points)
    return PlannedPath(
        path=[(lng, lat) for lng, lat in entry["path"]],
        legs_m=[int(leg) for leg in entry["legs_m"]],
        travel_min=int(entry["travel_min"]),
        source=PathSource(entry["source"]),
    )


def _stop_input(ctx: SeedContext, stop: SeedStop) -> StopInput:
    return StopInput(
        place_id=ctx.places[stop.place].id if stop.place else None,
        kind=stop.kind,
        title=stop.title,
        lat=stop.lat,
        lng=stop.lng,
        note=stop.note,
        landmark=stop.landmark,
        stay_min=stop.stay_min,
    )


async def _seed_routes(ctx: SeedContext) -> None:
    stored_paths = _load_route_paths()
    for spec in sorted(route_data.ROUTES, key=lambda item: -item.age_days):
        author = ctx.users[spec.author]
        created_at = ctx.ago(spec.age_days)
        payload = RouteInput(
            title=spec.title,
            description=spec.description,
            kind=spec.kind,
            difficulty=spec.difficulty,
            visibility=spec.visibility,
            path_mode=spec.path_mode,
            tips=spec.tips,
            tags=list(spec.tags),
            stops=[_stop_input(ctx, stop) for stop in spec.stops],
        )
        stops = await routes.resolve_stops(ctx.session, author, payload.stops)
        planned = _planned_path(spec, routes.stop_points(stops), stored_paths)
        route = await routes.publish_route(ctx.session, author, payload, stops, planned, created_at)
        ctx.routes[spec.key] = route
        await _seed_reviews(ctx, spec.reviews, route=route)
        savers = spec.saved_by.split()
        for index, name in enumerate(savers, start=1):
            saved_at = ctx.ago(spec.age_days * (1 - index / (len(savers) + 1)))
            ctx.session.add(RouteSave(user_id=ctx.users[name].id, route_id=route.id, created_at=saved_at))
            route.saves_count += 1


async def _seed_notes(ctx: SeedContext) -> None:
    for spec in notes_data.NOTES:
        ctx.session.add(
            MapNote(
                author=ctx.users[spec.author],
                lat=spec.lat,
                lng=spec.lng,
                text=spec.text,
                object_id=spec.object_id,
                object_name=spec.object_name,
                created_at=ctx.ago(spec.days_ago),
            )
        )


async def _seed_outages(ctx: SeedContext) -> None:
    """Demo outages go through the importer itself, exactly like the live VL.ru data."""
    current = [
        Outage(
            number=spec.number,
            resource=spec.resource,
            description=spec.description,
            houses=spec.houses,
            starts_at=ctx.now - timedelta(hours=spec.started_hours_ago),
            ends_at=ctx.now + timedelta(hours=spec.ends_in_hours) if spec.ends_in_hours else None,
            initiator=spec.initiator,
            complaints_count=spec.complaints_count,
        )
        for spec in outages_data.OUTAGES
    ]
    await outages_importer.apply_outages(ctx.session, current, ctx.now)


async def _seed_osm(ctx: SeedContext) -> None:
    """The OpenStreetMap base layer, imported from the committed snapshot after the community's
    own places so that they win the duplicate check (SPEC §18)."""
    report = await osm_importer.apply_snapshot(ctx.session, osm_snapshot.read(OSM_SNAPSHOT_FILE), ctx.now)
    logger.info("OpenStreetMap layer: %s", report.summary())


async def _seed_wikivoyage(ctx: SeedContext) -> None:
    """Described sights from the travel guide, after the community's places and the OSM layer so
    that listings describing an existing place enrich it instead of duplicating it (SPEC §21)."""
    bbox = geo.parse_south_west_north_east(ctx.settings.osm_bbox)
    listings = wikivoyage_snapshot.read(WIKIVOYAGE_SNAPSHOT_FILE)
    report = await wikivoyage_importer.apply_snapshot(ctx.session, listings, bbox, ctx.now)
    logger.info("Wikivoyage: %s", report.summary())


async def _seed_wikimedia(ctx: SeedContext) -> None:
    """Freely licensed photos and Wikipedia summaries from the committed snapshot (SPEC §19)."""
    keyed = await enrichment.keyed_objects(ctx.session)
    seeded = await seed_objects(ctx.session)
    keyed.merge(seeded.places, seeded.areas)
    harvest = wikimedia_snapshot.read(WIKIMEDIA_SNAPSHOT_FILE)
    report = await wikimedia_apply.apply_snapshot(ctx.session, harvest, keyed, ctx.now)
    logger.info("Wikimedia: %s", report.summary())


async def _seed_social(ctx: SeedContext) -> None:
    """Collections, the demo user's favorites and respects between residents."""
    for spec in route_data.COLLECTIONS:
        created_at = ctx.ago(spec.age_days)
        collection = Collection(
            owner=ctx.users[spec.owner],
            title=spec.title,
            description=spec.description,
            is_public=spec.is_public,
            created_at=created_at,
        )
        ctx.session.add(collection)
        await ctx.session.flush()
        for offset, key in enumerate(spec.places):
            ctx.session.add(
                CollectionItem(
                    collection_id=collection.id,
                    place_id=ctx.places[key].id,
                    created_at=created_at + timedelta(minutes=offset),
                )
            )
    demo = ctx.users["anya"]
    for offset, key in enumerate(DEMO_FAVORITES):
        ctx.session.add(
            Favorite(user_id=demo.id, place_id=ctx.places[key].id, created_at=ctx.ago(40 - offset * 5))
        )
    for sender, receiver, days_ago in sorted(RESPECTS, key=lambda item: -item[2]):
        await users.record_respect(ctx.session, ctx.users[sender], ctx.users[receiver], ctx.ago(days_ago))


async def _mark_old_notifications_read(ctx: SeedContext) -> None:
    await ctx.session.flush()
    await ctx.session.execute(
        update(Notification).where(Notification.created_at < ctx.now - READ_AFTER).values(is_read=True)
    )
