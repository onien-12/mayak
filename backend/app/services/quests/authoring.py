"""The author's side of quests (SPEC §27): cards, the editor, publication, screening and deletion.

A quest publishes exactly like a route — the same levels, probation, screening window and
moderation cases on the same `Route` row — but its texts include every stage, and the stages
themselves live in `quest_stages`.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from sqlalchemy import ColumnElement, and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.clock import utcnow
from app.core.errors import FieldValidationError, ForbiddenError, NotFoundError
from app.domain import content_check, hold_reasons, levels
from app.domain.enums import (
    PUBLIC_ROUTE_STATUSES,
    AiTarget,
    HoldState,
    ModerationTrigger,
    PathMode,
    PathSource,
    PlaceStatus,
    ReputationReason,
    RouteKind,
    RouteStatus,
    RouteVisibility,
)
from app.models import (
    Photo,
    Place,
    Quest,
    QuestRun,
    QuestRunMember,
    QuestStage,
    QuietHold,
    Review,
    Route,
    User,
)
from app.schemas.place import ScreeningHold
from app.schemas.quest import (
    QuestCard,
    QuestDetail,
    QuestEditor,
    QuestInput,
    QuestRunBrief,
    QuestUpdate,
    StageInput,
)
from app.services import content, moderation_cases, place_queries, quiet_holds, reputation, routes, uploads
from app.services.quests import views

DEFAULT_LIMIT = 50
MAX_LIMIT = 200
QUEST_NOT_FOUND = "Квест не найден."
_UNLINKABLE = (PlaceStatus.HIDDEN, PlaceStatus.ARCHIVED)
QUEST_LOAD = (
    joinedload(Quest.route).joinedload(Route.author),
    joinedload(Quest.cover_photo),
    selectinload(Quest.stages).selectinload(QuestStage.photo),
)


class QuestSort(StrEnum):
    NEW = "new"
    POPULAR = "popular"
    RATING = "rating"


@dataclass(frozen=True, slots=True)
class QuestFilters:
    query: str | None = None
    author_id: int | None = None
    sort: QuestSort = QuestSort.NEW
    limit: int = DEFAULT_LIMIT
    offset: int = 0


def can_edit(quest: Quest, viewer: User | None) -> bool:
    return routes.can_edit(quest.route, viewer)


def can_view(quest: Quest, viewer: User | None) -> bool:
    return routes.can_view(quest.route, viewer)


def is_public(quest: Quest) -> bool:
    return routes.is_public(quest.route)


def listed_clause(viewer: User | None) -> ColumnElement[bool]:
    """Public quests, plus the viewer's own ones in a screening window (SPEC §24.1)."""
    public = and_(Route.visibility == RouteVisibility.PUBLIC, Route.status.in_(PUBLIC_ROUTE_STATUSES))
    if viewer is None:
        return public
    own = quiet_holds.own_shown_as(
        AiTarget.ROUTE, Route.id, Route.author_id, viewer.id, PUBLIC_ROUTE_STATUSES
    )
    return or_(public, own)


async def find(session: AsyncSession, quest_id: int) -> Quest | None:
    return await session.scalar(select(Quest).where(Quest.route_id == quest_id).options(*QUEST_LOAD))


async def get_visible(session: AsyncSession, quest_id: int, viewer: User | None) -> Quest:
    quest = await find(session, quest_id)
    if quest is None or not can_view(quest, viewer):
        raise NotFoundError(QUEST_NOT_FOUND)
    return quest


async def get_editable(session: AsyncSession, quest_id: int, actor: User) -> Quest:
    quest = await get_visible(session, quest_id, actor)
    if not can_edit(quest, actor):
        raise ForbiddenError("Менять квест может только автор или модератор.")
    return quest


async def _cards(session: AsyncSession, quests: list[Quest], viewer: User | None) -> list[QuestCard]:
    shown = await routes.shown_statuses(session, [quest.route for quest in quests])
    finished = await views.finished_counts(session, [quest.route_id for quest in quests])
    states = await views.photo_states(session, [quest.cover_photo for quest in quests])
    return [
        views.card(
            quest,
            status=shown.get(quest.route_id),
            cover=views.PhotoGate(states, owner_view=can_edit(quest, viewer)).out(quest.cover_photo),
            finished=finished.get(quest.route_id, 0),
        )
        for quest in quests
    ]


