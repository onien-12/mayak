"""CLI: `uv run python -m app.services.experimental.external_reviews.warmup [--limit N]` (SPEC §20).

Looks up the most notable eligible objects that have no cached answer yet — areas by interest
and community tourism places by trust, taken in turns — one after another through the same
service as the cards: at least 4 seconds between requests, within the daily cap, with the judge
when one is configured. A run stops at the first refused lookup (`blocked`) — asking a source
that refuses object after object is pointless — and when the daily cap is reached. Works on the
configured database even while the feature is switched off for the app, so a demo database can
have reviews ready.
"""

import argparse
import asyncio
from collections import Counter
from collections.abc import Iterator, Sequence
from itertools import zip_longest

from sqlalchemy import and_, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.clock import utcnow
from app.core.config import get_settings
from app.core.database import Database
from app.domain.enums import PUBLIC_STATUSES, Layer
from app.models import Area, Place
from app.services.experimental.external_reviews import assembly, rules, targets
from app.services.experimental.external_reviews.config import ReviewsSettings
from app.services.experimental.external_reviews.models import (
    CatalogueReviewSource,
    ExternalReviewSource,
    Outcome,
    ReviewMatchEvidence,
)
from app.services.experimental.external_reviews.resolver import UNCONFIRMED
from app.services.experimental.external_reviews.schemas import SourceName
from app.services.experimental.external_reviews.service import ExternalReviewsService, Target

DEFAULT_LIMIT = 40


async def _known(
    session: AsyncSession, source: str = "yandex", *, judged: bool = False
) -> tuple[dict[int, str], dict[int, str]]:
    """Places and areas with an answer younger than the cache lifetime, or a refused or failed
    lookup (or, with a judge, an unjudged "no match") not yet due for a retry — the same rule as
    the service's `is_cached`."""
    model = ExternalReviewSource if source == "yandex" else CatalogueReviewSource
    proof = ReviewMatchEvidence
    now = utcnow()
    retried = model.outcome.in_((Outcome.BLOCKED, Outcome.FAILED))
    if judged:
        retried = retried | ((model.outcome == Outcome.NO_MATCH) & (proof.method == UNCONFIRMED))
    query = (
        select(model.place_id, model.area_id, proof.fingerprint)
        .join(
            proof,
            (
                (proof.source == source)
                & proof.place_id.is_not_distinct_from(model.place_id)
                & proof.area_id.is_not_distinct_from(model.area_id)
                & proof.org_id.is_not_distinct_from(model.org_id)
                & (proof.fetched_at == model.fetched_at)
            ),
        )
        .where(
            or_(
                and_(~retried, model.fetched_at > now - rules.CACHE_TTL),
                and_(retried, model.fetched_at > now - rules.RETRY_FAILED_AFTER),
            ),
            true() if source == "yandex" else CatalogueReviewSource.source == source,
        )
    )
    rows = await session.execute(query)
    places: dict[int, str] = {}
    areas: dict[int, str] = {}
    for place_id, area_id, fingerprint in rows:
        if place_id is not None:
            places[place_id] = fingerprint
        else:
            areas[area_id] = fingerprint
    return places, areas


async def candidates(
    session: AsyncSession, limit: int, source: str = "yandex", *, judged: bool = False
) -> list[Target]:
    """Up to `limit` uncached targets: the best area, the best place, the next area, …"""
    known_places, known_areas = await _known(session, source, judged=judged)
    area_rows = await session.scalars(select(Area).order_by(Area.interest.desc(), Area.id))
    place_rows = await session.scalars(
        select(Place)
        .options(joinedload(Place.category), joinedload(Place.area))
        .where(
            Place.layer == Layer.TOURISM,
            Place.external_source.is_(None),
            Place.status.in_(PUBLIC_STATUSES),
        )
        .order_by(Place.trust_score.desc(), Place.id)
    )
    area_targets = [
        target
        for target in map(targets.for_area, area_rows)
        if known_areas.get(target.area_id) != target.fingerprint
    ]
    place_targets = [
        target
        for target in map(targets.for_place, place_rows)
        if target is not None and known_places.get(target.place_id) != target.fingerprint
    ]
    return list(_alternate(area_targets, place_targets))[:limit]


def _alternate(first: Sequence[Target], second: Sequence[Target]) -> Iterator[Target]:
    for pair in zip_longest(first, second):
        yield from (target for target in pair if target is not None)


async def run(service: ExternalReviewsService, queue: Sequence[Target]) -> Counter[str]:
    """Look the targets up in order; stops at the first refusal or the first target the source
    was not asked about (the daily cap)."""
    outcomes: Counter[str] = Counter()
    for target in queue:
        outcome = await service.warm(target)
        if outcome is None or outcome is Outcome.BLOCKED:
            outcomes["stopped" if outcome is None else Outcome.BLOCKED.value] += 1
            break
        outcomes[outcome.value] += 1
        print(f"  {outcome.value:<8} {target.subject.title}")
    return outcomes


async def _main(limit: int, source: str = "all") -> None:
    app_settings = get_settings()
    database = Database(app_settings.database_url)
    settings = ReviewsSettings()
    resolver = assembly.resolver(settings, app_settings.openrouter_api_key)
    try:
        await database.create_schema()
        names: list[SourceName] = list(assembly.PROVIDERS)
        for name in names:
            if source not in ("all", name):
                continue
            service = assembly.service(database.session_factory, settings, name, resolver)
            async with database.session_factory() as session:
                queue = await candidates(session, limit, name, judged=resolver.judges)
            label = assembly.PROVIDERS[name][0].label
            print(
                f"Отзывы {label}: в очереди {len(queue)}, "
                f"запросы не чаще раза в {rules.REQUEST_INTERVAL_S:g} с."
            )
            outcomes = await run(service, queue)
            print(f"Итог {label}: {dict(outcomes)}")
    finally:
        await database.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Заранее найти отзывы для самых заметных мест и локаций.")
    parser.add_argument(
        "--limit", type=int, default=DEFAULT_LIMIT, help="сколько объектов спросить (по умолчанию 40)"
    )
    parser.add_argument("--source", choices=("all", "yandex", "2gis", "google"), default="all")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit должен быть положительным")
    asyncio.run(_main(args.limit, args.source))


if __name__ == "__main__":
    main()
