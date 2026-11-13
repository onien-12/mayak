from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.deps import CurrentUser, OptionalUser, SessionDep
from app.domain.enums import AiTarget
from app.schemas.feedback import ReviewIn, ReviewOut
from app.schemas.quest import (
    CheckIn,
    CheckOut,
    JoinIn,
    LeadIn,
    QuestCard,
    QuestDetail,
    QuestEditor,
    QuestInput,
    QuestResultOut,
    QuestRunOut,
    QuestUpdate,
    RunStartIn,
    StageRef,
)
from app.services.ai_moderation.screener import AiScreener, get_ai_screener
from app.services.quests import authoring, play
from app.services.quests.authoring import QuestFilters, QuestSort

router = APIRouter(tags=["quests"])

Screener = Annotated[AiScreener, Depends(get_ai_screener)]


def quest_filters(
    q: Annotated[str | None, Query(max_length=100)] = None,
    author_id: int | None = None,
    sort: QuestSort = QuestSort.NEW,
    limit: Annotated[int, Query(ge=1, le=authoring.MAX_LIMIT)] = authoring.DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> QuestFilters:
    return QuestFilters(
        query=q.strip() if q else None, author_id=author_id, sort=sort, limit=limit, offset=offset
    )


@router.get("/quests")
async def list_quests(
    filters: Annotated[QuestFilters, Depends(quest_filters)], viewer: OptionalUser, session: SessionDep
) -> list[QuestCard]:
    return await authoring.list_quests(session, viewer, filters)


@router.get("/me/quests")
async def list_my_quests(user: CurrentUser, session: SessionDep) -> list[QuestCard]:
    return await authoring.list_my_quests(session, user)


@router.post("/quests", status_code=status.HTTP_201_CREATED)
async def create_quest(
    payload: QuestInput, user: CurrentUser, session: SessionDep, screener: Screener
) -> QuestEditor:
    editor = await authoring.create_quest(session, user, payload)
    await screener.submit(AiTarget.ROUTE, editor.id)
    return editor


@router.get("/quests/{quest_id}")
async def get_quest(quest_id: int, viewer: OptionalUser, session: SessionDep) -> QuestDetail:
    return await authoring.get_detail(session, quest_id, viewer)


@router.get("/quests/{quest_id}/edit")
async def get_quest_editor(quest_id: int, user: CurrentUser, session: SessionDep) -> QuestEditor:
    return await authoring.get_editor(session, quest_id, user)


@router.patch("/quests/{quest_id}")
async def update_quest(
    quest_id: int, payload: QuestUpdate, user: CurrentUser, session: SessionDep, screener: Screener
) -> QuestEditor:
    editor = await authoring.update_quest(session, user, quest_id, payload)
    await screener.submit(AiTarget.ROUTE, editor.id)
    return editor


@router.delete("/quests/{quest_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quest(quest_id: int, user: CurrentUser, session: SessionDep) -> None:
    await authoring.delete_quest(session, user, quest_id)


@router.get("/quests/{quest_id}/results")
async def quest_results(quest_id: int, viewer: OptionalUser, session: SessionDep) -> list[QuestResultOut]:
    return await play.results(session, quest_id, viewer)


@router.get("/quests/{quest_id}/reviews")
async def list_quest_reviews(quest_id: int, viewer: OptionalUser, session: SessionDep) -> list[ReviewOut]:
    return await play.list_reviews(session, quest_id, viewer)


@router.post("/quests/{quest_id}/reviews")
async def review_quest(
    quest_id: int, payload: ReviewIn, user: CurrentUser, session: SessionDep, screener: Screener
) -> ReviewOut:
    review = await play.review(session, user, quest_id, payload)
    await screener.submit(AiTarget.REVIEW, review.id)
    return review


@router.post("/quests/{quest_id}/runs", status_code=status.HTTP_201_CREATED)
async def start_run(
    quest_id: int, payload: RunStartIn, user: CurrentUser, session: SessionDep
) -> QuestRunOut:
    return await play.start_run(session, user, quest_id, payload)


@router.post("/quest-runs/join")
async def join_run(payload: JoinIn, user: CurrentUser, session: SessionDep) -> QuestRunOut:
    return await play.join_run(session, user, payload)


@router.get("/quest-runs/{run_id}")
async def get_run(run_id: int, user: CurrentUser, session: SessionDep) -> QuestRunOut:
    return await play.get_run(session, user, run_id)


@router.post("/quest-runs/{run_id}/check")
async def check_stage(run_id: int, payload: CheckIn, user: CurrentUser, session: SessionDep) -> CheckOut:
    return await play.check(session, user, run_id, payload)


@router.post("/quest-runs/{run_id}/hint")
async def take_hint(run_id: int, payload: StageRef, user: CurrentUser, session: SessionDep) -> QuestRunOut:
    return await play.take_hint(session, user, run_id, payload)


@router.post("/quest-runs/{run_id}/lead")
async def hand_lead(run_id: int, payload: LeadIn, user: CurrentUser, session: SessionDep) -> QuestRunOut:
    return await play.set_lead(session, user, run_id, payload)


@router.post("/quest-runs/{run_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_run(run_id: int, user: CurrentUser, session: SessionDep) -> None:
    await play.leave(session, user, run_id)


@router.post("/quest-runs/{run_id}/abandon", status_code=status.HTTP_204_NO_CONTENT)
async def abandon_run(run_id: int, user: CurrentUser, session: SessionDep) -> None:
    await play.abandon(session, user, run_id)
