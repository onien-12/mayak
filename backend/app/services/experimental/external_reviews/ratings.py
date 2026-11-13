"""The sources' ratings already in the cache, for a whole page of places or areas (SPEC §22).

The package's interface for core code. Only matched rows that `cached_for` would serve count:
current evidence for the target's fingerprint, younger than a week. Never asks a source, and reads
three tables in one query each whatever the number of targets — no review texts are loaded.
"""

from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.domain.combined_rating import RatingPart
from app.models import Area, Category, Place
from app.services.experimental.external_reviews import targets
from app.services.experimental.external_reviews.models import (
    CatalogueReviewSource,
    ExternalReviewSource,
    Outcome,
    ReviewMatchEvidence,
)
from app.services.experimental.external_reviews.service import Target, is_cached

SOURCE_ORDER = ("yandex", "2gis", "google")


async def for_places(session: AsyncSession, places: Sequence[Place]) -> dict[int, list[RatingPart]]:
    """Requires `place.area` loaded. Places that are never looked up have no parts."""
    category_ids = {place.category_id for place in places}
    category_names = dict(
        (await session.execute(select(Category.id, Category.name).where(Category.id.in_(category_ids)))).all()
    )
    found = [targets.place_target(place, category_names[place.category_id]) for place in places]
    return await _parts(session, [target for target in found if target is not None], areas=False)


async def for_areas(session: AsyncSession, areas: Sequence[Area]) -> dict[int, list[RatingPart]]:
    return await _parts(session, [targets.for_area(area) for area in areas], areas=True)


def _target_column(model: type[Any], areas: bool) -> Any:
    return model.area_id if areas else model.place_id


async def _parts(
    session: AsyncSession, found: Sequence[Target], *, areas: bool
) -> dict[int, list[RatingPart]]:
    """Per place (or area) id: the sources' ratings in `SOURCE_ORDER`."""
    by_id = {target.area_id if areas else target.place_id: target for target in found}
    if not by_id:
        return {}
    proof = ReviewMatchEvidence
    evidence = {
        (row.source, row.area_id if areas else row.place_id): row
        for row in await session.execute(
            select(
                proof.source,
                proof.place_id,
                proof.area_id,
                proof.fingerprint,
                proof.org_id,
                proof.fetched_at,
                proof.method,
            ).where(_target_column(proof, areas).in_(by_id))
        )
    }
    rows = [
        ("yandex", row)
        for row in await session.execute(
            select(*_columns(ExternalReviewSource)).where(
                _target_column(ExternalReviewSource, areas).in_(by_id)
            )
        )
    ]
    rows += [
        (row.source, row)
        for row in await session.execute(
            select(CatalogueReviewSource.source, *_columns(CatalogueReviewSource)).where(
                _target_column(CatalogueReviewSource, areas).in_(by_id)
            )
        )
    ]
    now = utcnow()
    parts: dict[int, list[RatingPart]] = {}
    for source, row in sorted(rows, key=lambda item: SOURCE_ORDER.index(item[0])):
        identifier = row.area_id if areas else row.place_id
        if row.outcome is not Outcome.MATCHED or row.rating is None:
            continue
        if not is_cached(row, evidence.get((source, identifier)), now, by_id[identifier]):
            continue
        count = row.ratings_count if row.ratings_count is not None else row.reviews_count
        parts.setdefault(identifier, []).append(RatingPart(source, row.rating, count))
    return parts


def _columns(model: type[Any]) -> list[Any]:
    """What a rating needs from a cache row, and what `is_cached` checks; never the review texts."""
    return [
        model.place_id,
        model.area_id,
        model.outcome,
        model.org_id,
        model.rating,
        model.ratings_count,
        model.reviews_count,
        model.fetched_at,
    ]
