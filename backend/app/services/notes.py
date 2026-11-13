"""Map notes: short public comments pinned to a 2GIS object or to bare coordinates (SPEC §13)."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.clock import utcnow
from app.core.errors import BadRequestError, ForbiddenError, NotFoundError, RateLimitedError
from app.domain import geo, limits
from app.domain.enums import AiTarget
from app.domain.geo import BBox
from app.models import MapNote, NoteReport, User
from app.schemas.note import MapNoteIn, MapNoteOut
from app.schemas.user import UserBrief
from app.services import content, moderation_cases, quiet_holds

DEFAULT_LIMIT = 300
MAX_LIMIT = 1000
DEFAULT_RADIUS_M = 40
MAX_RADIUS_M = 300
_NOT_FOUND = "Заметка не найдена."


@dataclass(frozen=True, slots=True)
class NoteSelector:
    """Exactly one of the three ways to pick notes."""

    bbox: BBox | None = None
    object_id: str | None = None
    near: tuple[float, float] | None = None
    radius_m: int = DEFAULT_RADIUS_M


async def _reported_ids(session: AsyncSession, viewer: User | None, note_ids: list[int]) -> set[int]:
    if viewer is None or not note_ids:
        return set()
    rows = await session.scalars(
        select(NoteReport.note_id).where(NoteReport.user_id == viewer.id, NoteReport.note_id.in_(note_ids))
    )
    return set(rows)


def _note_out(
    note: MapNote, viewer: User | None, *, reported_by_me: bool, on_review: bool = False
) -> MapNoteOut:
    return MapNoteOut(
        id=note.id,
        lat=note.lat,
        lng=note.lng,
        text=note.text,
        object_id=note.object_id,
        object_name=note.object_name,
        author=UserBrief.model_validate(note.author),
        created_at=note.created_at,
        can_delete=viewer is not None and (viewer.id == note.author_id or viewer.is_staff),
        reported_by_me=reported_by_me,
        on_review=on_review,
    )


async def list_notes(
    session: AsyncSession, viewer: User | None, selector: NoteSelector, limit: int
) -> list[MapNoteOut]:
    shown = MapNote.is_hidden.is_(False)
    if viewer is not None:
        own_held = and_(MapNote.author_id == viewer.id, MapNote.id.in_(quiet_holds.active_ids(AiTarget.NOTE)))
        shown = or_(shown, own_held)
    statement = select(MapNote).where(shown).options(joinedload(MapNote.author))
    area = selector.bbox or (geo.bbox_around(*selector.near, selector.radius_m) if selector.near else None)
    if area is not None:
        statement = statement.where(
            MapNote.lat.between(area.min_lat, area.max_lat), MapNote.lng.between(area.min_lng, area.max_lng)
        )
    if selector.object_id is not None:
        statement = statement.where(MapNote.object_id == selector.object_id)
    notes = list(await session.scalars(statement.order_by(MapNote.created_at.desc(), MapNote.id.desc())))
    if selector.near is not None:
        notes = [
            note for note in notes if geo.haversine_m(*selector.near, note.lat, note.lng) <= selector.radius_m
        ]
    notes = notes[:limit]
    reported = await _reported_ids(session, viewer, [note.id for note in notes])
    own = [note.id for note in notes if viewer is not None and note.author_id == viewer.id]
    held = await quiet_holds.held_ids(session, AiTarget.NOTE, own)
    return [
        _note_out(note, viewer, reported_by_me=note.id in reported, on_review=note.id in held)
        for note in notes
    ]


async def _enforce_daily_limit(session: AsyncSession, author: User, now: datetime) -> None:
    written = await session.scalar(
        select(func.count())
        .select_from(MapNote)
        .where(MapNote.author_id == author.id, MapNote.created_at > now - limits.DAY)
    )
    daily_limit = limits.notes_daily_limit(author.level, author.role)
    if (written or 0) >= daily_limit:
        raise RateLimitedError(f"Достигнут дневной лимит заметок: {daily_limit}. Попробуйте завтра.")


async def create_note(session: AsyncSession, author: User, payload: MapNoteIn) -> MapNoteOut:
    """Others see the note once it passes screening (SPEC §24.1); moderators' notes are not screened."""
    now = utcnow()
    content.ensure_clean_text(payload.text)
    await _enforce_daily_limit(session, author, now)
    screened = not author.is_staff
    note = MapNote(
        author=author,
        lat=payload.lat,
        lng=payload.lng,
        text=payload.text,
        object_id=payload.object_id,
        object_name=payload.object_name or None,
        is_hidden=screened,
        created_at=now,
    )
    session.add(note)
    await session.flush()
    if screened:
        await quiet_holds.open_window(
            session,
            AiTarget.NOTE,
            note.id,
            author.id,
            now=now,
            heuristic_reasons=content.gibberish_reasons({"текст": payload.text}),
        )
    await session.commit()
    return _note_out(note, author, reported_by_me=False)


async def _get_note(session: AsyncSession, note_id: int, actor: User) -> MapNote:
    """Hidden notes are gone, except a note still screened or held for its author and moderators."""
    note = await session.get(MapNote, note_id)
    if note is None:
        raise NotFoundError(_NOT_FOUND)
    if note.is_hidden:
        may_see = actor.is_staff or actor.id == note.author_id
        if not may_see or await quiet_holds.find_active(session, AiTarget.NOTE, note.id) is None:
            raise NotFoundError(_NOT_FOUND)
    return note


async def delete_note(session: AsyncSession, actor: User, note_id: int) -> None:
    now = utcnow()
    note = await _get_note(session, note_id, actor)
    if note.author_id != actor.id and not actor.is_staff:
        raise ForbiddenError("Удалить заметку может только автор или модератор.")
    await quiet_holds.withdraw(session, AiTarget.NOTE, note.id, now)
    await moderation_cases.close_cases_without_decision(session, AiTarget.NOTE, note.id, now)
    await session.execute(delete(NoteReport).where(NoteReport.note_id == note.id))
    await session.delete(note)
    await session.commit()


async def report_note(session: AsyncSession, reporter: User, note_id: int) -> None:
    """One report per user; enough distinct reports hide the note for everyone."""
    note = await _get_note(session, note_id, reporter)
    if note.author_id == reporter.id:
        raise BadRequestError("Нельзя жаловаться на собственную заметку.")
    already = await session.scalar(
        select(NoteReport.id).where(NoteReport.note_id == note.id, NoteReport.user_id == reporter.id)
    )
    if already is not None:
        return
    session.add(NoteReport(note_id=note.id, user_id=reporter.id, created_at=utcnow()))
    await session.flush()
    reports = await session.scalar(
        select(func.count()).select_from(NoteReport).where(NoteReport.note_id == note.id)
    )
    if (reports or 0) >= limits.NOTE_REPORTS_TO_HIDE:
        note.is_hidden = True
    await session.commit()
