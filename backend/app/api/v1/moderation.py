from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.deps import Moderator, SessionDep, get_moderator
from app.core.errors import FieldValidationError
from app.domain.enums import AiTarget, CaseState, Layer, ModerationTrigger, TargetType
from app.schemas.moderation import (
    HeldDecisionIn,
    HeldItemOut,
    ModerationCaseDetail,
    ModerationCaseOut,
    ModerationLogEntry,
    ModerationSummary,
    ResolveIn,
)
from app.services import moderation, moderation_held
from app.services.moderation import QueueFilters, QueueSort

router = APIRouter(prefix="/moderation", tags=["moderation"], dependencies=[Depends(get_moderator)])


def queue_filters(
    state: CaseState = CaseState.OPEN,
    target_type: TargetType | None = None,
    layer: Layer | None = None,
    trigger: ModerationTrigger | None = None,
    sort: QueueSort = QueueSort.RISK,
    limit: Annotated[int, Query(ge=1, le=moderation.MAX_LIMIT)] = moderation.DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> QueueFilters:
    return QueueFilters(
        state=state,
        target_type=target_type,
        layer=layer,
        trigger=trigger,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.get("/queue")
async def list_queue(
    filters: Annotated[QueueFilters, Depends(queue_filters)], session: SessionDep
) -> list[ModerationCaseOut]:
    return await moderation.list_queue(session, filters)


@router.get("/summary")
async def get_summary(session: SessionDep) -> ModerationSummary:
    return await moderation.summary(session)


@router.get("/cases/{case_id}")
async def get_case(case_id: int, moderator: Moderator, session: SessionDep) -> ModerationCaseDetail:
    return await moderation.get_case_detail(session, moderator, case_id)


@router.post("/cases/{case_id}/resolve")
async def resolve_case(
    case_id: int, payload: ResolveIn, moderator: Moderator, session: SessionDep
) -> ModerationCaseDetail:
    return await moderation.resolve_case(session, moderator, case_id, payload)


@router.get("/log")
async def list_log(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=moderation.MAX_LIMIT)] = moderation.DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[ModerationLogEntry]:
    return await moderation.list_log(session, limit=limit, offset=offset)


@router.get("/held")
async def list_held(
    session: SessionDep,
    kind: AiTarget | None = None,
    limit: Annotated[int, Query(ge=1, le=moderation_held.MAX_LIMIT)] = moderation_held.DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[HeldItemOut]:
    if kind is not None and kind not in moderation_held.SMALL_ITEMS:
        raise FieldValidationError(
            "kind", "Ожидается photo, comment, review, note, lost_item или lost_response."
        )
    return await moderation_held.list_held(session, kind=kind, limit=limit, offset=offset)


@router.post("/held/{hold_id}/release", status_code=status.HTTP_204_NO_CONTENT)
async def release_held(
    hold_id: int, payload: HeldDecisionIn, moderator: Moderator, session: SessionDep
) -> None:
    await moderation_held.release(session, moderator, hold_id, payload.reason)


@router.post("/held/{hold_id}/remove", status_code=status.HTTP_204_NO_CONTENT)
async def remove_held(
    hold_id: int, payload: HeldDecisionIn, moderator: Moderator, session: SessionDep
) -> None:
    await moderation_held.remove(session, moderator, hold_id, payload.reason)
