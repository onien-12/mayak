"""Responses about quests: the one place that decides what each viewer gets (SPEC §27).

A player gets the public card, the stages already passed and, of the current stage, the riddle
(only the member holding it in a team), its photo, the kind of check, the question, whether there
is a hint and the moved search circle. Never a title, point, code, answer, story or hint of a stage
not yet passed. Authors and moderators get everything through the editor view.
"""

from collections.abc import Collection
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import quests as rules
from app.domain.enums import AiTarget, HoldState, RouteStatus
from app.domain.quests import QuestCondition, QuestZone
from app.models import Photo, Quest, QuestRun, QuestRunMember, QuestStage, QuietHold, User
from app.schemas.place import PhotoOut
from app.schemas.quest import (
    CurrentStage,
    LatLngOut,
    PassedStage,
    QuestCard,
    QuestResultOut,
    QuestRunOut,
    QuestStart,
    RunMember,
    SearchZone,
    StageOut,
)
from app.schemas.user import UserBrief


async def photo_states(session: AsyncSession, photos: Collection[Photo | None]) -> dict[int, HoldState]:
    """Screening states of the photos that ever had one."""
    ids = [photo.id for photo in photos if photo is not None]
    if not ids:
        return {}
    rows = await session.execute(
        select(QuietHold.target_id, QuietHold.state).where(
            QuietHold.target_type == AiTarget.PHOTO, QuietHold.target_id.in_(ids)
        )
    )
    return dict(rows.all())


class PhotoGate:
    """Which quest photos a viewer may see: players only those that passed the screening, the
    author also their own photos still checked or held (marked `on_review`); a photo a moderator
    removed is shown to nobody."""

    def __init__(self, states: dict[int, HoldState], *, owner_view: bool) -> None:
        self._states = states
        self._owner_view = owner_view

    @classmethod
    async def load(
        cls, session: AsyncSession, photos: Collection[Photo | None], *, owner_view: bool
    ) -> "PhotoGate":
        return cls(await photo_states(session, photos), owner_view=owner_view)

    def out(self, photo: Photo | None) -> PhotoOut | None:
        if photo is None:
            return None
        state = self._states.get(photo.id)
        if state is HoldState.DECIDED:
            return None
        if state in (HoldState.SCREENING, HoldState.HELD) and not self._owner_view:
            return None
        shown = PhotoOut.model_validate(photo)
        return shown.model_copy(update={"on_review": state is HoldState.HELD}) if self._owner_view else shown


async def finished_counts(session: AsyncSession, quest_ids: Collection[int]) -> dict[int, int]:
    """Players who finished each quest, test runs aside."""
    if not quest_ids:
        return {}
    rows = await session.execute(
        select(QuestRun.quest_id, func.count(func.distinct(QuestRunMember.user_id)))
        .join(QuestRunMember, QuestRunMember.run_id == QuestRun.id)
        .where(
            QuestRun.quest_id.in_(quest_ids),
            QuestRun.finished_at.is_not(None),
            QuestRun.is_test.is_(False),
            QuestRunMember.left_at.is_(None),
        )
        .group_by(QuestRun.quest_id)
    )
    return dict(rows.all())


def start_of(quest: Quest) -> QuestStart:
    return QuestStart(title=quest.start_title, lat=quest.start_lat, lng=quest.start_lng)


def card_fields(
    quest: Quest, *, status: RouteStatus | None, cover: PhotoOut | None, finished: int
) -> dict[str, object]:
    """Requires `quest.route.author` and `quest.stages` to be loaded; only the number of stages
    leaves this function."""
    route = quest.route
    return {
        "id": route.id,
        "title": route.title,
        "description": route.description,
        "status": status or route.status,
        "visibility": route.visibility,
        "cover_url": cover.url if cover else None,
        "stages_count": len(quest.stages),
        "duration_min": quest.duration_min,
        "rating_avg": route.rating_avg,
        "rating_count": route.rating_count,
        "finished_count": finished,
        "start": start_of(quest),
        "author": UserBrief.model_validate(route.author),
        "created_at": route.created_at,
        "updated_at": route.updated_at,
    }


def card(quest: Quest, *, status: RouteStatus | None, cover: PhotoOut | None, finished: int) -> QuestCard:
    return QuestCard(**card_fields(quest, status=status, cover=cover, finished=finished))


def zone_of(stage: QuestStage) -> SearchZone | None:
    """The search circle players get: its centre moved off the point, the same on every request."""
    if stage.zone is not QuestZone.CIRCLE or not stage.zone_radius_m:
        return None
    lat, lng = rules.zone_center(f"quest-stage:{stage.key}", stage.lat, stage.lng, stage.zone_radius_m)
    return SearchZone(lat=lat, lng=lng, radius_m=stage.zone_radius_m)


def stage_out(stage: QuestStage, gate: PhotoGate) -> StageOut:
    """Everything about a stage: for its author and moderators only."""
    zone = zone_of(stage)
    return StageOut(
        id=stage.id,
        position=stage.position,
        title=stage.title,
        lat=stage.lat,
        lng=stage.lng,
        place_id=stage.place_id,
        riddle=stage.riddle,
        photo=gate.out(stage.photo),
        condition=stage.condition,
        check_arrival=stage.check_arrival,
        radius_m=stage.radius_m,
        question=stage.question,
        answers=list(stage.answers),
        hint=stage.hint,
        reward=stage.reward,
        zone=stage.zone,
        zone_radius_m=stage.zone_radius_m,
        zone_center=LatLngOut(lat=zone.lat, lng=zone.lng) if zone else None,
    )


