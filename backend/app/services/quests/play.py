"""Playing a quest (SPEC §27): runs, the server-side checks of each stage, hints and teams.

Every check happens here: the client sends where the player stands, the code or the answer, and
learns only whether the stage is passed. A wrong try never says how close the player is; a
right answer from the wrong place is not even looked at.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.clock import utcnow
from app.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError, RateLimitedError
from app.domain import quests as rules
from app.domain.quests import QuestCondition
from app.models import Quest, QuestRun, QuestRunMember, QuestStage, User
from app.schemas.feedback import ReviewIn, ReviewOut
from app.schemas.quest import (
    CheckIn,
    CheckOut,
    JoinIn,
    LeadIn,
    QuestResultOut,
    QuestRunOut,
    RunStartIn,
    StageRef,
)
from app.services import reviews
from app.services.quests import authoring, views

RESULTS_LIMIT = 10
_RUN_NOT_FOUND = "Прохождение не найдено."
_RUN_LOAD = (selectinload(QuestRun.members).joinedload(QuestRunMember.user),)
_JOIN_CODE_TRIES = 20

PASSED = "Этап пройден!"
FINISHED = "Квест пройден!"
ALREADY_PASSED = "Этот этап уже пройден — открыт следующий."
NOT_THERE = "Вы ещё не на месте — загадка ведёт в другое место."
WRONG_CODE = "Код не подошёл."
WRONG_ANSWER = "Ответ не подходит."
PAUSED = "Слишком много неверных попыток — пауза на минуту."
NO_POSITION = "Не удалось узнать, где вы. Разрешите доступ к геолокации и попробуйте ещё раз."


async def _quest(session: AsyncSession, quest_id: int) -> Quest:
    quest = await authoring.find(session, quest_id)
    if quest is None:
        raise NotFoundError(authoring.QUEST_NOT_FOUND)
    return quest


async def _load_run(session: AsyncSession, run_id: int) -> QuestRun | None:
    return await session.scalar(select(QuestRun).where(QuestRun.id == run_id).options(*_RUN_LOAD))


def _member(run: QuestRun, user: User) -> QuestRunMember | None:
    return next((member for member in views.active_members(run) if member.user_id == user.id), None)


async def _own_run(session: AsyncSession, user: User, run_id: int) -> tuple[QuestRun, Quest]:
    """A run the user plays in, with its quest; others get 404 as if it did not exist."""
    run = await _load_run(session, run_id)
    if run is None or _member(run, user) is None:
        raise NotFoundError(_RUN_NOT_FOUND)
    quest = await _quest(session, run.quest_id)
    if _settle(run, quest, utcnow()):
        await session.commit()
    return run, quest


async def _out(session: AsyncSession, run: QuestRun, quest: Quest, viewer: User) -> QuestRunOut:
    photos = [stage.photo for stage in quest.stages]
    gate = await views.PhotoGate.load(session, photos, owner_view=run.is_test)
    return views.run_out(run, quest, viewer, gate, utcnow())


async def get_run(session: AsyncSession, user: User, run_id: int) -> QuestRunOut:
    run, quest = await _own_run(session, user, run_id)
    return await _out(session, run, quest, user)


def _settle(run: QuestRun, quest: Quest, now: datetime) -> bool:
    """A run whose remaining stages the author removed is finished, off the board."""
    if run.finished_at is not None or run.abandoned_at is not None:
        return False
    if views.current_stage(run, quest) is not None:
        return False
    run.finished_at = now
    run.join_code = None
    run.ranked = False
    run.updated_at = now
    return True


async def _unique_join_code(session: AsyncSession) -> str:
    for _ in range(_JOIN_CODE_TRIES):
        code = rules.new_join_code()
        if await session.scalar(select(QuestRun.id).where(QuestRun.join_code == code)) is None:
            return code
    raise ConflictError("Не получилось придумать код команды — попробуйте ещё раз.")


def _ensure_playable(quest: Quest, user: User, *, test: bool) -> None:
    if test:
        if not authoring.can_edit(quest, user):
            raise ForbiddenError("Пройти квест как игрок для проверки может только его автор.")
        return
    if not authoring.is_public(quest):
        raise NotFoundError(authoring.QUEST_NOT_FOUND)
    if quest.route.author_id == user.id:
        raise ForbiddenError("Свой квест можно пройти только для проверки — кнопкой «Пройти как игрок».")


async def start_run(session: AsyncSession, user: User, quest_id: int, payload: RunStartIn) -> QuestRunOut:
    now = utcnow()
    quest = await _quest(session, quest_id)
    if not authoring.can_view(quest, user):
        raise NotFoundError(authoring.QUEST_NOT_FOUND)
    _ensure_playable(quest, user, test=payload.test)
    current = await authoring.active_run_of(session, quest.route_id, user.id)
    if current is not None:
        if not (payload.test and current.is_test):
            raise ConflictError("Вы уже проходите этот квест — продолжите или завершите прохождение.")
        current.abandoned_at = current.updated_at = now
    run = QuestRun(
        quest_id=quest.route_id,
        captain_id=user.id,
        is_team=payload.team,
        team_name=payload.team_name if payload.team else None,
        join_code=await _unique_join_code(session) if payload.team else None,
        is_test=payload.test,
        lead_user_id=user.id if payload.team else None,
        hints=[],
        passes=[],
        started_at=now,
        updated_at=now,
        members=[QuestRunMember(user_id=user.id, joined_at=now)],
    )
    session.add(run)
    await session.commit()
    loaded = await _load_run(session, run.id)
    assert loaded is not None
    return await _out(session, loaded, quest, user)


async def join_run(session: AsyncSession, user: User, payload: JoinIn) -> QuestRunOut:
    now = utcnow()
    run = await session.scalar(
        select(QuestRun)
        .where(QuestRun.join_code == rules.normalize_join_code(payload.code), QuestRun.finished_at.is_(None))
        .options(*_RUN_LOAD)
    )
    if run is None or run.abandoned_at is not None:
        raise NotFoundError("Команды с таким кодом нет — проверьте код у капитана.")
    quest = await _quest(session, run.quest_id)
    _ensure_playable(quest, user, test=False)
    if _member(run, user) is not None:
        return await _out(session, run, quest, user)
    other = await authoring.active_run_of(session, quest.route_id, user.id)
    if other is not None:
        raise ConflictError("Вы уже проходите этот квест — сначала завершите своё прохождение.")
    if len(views.active_members(run)) >= rules.MAX_TEAM_SIZE:
        raise ConflictError(f"В команде уже {rules.MAX_TEAM_SIZE} игроков — больше нельзя.")
    former = next((member for member in run.members if member.user_id == user.id), None)
    if former is not None:
        former.left_at = None
    else:
        run.members.append(QuestRunMember(user_id=user.id, user=user, joined_at=now))
    run.updated_at = now
    await session.commit()
    return await _out(session, run, quest, user)


def _ensure_running(run: QuestRun) -> None:
    if run.finished_at is not None:
        raise ConflictError("Квест уже пройден.")
    if run.abandoned_at is not None:
        raise ConflictError("Это прохождение завершено досрочно.")


def _current_stage(run: QuestRun, quest: Quest, position: int) -> QuestStage | None:
    """The stage being answered; None when the run is already past it (a teammate passed it)."""
    current = views.current_stage(run, quest)
    if current is not None and current.position == position:
        return current
    done = views.passed_keys(run)
    if any(stage.position == position and stage.key in done for stage in quest.stages):
        return None
    raise ConflictError("Этот этап ещё не открыт.")


async def _finish(session: AsyncSession, run: QuestRun, now: datetime) -> None:
    run.finished_at = now
    run.join_code = None
    if run.is_test:
        return
    players = [member.user_id for member in views.active_members(run)]
    earlier = await session.scalar(
        select(QuestRun.id)
        .join(QuestRunMember, QuestRunMember.run_id == QuestRun.id)
        .where(
            QuestRun.quest_id == run.quest_id,
            QuestRun.id != run.id,
            QuestRun.finished_at.is_not(None),
            QuestRun.is_test.is_(False),
            QuestRunMember.user_id.in_(players),
            QuestRunMember.left_at.is_(None),
        )
        .limit(1)
    )
    run.ranked = earlier is None


async def _pass(
    session: AsyncSession, run: QuestRun, quest: Quest, stage: QuestStage, user: User, now: datetime
) -> None:
    run.passes = [*run.passes, {"stage": stage.key, "user_id": user.id, "at": now.isoformat()}]
    run.stage_index = len(views.passed_stages(run, quest))
    run.wrong_tries = 0
    run.locked_until = None
    if run.is_team:
        ids = [member.user_id for member in views.active_members(run)]
        run.lead_user_id = rules.next_lead(ids, run.lead_user_id)
    if views.current_stage(run, quest) is None:
        await _finish(session, run, now)


def _wrong(run: QuestRun, now: datetime) -> str:
    """Count a wrong try; after the last one the run pauses."""
    run.wrong_tries += 1
    paused = rules.locked_until(run.wrong_tries, now)
    if paused is not None:
        run.locked_until = paused
        run.wrong_tries = 0
        return PAUSED
    return f"Осталось попыток: {rules.tries_left(run.wrong_tries)}."


def _on_site(run: QuestRun, stage: QuestStage, payload: CheckIn) -> bool:
    if run.is_test and payload.on_site:
        return True
    if payload.lat is None or payload.lng is None:
        raise BadRequestError(NO_POSITION)
    return rules.is_on_site(payload.lat, payload.lng, payload.accuracy, stage.lat, stage.lng, stage.radius_m)


async def check(session: AsyncSession, user: User, run_id: int, payload: CheckIn) -> CheckOut:
    """One try at the current stage. Missing input (no position, an empty code) is not a try."""
    now = utcnow()
    run, quest = await _own_run(session, user, run_id)
    _ensure_running(run)
    stage = _current_stage(run, quest, payload.stage)
    if stage is None:
        return CheckOut(passed=True, message=ALREADY_PASSED, run=await _out(session, run, quest, user))
    if run.locked_until is not None and run.locked_until > now:
        seconds = max(int((run.locked_until - now).total_seconds()), 1)
        raise RateLimitedError(f"Слишком много неверных попыток. Попробуйте через {seconds} с.")
    needs_site = stage.condition is QuestCondition.ARRIVAL or stage.check_arrival
    if stage.condition is not QuestCondition.ARRIVAL and payload.answer is None:
        raise BadRequestError("Введите код." if stage.condition is QuestCondition.CODE else "Введите ответ.")
    if needs_site and not _on_site(run, stage, payload):
        message = f"{NOT_THERE} {_wrong(run, now)}"
        passed = False
    elif stage.condition is QuestCondition.ARRIVAL or rules.answer_matches(
        payload.answer or "", stage.answers
    ):
        await _pass(session, run, quest, stage, user, now)
        message = FINISHED if run.finished_at is not None else PASSED
        passed = True
    else:
        wrong = WRONG_CODE if stage.condition is QuestCondition.CODE else WRONG_ANSWER
        message = f"{wrong} {_wrong(run, now)}"
        passed = False
    run.updated_at = now
    await session.commit()
    return CheckOut(passed=passed, message=message, run=await _out(session, run, quest, user))


async def take_hint(session: AsyncSession, user: User, run_id: int, payload: StageRef) -> QuestRunOut:
    """The hint costs the run `HINT_PENALTY_MIN` minutes; taking it again is free."""
    run, quest = await _own_run(session, user, run_id)
    _ensure_running(run)
    stage = _current_stage(run, quest, payload.stage)
    if stage is not None:
        if not stage.hint:
            raise BadRequestError("У этого этапа нет подсказки.")
        if stage.key not in run.hints:
            run.hints = [*run.hints, stage.key]
            run.updated_at = utcnow()
            await session.commit()
    return await _out(session, run, quest, user)


async def set_lead(session: AsyncSession, user: User, run_id: int, payload: LeadIn) -> QuestRunOut:
    """The captain hands the current riddle to another member (someone left, a phone died)."""
    run, quest = await _own_run(session, user, run_id)
    _ensure_running(run)
    if not run.is_team or run.captain_id != user.id:
        raise ForbiddenError("Передать загадку может только капитан команды.")
    if payload.user_id not in {member.user_id for member in views.active_members(run)}:
        raise BadRequestError("Такого игрока нет в команде.")
    run.lead_user_id = payload.user_id
    run.updated_at = utcnow()
    await session.commit()
    return await _out(session, run, quest, user)


async def leave(session: AsyncSession, user: User, run_id: int) -> None:
    """A member leaves the team; the captaincy and the riddle pass to the next member. The last
    one to leave — or a solo player — ends the run."""
    now = utcnow()
    run, _ = await _own_run(session, user, run_id)
    member = _member(run, user)
    assert member is not None
    order = [item.user_id for item in views.active_members(run)]
    member.left_at = now
    rest = [user_id for user_id in order if user_id != user.id]
    if not rest:
        if run.finished_at is None:
            run.abandoned_at = now
        run.join_code = None
    else:
        if run.captain_id == user.id:
            run.captain_id = rules.next_lead(order, user.id) or rest[0]
        if run.lead_user_id == user.id:
            run.lead_user_id = rules.next_lead(order, user.id) or rest[0]
    run.updated_at = now
    await session.commit()


async def abandon(session: AsyncSession, user: User, run_id: int) -> None:
    """The captain (or a solo player) stops the run; it stays off the results board."""
    now = utcnow()
    run, _ = await _own_run(session, user, run_id)
    _ensure_running(run)
    if run.captain_id != user.id:
        raise ForbiddenError("Завершить прохождение может только капитан команды.")
    run.abandoned_at = run.updated_at = now
    run.join_code = None
    await session.commit()


async def results(session: AsyncSession, quest_id: int, viewer: User | None) -> list[QuestResultOut]:
    """The best ranked runs: time to the last stage plus the hint penalty, test runs and replays aside."""
    quest = await authoring.get_visible(session, quest_id, viewer)
    runs = await authoring.ranked_runs(session, quest.route_id)
    return [views.result_out(rank, run, viewer) for rank, run in enumerate(runs[:RESULTS_LIMIT], start=1)]


async def list_reviews(session: AsyncSession, quest_id: int, viewer: User | None) -> list[ReviewOut]:
    quest = await authoring.get_visible(session, quest_id, viewer)
    return await reviews.list_route_reviews(session, quest.route_id, viewer, quest_ok=True)


async def review(session: AsyncSession, user: User, quest_id: int, payload: ReviewIn) -> ReviewOut:
    """Only a player who finished the quest rates it (SPEC §27); the review is an ordinary route
    review underneath, screened like any other."""
    quest = await authoring.get_visible(session, quest_id, user)
    if quest.route.author_id == user.id:
        raise ForbiddenError("Свой квест оценить нельзя.")
    if not await authoring.finished_runs_of(session, quest.route_id, user.id):
        raise ConflictError("Оценить квест можно после того, как пройдёте его до конца.")
    return await reviews.review_route(session, user, quest.route_id, payload, quest_ok=True)
