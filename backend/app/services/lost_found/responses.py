"""Responses to «Потеряшки» posts (SPEC §26): «Это моё» and «Я нашёл это», without exposing contacts.

A response is seen by the post's author and by the one who wrote it, nobody else. It carries the
responder's contact, which the author sees only after accepting; accepting asks for the author's
own contact, and from then on the two see each other's. There is no chat: the message is one
text (with the answer to the control question), the rest happens by phone or messenger.
"""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.clock import utcnow
from app.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError, RateLimitedError
from app.domain import limits
from app.domain import lost_found as rules
from app.domain.enums import AiTarget, NotificationKind
from app.domain.lost_found import LostKind, LostState, ResponseState
from app.models import LostItem, LostResponse, User
from app.schemas.lost_found import LostResponseOut
from app.schemas.user import UserBrief
from app.services import content, notifications, quiet_holds

_NOT_FOUND = "Отклик не найден."
_TITLE_LIMIT = 60


def item_link(item_id: int) -> str:
    return f"/lost/{item_id}"


def quoted(title: str) -> str:
    return f"«{title if len(title) <= _TITLE_LIMIT else title[: _TITLE_LIMIT - 1] + '…'}»"


def response_out(
    response: LostResponse, item: LostItem, viewer: User, *, on_review: bool = False
) -> LostResponseOut:
    """Contacts are filled for the viewer: their own always, the other side's once accepted.
    Requires `response.author` to be loaded."""
    accepted = response.state is ResponseState.ACCEPTED
    is_responder = viewer.id == response.author_id
    is_owner = viewer.id == item.author_id
    return LostResponseOut(
        id=response.id,
        item_id=item.id,
        author=UserBrief.model_validate(response.author),
        message=response.message,
        state=response.state,
        created_at=response.created_at,
        decided_at=response.decided_at,
        on_review=on_review,
        contact=response.contact if is_responder or (is_owner and accepted) else None,
        owner_contact=response.owner_contact if is_owner or (is_responder and accepted) else None,
    )


async def own_response(session: AsyncSession, item: LostItem, viewer: User) -> LostResponseOut | None:
    response = await session.scalar(
        select(LostResponse)
        .where(LostResponse.item_id == item.id, LostResponse.author_id == viewer.id)
        .options(joinedload(LostResponse.author))
    )
    if response is None:
        return None
    held = await quiet_holds.held_ids(session, AiTarget.LOST_RESPONSE, [response.id])
    return response_out(response, item, viewer, on_review=response.id in held)


async def pending_count(session: AsyncSession, item_id: int) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(LostResponse)
        .where(
            LostResponse.item_id == item_id,
            LostResponse.is_hidden.is_(False),
            LostResponse.state == ResponseState.PENDING,
        )
    )
    return count or 0


async def list_responses(session: AsyncSession, item: LostItem, viewer: User) -> list[LostResponseOut]:
    """The author reads every response that passed screening; a responder only their own."""
    if viewer.id != item.author_id:
        own = await own_response(session, item, viewer)
        if own is None:
            raise ForbiddenError("Отклики видит только автор объявления.")
        return [own]
    rows = await session.scalars(
        select(LostResponse)
        .where(LostResponse.item_id == item.id, LostResponse.is_hidden.is_(False))
        .options(joinedload(LostResponse.author))
        .order_by(LostResponse.created_at.desc(), LostResponse.id.desc())
    )
    return [response_out(response, item, viewer) for response in rows]


async def _enforce_daily_limit(session: AsyncSession, author: User, now: datetime) -> None:
    sent = await session.scalar(
        select(func.count())
        .select_from(LostResponse)
        .where(LostResponse.author_id == author.id, LostResponse.created_at > now - limits.DAY)
    )
    if (sent or 0) >= rules.RESPONSES_PER_DAY:
        raise RateLimitedError(f"Достигнут дневной лимит откликов: {rules.RESPONSES_PER_DAY}.")