async def list_quests(session: AsyncSession, viewer: User | None, filters: QuestFilters) -> list[QuestCard]:
    statement = select(Quest).join(Route, Route.id == Quest.route_id).where(listed_clause(viewer))
    if filters.author_id is not None:
        statement = statement.where(Route.author_id == filters.author_id)
    if filters.query:
        statement = statement.where(Route.search_text.contains(filters.query.casefold(), autoescape=True))
    if filters.sort is QuestSort.POPULAR:
        players = (
            select(QuestRun.quest_id, func.count(func.distinct(QuestRunMember.user_id)).label("players"))
            .join(QuestRunMember, QuestRunMember.run_id == QuestRun.id)
            .where(
                QuestRun.finished_at.is_not(None),
                QuestRun.is_test.is_(False),
                QuestRunMember.left_at.is_(None),
            )
            .group_by(QuestRun.quest_id)
            .subquery()
        )
        statement = statement.outerjoin(players, players.c.quest_id == Quest.route_id).order_by(
            players.c.players.desc().nulls_last(), Route.created_at.desc()
        )
    elif filters.sort is QuestSort.RATING:
        statement = statement.order_by(Route.rating_avg.desc().nulls_last(), Route.rating_count.desc())
    else:
        statement = statement.order_by(Route.created_at.desc())
    rows = await session.scalars(
        statement.order_by(Route.id.desc()).options(*QUEST_LOAD).limit(filters.limit).offset(filters.offset)
    )
    return await _cards(session, list(rows.unique()), viewer)


async def list_my_quests(session: AsyncSession, user: User) -> list[QuestCard]:
    rows = await session.scalars(
        select(Quest)
        .join(Route, Route.id == Quest.route_id)
        .where(Route.author_id == user.id)
        .options(*QUEST_LOAD)
        .order_by(Route.created_at.desc(), Route.id.desc())
    )
    return await _cards(session, list(rows.unique()), user)


async def _screening_hold(session: AsyncSession, quest: Quest) -> ScreeningHold | None:
    hold = await quiet_holds.find_active(session, AiTarget.ROUTE, quest.route_id)
    if hold is None or hold.state is not HoldState.HELD:
        return None
    return ScreeningHold(reasons=hold_reasons.for_author(hold.reasons, AiTarget.ROUTE))


async def active_run_of(session: AsyncSession, quest_id: int, user_id: int) -> QuestRun | None:
    """The run of this quest the user is playing now, if any."""
    return await session.scalar(
        select(QuestRun)
        .join(QuestRunMember, QuestRunMember.run_id == QuestRun.id)
        .where(
            QuestRun.quest_id == quest_id,
            QuestRunMember.user_id == user_id,
            QuestRunMember.left_at.is_(None),
            QuestRun.finished_at.is_(None),
            QuestRun.abandoned_at.is_(None),
        )
        .options(selectinload(QuestRun.members).joinedload(QuestRunMember.user))
        .order_by(QuestRun.id.desc())
        .limit(1)
    )


async def finished_runs_of(session: AsyncSession, quest_id: int, user_id: int) -> list[QuestRun]:
    """The user's finished runs of the quest, test runs aside."""
    rows = await session.scalars(
        select(QuestRun)
        .join(QuestRunMember, QuestRunMember.run_id == QuestRun.id)
        .where(
            QuestRun.quest_id == quest_id,
            QuestRunMember.user_id == user_id,
            QuestRunMember.left_at.is_(None),
            QuestRun.finished_at.is_not(None),
            QuestRun.is_test.is_(False),
        )
        .options(selectinload(QuestRun.members).joinedload(QuestRunMember.user))
    )
    return list(rows.unique())


