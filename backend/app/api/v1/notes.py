from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.api.v1 import params
from app.core.deps import CurrentUser, OptionalUser, SessionDep
from app.core.errors import FieldValidationError
from app.domain.enums import AiTarget
from app.schemas.note import MapNoteIn, MapNoteOut
from app.services import notes
from app.services.ai_moderation.screener import AiScreener, get_ai_screener
from app.services.notes import NoteSelector

router = APIRouter(prefix="/notes", tags=["notes"])


def note_selector(
    bbox: str | None = None,
    object_id: Annotated[str | None, Query(max_length=64)] = None,
    near: str | None = None,
    radius_m: Annotated[int, Query(ge=1, le=notes.MAX_RADIUS_M)] = notes.DEFAULT_RADIUS_M,
) -> NoteSelector:
    if sum(value is not None for value in (bbox, object_id, near)) != 1:
        raise FieldValidationError("bbox", "Укажите ровно один параметр: bbox, object_id или near.")
    return NoteSelector(
        bbox=params.bbox(bbox), object_id=object_id, near=params.lat_lng(near, "near"), radius_m=radius_m
    )


@router.get("")
async def list_notes(
    selector: Annotated[NoteSelector, Depends(note_selector)],
    viewer: OptionalUser,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=notes.MAX_LIMIT)] = notes.DEFAULT_LIMIT,
) -> list[MapNoteOut]:
    return await notes.list_notes(session, viewer, selector, limit)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_note(
    payload: MapNoteIn,
    user: CurrentUser,
    session: SessionDep,
    screener: Annotated[AiScreener, Depends(get_ai_screener)],
) -> MapNoteOut:
    note = await notes.create_note(session, user, payload)
    await screener.submit(AiTarget.NOTE, note.id)
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(note_id: int, user: CurrentUser, session: SessionDep) -> None:
    await notes.delete_note(session, user, note_id)


@router.post("/{note_id}/report", status_code=status.HTTP_204_NO_CONTENT)
async def report_note(note_id: int, user: CurrentUser, session: SessionDep) -> None:
    await notes.report_note(session, user, note_id)