def announce(session: AsyncSession, item: LostItem, now: datetime) -> None:
    """Tell the post's author about a response, once it is visible to them."""
    body = (
        "Кто-то считает, что это его вещь — прочитайте ответ и решите."
        if item.kind is LostKind.FOUND
        else "Возможно, вашу вещь нашли — прочитайте ответ и решите."
    )
    notifications.notify(
        session,
        user_id=item.author_id,
        kind=NotificationKind.LOST_FOUND,
        title=f"Отклик на {quoted(item.title)}",
        body=body,
        link=item_link(item.id),
        now=now,
    )


async def create_response(
    session: AsyncSession, author: User, item: LostItem, message: str, contact: str
) -> LostResponseOut:
    """The post's author hears about it once the response passes screening (SPEC §24.1)."""
    now = utcnow()
    if item.author_id == author.id:
        raise BadRequestError("Нельзя откликнуться на собственное объявление.")
    if item.is_hidden or rules.state(item.created_at, item.closed_at, now) is not LostState.ACTIVE:
        raise ConflictError("Объявление уже закрыто — откликнуться нельзя.")
    already = await session.scalar(
        select(LostResponse.id).where(LostResponse.item_id == item.id, LostResponse.author_id == author.id)
    )
    if already is not None:
        raise ConflictError("Вы уже откликнулись на это объявление.")
    content.ensure_clean_text(message)
    await _enforce_daily_limit(session, author, now)
    screened = not author.is_staff
    response = LostResponse(
        item_id=item.id,
        author=author,
        message=message,
        contact=contact,
        is_hidden=screened,
        created_at=now,
    )
    session.add(response)
    await session.flush()
    if screened:
        await quiet_holds.open_window(
            session,
            AiTarget.LOST_RESPONSE,
            response.id,
            author.id,
            now=now,
            heuristic_reasons=content.gibberish_reasons({"текст": message}),
        )
    else:
        announce(session, item, now)
    await session.commit()
    return response_out(response, item, author)


async def get_response(session: AsyncSession, response_id: int) -> tuple[LostResponse, LostItem]:
    response = await session.scalar(
        select(LostResponse).where(LostResponse.id == response_id).options(joinedload(LostResponse.author))
    )
    item = await session.get(LostItem, response.item_id) if response is not None else None
    if response is None or item is None or response.is_hidden:
        raise NotFoundError(_NOT_FOUND)
    return response, item


async def decide(
    session: AsyncSession, actor: User, response_id: int, *, accept: bool, contact: str | None = None
) -> LostResponseOut:
    """The post's author accepts (giving their own contact) or declines; the responder is told."""
    now = utcnow()
    response, item = await get_response(session, response_id)
    if item.author_id != actor.id:
        raise ForbiddenError("Ответить на отклик может только автор объявления.")
    if response.state is not ResponseState.PENDING:
        raise ConflictError("На этот отклик уже ответили.")
    response.state = ResponseState.ACCEPTED if accept else ResponseState.DECLINED
    response.owner_contact = contact if accept else None
    response.decided_at = now
    if accept:
        title = f"Автор {quoted(item.title)} принял ваш отклик"
        body = "Контакты открыты — договоритесь о встрече."
    else:
        title = f"Автор {quoted(item.title)} отклонил ваш отклик"
        body = "Похоже, это другая вещь. Объявления с похожими вещами — во вкладке «Потеряшки»."
    notifications.notify(
        session,
        user_id=response.author_id,
        kind=NotificationKind.LOST_FOUND,
        title=title,
        body=body,
        link=item_link(item.id),
        now=now,
    )
    await session.commit()
    return response_out(response, item, actor)


async def show(session: AsyncSession, response_id: int, now: datetime) -> None:
    """Screening released the response: the post's author sees it and is told."""
    response = await session.get(LostResponse, response_id)
    if response is None or not response.is_hidden:
        return
    response.is_hidden = False
    item = await session.get(LostItem, response.item_id)
    if item is not None:
        announce(session, item, now)