async def _detail_fields(session: AsyncSession, quest: Quest, viewer: User | None) -> dict[str, object]:
    route = quest.route
    editor_view = can_edit(quest, viewer)
    gate = await views.PhotoGate.load(session, [quest.cover_photo], owner_view=editor_view)
    status = (await routes.shown_statuses(session, [route])).get(route.id)
    finished = (await views.finished_counts(session, [route.id])).get(route.id, 0)
    my_run = None
    my_result = None
    has_finished = False
    my_rating = None
    if viewer is not None:
        run = await active_run_of(session, quest.route_id, viewer.id)
        if run is not None:
            my_run = QuestRunBrief(
                id=run.id,
                is_team=run.is_team,
                team_name=run.team_name,
                is_test=run.is_test,
                stage_number=len(views.passed_stages(run, quest)) + 1,
                stages_total=len(quest.stages),
            )
        done = await finished_runs_of(session, quest.route_id, viewer.id)
        has_finished = bool(done)
        ranked = [run for run in done if run.ranked]
        if ranked:
            best = min(ranked, key=lambda item: views.result_out(0, item, viewer).result_s)
            my_result = views.result_out(await _rank_of(session, quest.route_id, best), best, viewer)
        my_rating = await session.scalar(
            select(Review.rating).where(Review.route_id == route.id, Review.author_id == viewer.id)
        )
    return {
        **views.card_fields(quest, status=status, cover=gate.out(quest.cover_photo), finished=finished),
        "can_edit": editor_view,
        "my_run": my_run,
        "my_result": my_result,
        "has_finished": has_finished,
        "my_rating": my_rating,
        "screening_hold": await _screening_hold(session, quest) if editor_view else None,
    }


async def ranked_runs(session: AsyncSession, quest_id: int) -> list[QuestRun]:
    """Runs on the results board, best first."""
    rows = await session.scalars(
        select(QuestRun)
        .where(QuestRun.quest_id == quest_id, QuestRun.ranked.is_(True), QuestRun.finished_at.is_not(None))
        .options(selectinload(QuestRun.members).joinedload(QuestRunMember.user))
    )
    runs = list(rows.unique())
    return sorted(runs, key=lambda run: (views.result_out(0, run, None).result_s, run.finished_at, run.id))


async def _rank_of(session: AsyncSession, quest_id: int, run: QuestRun) -> int:
    ids = [item.id for item in await ranked_runs(session, quest_id)]
    return ids.index(run.id) + 1 if run.id in ids else 0


async def get_detail(session: AsyncSession, quest_id: int, viewer: User | None) -> QuestDetail:
    quest = await get_visible(session, quest_id, viewer)
    return QuestDetail(**await _detail_fields(session, quest, viewer))


async def build_editor(session: AsyncSession, quest: Quest, viewer: User) -> QuestEditor:
    gate = await views.PhotoGate.load(
        session, [quest.cover_photo, *(stage.photo for stage in quest.stages)], owner_view=True
    )
    return QuestEditor(
        **await _detail_fields(session, quest, viewer),
        cover_photo=gate.out(quest.cover_photo),
        stages=[views.stage_out(stage, gate) for stage in quest.stages],
    )


async def get_editor(session: AsyncSession, quest_id: int, actor: User) -> QuestEditor:
    return await build_editor(session, await get_editable(session, quest_id, actor), actor)


async def _photos(
    session: AsyncSession, actor: User, photo_ids: set[int], reusable: frozenset[int]
) -> dict[int, Photo]:
    """The actor's free uploads, or photos the quest already has."""
    if not photo_ids:
        return {}
    rows = await session.scalars(select(Photo).where(Photo.id.in_(photo_ids)))
    photos = {
        photo.id: photo
        for photo in rows
        if photo.id in reusable or (photo.uploader_id == actor.id and uploads.is_free(photo))
    }
    if photo_ids - photos.keys():
        raise FieldValidationError("stages", "К квесту можно прикрепить только свои загруженные фото.")
    return photos


async def _linked_places(session: AsyncSession, actor: User, stages: list[StageInput]) -> None:
    place_ids = {stage.place_id for stage in stages if stage.place_id is not None}
    if not place_ids:
        return
    rows = await session.scalars(
        place_queries.card_query().where(Place.id.in_(place_ids), Place.status.not_in(_UNLINKABLE))
    )
    found = {place.id for place in rows if place_queries.can_view(place, actor)}
    if place_ids - found:
        raise FieldValidationError("stages", "Некоторые места квеста не найдены или недоступны.")


