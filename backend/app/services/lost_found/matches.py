"""Which posts may be the same thing (SPEC §26): the shortlist of the rules, ordered with the model's
judgements stored in `lost_matches`, and the plain search over found posts.

Pairs are computed on read — there are few active posts and they change rarely — so a pair the
model has not judged yet is simply shown on the rules' word.
"""

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.clock import utcnow
from app.core.errors import ForbiddenError
from app.domain import lost_found as rules
from app.domain.lost_found import LostCategory, LostKind, MatchVerdict
from app.models import LostItem, LostMatch, User
from app.schemas.lost_found import LostMatchOut
from app.services.lost_found import items

SHOWN_MATCHES = 10
SEARCH_LIMIT = 30


@dataclass(frozen=True, slots=True)
class Pair:
    lost: LostItem
    found: LostItem
    fit: rules.Fit

    def other(self, item: LostItem) -> LostItem:
        return self.found if item.id == self.lost.id else self.lost


def pair_fit(first: LostItem, second: LostItem) -> rules.Fit | None:
    lost, found = (first, second) if first.kind is LostKind.LOST else (second, first)
    return rules.fit(items.as_post(lost), items.as_post(found))


async def shortlist(session: AsyncSession, item: LostItem, now: datetime) -> list[Pair]:
    """Active public posts of the other kind by other people that the rules let through, best first."""
    other_kind = LostKind.FOUND if item.kind is LostKind.LOST else LostKind.LOST
    candidates = await session.scalars(
        select(LostItem)
        .where(items.active_clause(now), LostItem.kind == other_kind, LostItem.author_id != item.author_id)
        .options(joinedload(LostItem.author))
    )
    pairs: list[Pair] = []
    for candidate in candidates:
        fit = pair_fit(item, candidate)
        if rules.shortlisted(fit) and fit is not None:
            lost, found = (item, candidate) if item.kind is LostKind.LOST else (candidate, item)
            pairs.append(Pair(lost, found, fit))
    pairs.sort(key=lambda pair: (-pair.fit.score, -pair.other(item).id))
    return pairs


async def verdicts(session: AsyncSession, pairs: list[Pair]) -> dict[tuple[int, int], MatchVerdict | None]:
    if not pairs:
        return {}
    keys = {(pair.lost.id, pair.found.id) for pair in pairs}
    lost_ids = {lost_id for lost_id, _ in keys}
    rows = await session.execute(
        select(LostMatch.lost_id, LostMatch.found_id, LostMatch.verdict).where(
            LostMatch.lost_id.in_(lost_ids)
        )
    )
    return {
        (lost_id, found_id): verdict for lost_id, found_id, verdict in rows if (lost_id, found_id) in keys
    }


async def list_matches(session: AsyncSession, item: LostItem, viewer: User | None) -> list[LostMatchOut]:
    """«Похожие находки» of a lost post (anyone who sees the post), «Возможно, это ищут» of a found
    one (its author and moderators: who looks for what is the finder's business)."""
    if item.kind is LostKind.FOUND and not (
        viewer is not None and (viewer.id == item.author_id or viewer.is_staff)
    ):
        raise ForbiddenError("Кто может искать эту вещь, видит только автор объявления.")
    now = utcnow()
    if not items.is_active(item, now):
        return []
    pairs = await shortlist(session, item, now)
    judged = await verdicts(session, pairs)
    ranked = [
        (rules.rank(pair.fit, verdict), pair, verdict)
        for pair in pairs
        if rules.shown(pair.fit, verdict := judged.get((pair.lost.id, pair.found.id)))
    ]
    ranked.sort(key=lambda entry: -entry[0])
    ranked = ranked[:SHOWN_MATCHES]
    others = [pair.other(item) for _, pair, _ in ranked]
    cards = await items.cards(session, others, viewer, now)
    return [
        LostMatchOut(item=card, reason=rules.reason(pair.fit, verdict))
        for card, (_, pair, verdict) in zip(cards, ranked, strict=True)
    ]


@dataclass(frozen=True, slots=True)
class SearchQuery:
    text: str = ""
    category: LostCategory | None = None
    near: tuple[float, float] | None = None
    radius_m: int | None = None
    lost_on: date | None = None


async def search(
    session: AsyncSession, viewer: User | None, query: SearchQuery, limit: int = SEARCH_LIMIT
) -> list[LostMatchOut]:
    """«Что потеряли, где, когда» as a filter over found posts — no account needed, nothing stored."""
    now = utcnow()
    asked = rules.Post(
        title=query.text,
        category=query.category,
        point=query.near,
        radius_m=(query.radius_m or rules.SEARCH_RADIUS_M) if query.near is not None else None,
        happened_on=query.lost_on,
    )
    found = await session.scalars(
        select(LostItem)
        .where(items.active_clause(now), LostItem.kind == LostKind.FOUND)
        .options(joinedload(LostItem.author))
        .order_by(LostItem.created_at.desc(), LostItem.id.desc())
    )
    fits = [
        (fit, item) for item in found if (fit := rules.search_fit(asked, items.as_post(item))) is not None
    ]
    fits.sort(key=lambda entry: -entry[0].score)
    fits = fits[:limit]
    cards = await items.cards(session, [item for _, item in fits], viewer, now)
    return [
        LostMatchOut(item=card, reason=rules.reason(fit, None))
        for card, (fit, _) in zip(cards, fits, strict=True)
    ]
