"""Comments under a place."""

from datetime import datetime

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.clock import utcnow
from app.core.errors import ForbiddenError, NotFoundError
from app.domain.enums import AiTarget, NotificationKind
from app.models import Comment, Place, User
from app.schemas.feedback import CommentIn, CommentOut
from app.services import content, mappers, moderation_cases, notifications, place_queries, quiet_holds

_PREVIEW_LENGTH = 140


def visible_clause(viewer: User | None) -> object:
    """Shown comments, plus the viewer's own ones still being screened or held (SPEC §24.1)."""
    shown = Comment.is_hidden.is_(False)
    if viewer is None:
        return shown
    own_held = and_(Comment.author_id == viewer.id, Comment.id.in_(quiet_holds.active_ids(AiTarget.COMMENT)))
    return or_(shown, own_held)


async def list_comments(session: AsyncSession, place_id: int, viewer: User | None) -> list[CommentOut]:
    place = await place_queries.get_visible_place(session, place_id, viewer)
    rows = list(
        await session.scalars(
            select(Comment)
            .where(Comment.place_id == place.id, visible_clause(viewer))
            .options(joinedload(Comment.author))
            .order_by(Comment.created_at, Comment.id)
        )
    )
    own = [row.id for row in rows if viewer is not None and row.author_id == viewer.id]
    held = await quiet_holds.held_ids(session, AiTarget.COMMENT, own)
    return [mappers.comment_out(row, viewer, on_review=row.id in held) for row in rows]


def announce(session: AsyncSession, place: Place, comment: Comment, now: datetime) -> None:
    """Count the comment and tell the place's author; requires `place.author` and
    `comment.author` to be loaded."""
    place.comments_count += 1
    if comment.author_id != place.author_id and not place.author.is_system:
        notifications.notify(
            session,
            user_id=place.author_id,
            kind=NotificationKind.COMMENT,
            title=f"{comment.author.display_name} оставил(а) комментарий",
            body=f"«{place.title}»: {comment.text[:_PREVIEW_LENGTH]}",
            link=notifications.place_link(place.id),
            now=now,
        )


async def insert_comment(
    session: AsyncSession, place: Place, author: User, text: str, now: datetime, *, screened: bool = False
) -> Comment:
    """A screened comment stays hidden, uncounted and unannounced until it is released."""
    comment = Comment(place_id=place.id, author=author, text=text, is_hidden=screened, created_at=now)
    session.add(comment)
    if not screened:
        announce(session, place, comment, now)
    await session.flush()
    return comment


async def add_comment(session: AsyncSession, author: User, place_id: int, payload: CommentIn) -> CommentOut:
    now = utcnow()
    place = await place_queries.get_visible_place(session, place_id, author)
    content.ensure_clean_text(payload.text)
    screened = not author.is_staff
    comment = await insert_comment(session, place, author, payload.text, now, screened=screened)
    if screened:
        await quiet_holds.open_window(
            session,
            AiTarget.COMMENT,
            comment.id,
            author.id,
            now=now,
            heuristic_reasons=content.gibberish_reasons({"текст": payload.text}),
        )
    await session.commit()
    return mappers.comment_out(comment, author)


async def delete_comment(session: AsyncSession, actor: User, comment_id: int) -> None:
    comment = await session.get(Comment, comment_id)
    if comment is None:
        raise NotFoundError("Комментарий не найден.")
    if comment.author_id != actor.id and not actor.is_staff:
        raise ForbiddenError("Удалить комментарий может только автор или модератор.")
    if not comment.is_hidden:
        place = await session.get(Place, comment.place_id)
        place.comments_count = max(place.comments_count - 1, 0)
    await quiet_holds.withdraw(session, AiTarget.COMMENT, comment.id, utcnow())
    await moderation_cases.close_cases_without_decision(session, AiTarget.COMMENT, comment.id, utcnow())
    await session.delete(comment)
    await session.commit()