def _fill(stage: QuestStage, data: StageInput, position: int, photos: dict[int, Photo]) -> QuestStage:
    stage.position = position
    stage.title = data.title
    stage.lat, stage.lng = data.lat, data.lng
    stage.place_id = data.place_id
    stage.riddle = data.riddle
    stage.photo = photos.get(data.photo_id) if data.photo_id is not None else None
    stage.condition = data.condition
    stage.check_arrival = data.check_arrival
    stage.radius_m = data.radius_m
    stage.question = data.question
    stage.answers = list(data.answers)
    stage.hint = data.hint
    stage.reward = data.reward
    stage.zone = data.zone
    stage.zone_radius_m = data.zone_radius_m
    return stage


async def _resolve(
    session: AsyncSession,
    actor: User,
    stages: list[StageInput],
    cover_photo_id: int | None,
    reusable: frozenset[int] = frozenset(),
) -> tuple[dict[int, Photo], Photo | None]:
    """Checks the linked places and photos; returns the photos by id and the cover."""
    await _linked_places(session, actor, stages)
    wanted = {stage.photo_id for stage in stages if stage.photo_id is not None}
    if cover_photo_id is not None:
        wanted.add(cover_photo_id)
    photos = await _photos(session, actor, wanted, reusable)
    return photos, photos.get(cover_photo_id) if cover_photo_id is not None else None


async def _replace_stages(
    session: AsyncSession, quest: Quest, stages: list[StageInput], photos: dict[int, Photo]
) -> None:
    """The stages as sent, in order. A stage sent with its id keeps it — runs in progress know
    their stages by id, so a reordered or rewritten quest never shows a player a stage they did
    not pass; stages left out are removed."""
    existing = {stage.id: stage for stage in quest.stages}
    kept: dict[int, QuestStage] = {}
    for data in stages:
        if data.id is not None and data.id in existing and data.id not in kept:
            kept[data.id] = existing[data.id]
    for stage in list(quest.stages):
        if stage.id not in kept:
            quest.stages.remove(stage)
    for index, stage in enumerate(kept.values(), start=1):
        stage.position = -index  # frees the positions for the new order
    await session.flush()
    ordered: list[QuestStage] = []
    used: set[int] = set()
    for position, data in enumerate(stages, start=1):
        row = kept.get(data.id) if data.id is not None and data.id not in used else None
        if row is not None and data.id is not None:
            used.add(data.id)
        ordered.append(_fill(row or QuestStage(), data, position, photos))
    quest.stages = ordered


def _stage_texts(quest: Quest) -> list[str]:
    return [
        text
        for stage in quest.stages
        for text in (stage.title, stage.riddle, stage.question, stage.hint, stage.reward, *stage.answers)
    ]


def _text_flags(quest: Quest) -> list[str]:
    route = quest.route
    return content_check.text_flags(route.title, route.description, quest.start_title, *_stage_texts(quest))


def _gibberish_reasons(quest: Quest) -> list[str]:
    route = quest.route
    stages = "\n".join(text for text in _stage_texts(quest) if text)
    return content.gibberish_reasons(
        {
            "название": route.title,
            "описание": route.description,
            "старт": quest.start_title,
            "этапы квеста": stages,
        }
    )


def _quest_photos(quest: Quest) -> list[Photo]:
    found = [quest.cover_photo, *(stage.photo for stage in quest.stages)]
    return list({photo.id: photo for photo in found if photo is not None and photo.credit is None}.values())


async def _unchecked_photos(session: AsyncSession, quest: Quest) -> list[Photo]:
    photos = _quest_photos(quest)
    if not photos:
        return []
    checked = set(
        await session.scalars(
            select(QuietHold.target_id).where(
                QuietHold.target_type == AiTarget.PHOTO,
                QuietHold.target_id.in_([photo.id for photo in photos]),
            )
        )
    )
    return [photo for photo in photos if photo.id not in checked]