def passed_keys(run: QuestRun) -> set[str]:
    return {record["stage"] for record in run.passes if isinstance(record.get("stage"), str)}


def passed_stages(run: QuestRun, quest: Quest) -> list[QuestStage]:
    """The stages of the quest as it is now that this run passed, in playing order."""
    done = passed_keys(run)
    return [stage for stage in quest.stages if stage.key in done]


def current_stage(run: QuestRun, quest: Quest) -> QuestStage | None:
    """The first stage not passed yet; None when every stage is."""
    done = passed_keys(run)
    return next((stage for stage in quest.stages if stage.key not in done), None)


def active_members(run: QuestRun) -> list[QuestRunMember]:
    """Requires `run.members` to be loaded; in the order they joined."""
    return [member for member in run.members if member.left_at is None]


def _brief(users: dict[int, User], user_id: object) -> UserBrief | None:
    user = users.get(user_id) if isinstance(user_id, int) else None
    return UserBrief.model_validate(user) if user is not None else None


def _passed_at(record: dict[str, object]) -> datetime | None:
    value = record.get("at")
    return datetime.fromisoformat(value) if isinstance(value, str) else None


def _current(
    run: QuestRun, stage: QuestStage, viewer: User, users: dict[int, User], gate: PhotoGate, now: datetime
) -> CurrentStage:
    holds_riddle = not run.is_team or run.lead_user_id == viewer.id
    locked = run.locked_until if run.locked_until is not None and run.locked_until > now else None
    return CurrentStage(
        position=stage.position,
        condition=stage.condition,
        check_arrival=stage.check_arrival or stage.condition is QuestCondition.ARRIVAL,
        riddle=stage.riddle if holds_riddle else None,
        photo=gate.out(stage.photo) if holds_riddle else None,
        riddle_holder=_brief(users, run.lead_user_id) if run.is_team else None,
        question=stage.question if stage.condition is QuestCondition.ANSWER else None,
        has_hint=bool(stage.hint),
        hint=stage.hint if stage.hint and stage.key in run.hints else None,
        zone=zone_of(stage),
        tries_left=rules.tries_left(run.wrong_tries) if locked is None else 0,
        locked_until=locked,
    )


def run_out(run: QuestRun, quest: Quest, viewer: User, gate: PhotoGate, now: datetime) -> QuestRunOut:
    """Requires `run.members` with their users and `quest.stages` with their photos and
    `quest.route` to be loaded. `gate` answers for the viewer: a player, never the owner view."""
    stages = quest.stages
    users = {member.user_id: member.user for member in run.members}
    records = {record.get("stage"): record for record in run.passes}
    passed = []
    for stage in passed_stages(run, quest):
        record = records.get(stage.key, {})
        item = PassedStage(
            position=stage.position,
            title=stage.title,
            lat=stage.lat,
            lng=stage.lng,
            reward=stage.reward,
            passed_at=_passed_at(record),
            passed_by=_brief(users, record.get("user_id")),
            hint_used=stage.key in run.hints,
        )
        item._own(quest.route.author_id)
        passed.append(item)
    finished = run.finished_at is not None
    next_stage = current_stage(run, quest) if not finished and run.abandoned_at is None else None
    current = _current(run, next_stage, viewer, users, gate, now) if next_stage is not None else None
    if current is not None:
        current._own(quest.route.author_id)
    start = start_of(quest)
    start._own(quest.route.author_id)
    return QuestRunOut(
        id=run.id,
        quest_id=quest.route_id,
        quest_title=quest.route.title,
        start=start,
        is_team=run.is_team,
        team_name=run.team_name,
        join_code=run.join_code,
        is_test=run.is_test,
        captain_id=run.captain_id,
        members=[
            RunMember(
                user=UserBrief.model_validate(member.user),
                is_captain=member.user_id == run.captain_id,
                is_lead=run.is_team and member.user_id == run.lead_user_id,
            )
            for member in active_members(run)
        ],
        stages_total=len(stages),
        stage_number=len(passed) + 1,
        finished=finished,
        abandoned=run.abandoned_at is not None,
        started_at=run.started_at,
        finished_at=run.finished_at,
        hints_taken=len(run.hints),
        penalty_min=len(run.hints) * rules.HINT_PENALTY_MIN,
        result_s=rules.result_seconds(run.started_at, run.finished_at, len(run.hints)) if finished else None,
        passed=passed,
        current=current,
        can_confirm_on_site=run.is_test,
        ranked=run.ranked,
    )


def result_out(rank: int, run: QuestRun, viewer: User | None) -> QuestResultOut:
    """Requires `run.members` with their users; `run` is finished."""
    members = [member for member in run.members if member.left_at is None] or list(run.members)
    captain = next((member.user for member in run.members if member.user_id == run.captain_id), None)
    name = run.team_name if run.is_team and run.team_name else (captain.display_name if captain else "Игрок")
    finished_at = run.finished_at or run.updated_at
    result = QuestResultOut(
        rank=rank,
        name=name,
        is_team=run.is_team,
        members_count=len(members),
        result_s=rules.result_seconds(run.started_at, finished_at, len(run.hints)),
        hints=len(run.hints),
        finished_at=finished_at,
        is_mine=viewer is not None and any(member.user_id == viewer.id for member in members),
    )
    result._own(run.captain_id)
    return result