async def _open_window(session: AsyncSession, quest: Quest, author: User, now: datetime) -> None:
    """Hide the public quest from everyone else until its texts and new photos pass (SPEC §24.1)."""
    route = quest.route
    shown = await routes.intended_status(session, route)
    await quiet_holds.open_window(
        session,
        AiTarget.ROUTE,
        route.id,
        author.id,
        now=now,
        shown_status=shown,
        heuristic_reasons=_gibberish_reasons(quest),
    )
    route.status = RouteStatus.PENDING
    photos = await _unchecked_photos(session, quest)
    await uploads.open_photo_windows(session, author, photos, now, parent=(AiTarget.ROUTE, route.id))


async def _publish(session: AsyncSession, quest: Quest, now: datetime, *, screen: bool) -> None:
    """The publication rules of a route (SPEC §2, §24): published and rewarded, or queued; with
    `screen` it is published to its author only until the screener releases it."""
    route = quest.route
    author = route.author
    flags = _text_flags(quest)
    target = moderation_cases.route_target(route)
    if levels.publishes_directly(author.level, author.role) and not flags:
        route.status = RouteStatus.PUBLISHED
        await reputation.award(session, author, ReputationReason.ROUTE_PUBLISHED, now=now)
    else:
        route.status = RouteStatus.PENDING
        if not levels.publishes_directly(author.level, author.role):
            await moderation_cases.open_case(session, target, ModerationTrigger.PREMODERATION, now=now)
        if flags:
            await moderation_cases.open_case(
                session, target, ModerationTrigger.AUTO_TEXT, now=now, flags=flags
            )
    if screen:
        await _open_window(session, quest, author, now)


async def publish_quest(
    session: AsyncSession, author: User, payload: QuestInput, now: datetime, *, screen: bool
) -> Quest:
    """Persist a new quest. A private quest is the author's draft: never screened or moderated.
    The seed never screens; the API screens everyone but moderators."""
    photos, cover = await _resolve(session, author, payload.stages, payload.cover_photo_id)
    stages = [_fill(QuestStage(), data, position, photos) for position, data in enumerate(payload.stages, 1)]
    route = Route(
        author=author,
        title=payload.title,
        description=payload.description,
        tips=None,
        tags=[],
        search_text=routes.build_search_text(payload.title, payload.description, []),
        kind=RouteKind.WALK,
        difficulty=None,
        visibility=payload.visibility,
        path_mode=PathMode.DIRECT,
        status=RouteStatus.PUBLISHED,
        path=[[payload.start_lng, payload.start_lat]],
        path_source=PathSource.STRAIGHT,
        distance_m=0,
        travel_min=0,
        duration_min=payload.duration_min,
        stops=[],
        created_at=now,
        updated_at=now,
    )
    session.add(route)
    await session.flush()
    quest = Quest(
        route_id=route.id,
        start_title=payload.start_title,
        start_lat=payload.start_lat,
        start_lng=payload.start_lng,
        duration_min=payload.duration_min,
        cover_photo=cover,
        stages=stages,
    )
    quest.route = route
    session.add(quest)
    await session.flush()
    if route.visibility is RouteVisibility.PUBLIC:
        await _publish(session, quest, now, screen=screen)
    return quest


async def create_quest(session: AsyncSession, author: User, payload: QuestInput) -> QuestEditor:
    now = utcnow()
    quest = await publish_quest(session, author, payload, now, screen=not author.is_staff)
    await session.commit()
    return await get_editor(session, quest.route_id, author)


_TEXT_FIELDS = frozenset({"title", "description", "start_title", "stages", "cover_photo_id"})
"""Fields whose change opens a new screening window of a public quest."""


async def _apply_changes(session: AsyncSession, quest: Quest, actor: User, payload: QuestUpdate) -> None:
    route = quest.route
    provided = payload.model_fields_set
    if payload.title is not None:
        route.title = payload.title
    if payload.description is not None:
        route.description = payload.description
    route.search_text = routes.build_search_text(route.title, route.description, [])
    if payload.start_title is not None:
        quest.start_title = payload.start_title
    if payload.start_lat is not None and payload.start_lng is not None:
        quest.start_lat, quest.start_lng = payload.start_lat, payload.start_lng
        route.path = [[payload.start_lng, payload.start_lat]]
    if payload.duration_min is not None:
        quest.duration_min = route.duration_min = payload.duration_min
    reusable = frozenset(photo.id for photo in _quest_photos(quest))
    if payload.stages is not None or "cover_photo_id" in provided:
        cover_id = payload.cover_photo_id if "cover_photo_id" in provided else quest.cover_photo_id
        photos, cover = await _resolve(session, actor, payload.stages or [], cover_id, reusable)
        quest.cover_photo = cover
        if payload.stages is not None:
            await _replace_stages(session, quest, payload.stages, photos)


async def _apply_visibility(
    session: AsyncSession, quest: Quest, actor: User, was_public: bool, texts_changed: bool, now: datetime
) -> None:
    """Re-run the publication rules after an edit, as for a route."""
    route = quest.route
    target = moderation_cases.route_target(route)
    screen = not actor.is_staff and actor.id == route.author_id
    if route.visibility is RouteVisibility.PRIVATE:
        if was_public:
            route.status = RouteStatus.PUBLISHED
            await quiet_holds.withdraw(session, AiTarget.ROUTE, route.id, now)
            await moderation_cases.close_cases_without_decision(session, AiTarget.ROUTE, route.id, now)
        return
    if not was_public:
        await _publish(session, quest, now, screen=screen)
        return
    intended = await routes.intended_status(session, route)
    flags = [] if actor.is_staff else _text_flags(quest)
    if flags:
        route.status = RouteStatus.PENDING
        hold = await quiet_holds.find_active(session, AiTarget.ROUTE, route.id)
        if hold is not None:
            hold.shown_status = RouteStatus.PENDING
        await moderation_cases.open_case(session, target, ModerationTrigger.AUTO_TEXT, now=now, flags=flags)
    elif intended is RouteStatus.PENDING and actor.id == route.author_id:
        await moderation_cases.open_case(session, target, ModerationTrigger.PREMODERATION, now=now)
    if screen and texts_changed and route.status is not RouteStatus.HIDDEN:
        await _open_window(session, quest, actor, now)
    open_case = await moderation_cases.find_open_case(session, AiTarget.ROUTE, route.id)
    if open_case is not None:
        open_case.target_title = route.title


async def update_quest(
    session: AsyncSession, actor: User, quest_id: int, payload: QuestUpdate
) -> QuestEditor:
    now = utcnow()
    quest = await get_editable(session, quest_id, actor)
    route = quest.route
    was_public = route.visibility is RouteVisibility.PUBLIC
    texts_changed = bool(_TEXT_FIELDS.intersection(payload.model_fields_set))
    await _apply_changes(session, quest, actor, payload)
    if payload.visibility is not None:
        route.visibility = payload.visibility
    route.updated_at = now
    await _apply_visibility(session, quest, actor, was_public, texts_changed, now)
    await session.commit()
    session.expire_all()
    return await get_editor(session, quest_id, actor)


async def delete_quest(session: AsyncSession, actor: User, quest_id: int) -> None:
    now = utcnow()
    quest = await get_editable(session, quest_id, actor)
    route = quest.route
    await quiet_holds.withdraw(session, AiTarget.ROUTE, route.id, now)
    await moderation_cases.close_cases_without_decision(session, AiTarget.ROUTE, route.id, now)
    await session.execute(delete(Review).where(Review.route_id == route.id))
    run_ids = select(QuestRun.id).where(QuestRun.quest_id == route.id)
    await session.execute(delete(QuestRunMember).where(QuestRunMember.run_id.in_(run_ids)))
    await session.execute(delete(QuestRun).where(QuestRun.quest_id == route.id))
    await session.execute(delete(QuestStage).where(QuestStage.quest_id == route.id))
    await session.execute(delete(Quest).where(Quest.route_id == route.id))
    await session.execute(delete(Route).where(Route.id == route.id))
    await session.commit()
    session.expunge_all()
