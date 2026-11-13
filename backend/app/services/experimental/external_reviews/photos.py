"""The sources' photos already in the cache, for the covers of a page of places or areas (SPEC §20, §25).

The package's second interface for core code, next to `ratings`. A photo is offered only from a
match whose identity still holds — evidence of that very answer for the target's current
fingerprint — but, unlike the reviews, not only within the week the cache is fresh: the photo is
hot-linked, and one that no longer loads gives way to the placeholder. A place is never offered
the photos of the location it lies in (`cover.shows_the_parent`). Never asks a source, and reads
a fixed number of tables whatever the number of targets — no review texts are loaded.
"""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import cover
from app.domain.cover import CataloguePhotos
from app.models import Area, Category, Place
from app.services.experimental.external_reviews import targets
from app.services.experimental.external_reviews.models import (
    CatalogueReviewSource,
    ExternalReviewSource,
    Outcome,
    ReviewMatchEvidence,
)
from app.services.experimental.external_reviews.service import Target, identity_holds


@dataclass(frozen=True, slots=True)
class _Offer:
    photos: CataloguePhotos
    entry_id: str | None
    entry_title: str | None
    """The source's own name of the matched entry, from the evidence."""


async def for_places(session: AsyncSession, places: Sequence[Place]) -> dict[int, list[CataloguePhotos]]:
    """Requires `place.area` loaded. Places that are never looked up have none."""
    if not places:
        return {}
    category_ids = {place.category_id for place in places}
    category_names = dict(
        (await session.execute(select(Category.id, Category.name).where(Category.id.in_(category_ids)))).all()
    )
    found = [targets.place_target(place, category_names[place.category_id]) for place in places]
    offers = await _offers(session, [target for target in found if target is not None], areas=False)
    parents = await _parent_entries(session, {place.area_id for place in places if place.id in offers})
    kept: dict[int, list[CataloguePhotos]] = {}
    for place in places:
        parent_title = place.area.title if place.area is not None else None
        for offer in offers.get(place.id, ()):
            parent_ids = parents.get((place.area_id, offer.photos.source), set())
            if not cover.shows_the_parent(
                place.title, parent_title, offer.entry_id, offer.entry_title, parent_ids
            ):
                kept.setdefault(place.id, []).append(offer.photos)
    return kept


async def for_areas(session: AsyncSession, areas: Sequence[Area]) -> dict[int, list[CataloguePhotos]]:
    offers = await _offers(session, [targets.for_area(area) for area in areas], areas=True)
    return {identifier: [offer.photos for offer in found] for identifier, found in offers.items()}


def matched_places() -> Any:
    """Ids of the places some source has a match for — a cheap pre-filter for locations looking
    for a cover among their places; `for_places` still checks identity and photos."""
    yandex = select(ExternalReviewSource.place_id).where(
        ExternalReviewSource.outcome == Outcome.MATCHED, ExternalReviewSource.place_id.is_not(None)
    )
    others = select(CatalogueReviewSource.place_id).where(
        CatalogueReviewSource.outcome == Outcome.MATCHED, CatalogueReviewSource.place_id.is_not(None)
    )
    return yandex.union(others)


async def _parent_entries(
    session: AsyncSession, area_ids: set[int | None]
) -> dict[tuple[int, str], set[str]]:
    """The entries each source matched for these locations, by (area id, source)."""
    wanted = {identifier for identifier in area_ids if identifier is not None}
    if not wanted:
        return {}
    proof = ReviewMatchEvidence
    found: dict[tuple[int, str], set[str]] = defaultdict(set)
    for area_id, source, org_id in await session.execute(
        select(proof.area_id, proof.source, proof.org_id).where(
            proof.area_id.in_(wanted), proof.org_id.is_not(None)
        )
    ):
        found[(area_id, source)].add(org_id)
    return found


def _target_column(model: type[Any], areas: bool) -> Any:
    return model.area_id if areas else model.place_id


async def _offers(session: AsyncSession, found: Sequence[Target], *, areas: bool) -> dict[int, list[_Offer]]:
    """Per place (or area) id: every source's photos of a match that still holds."""
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
                proof.title,
                proof.fetched_at,
            ).where(_target_column(proof, areas).in_(by_id))
        )
    }
    rows = [
        ("yandex", row)
        for row in await session.execute(
            select(*_columns(ExternalReviewSource)).where(
                _target_column(ExternalReviewSource, areas).in_(by_id),
                ExternalReviewSource.outcome == Outcome.MATCHED,
            )
        )
    ]
    rows += [
        (row.source, row)
        for row in await session.execute(
            select(CatalogueReviewSource.source, *_columns(CatalogueReviewSource)).where(
                _target_column(CatalogueReviewSource, areas).in_(by_id),
                CatalogueReviewSource.outcome == Outcome.MATCHED,
            )
        )
    ]
    offers: dict[int, list[_Offer]] = {}
    for source, row in rows:
        identifier = row.area_id if areas else row.place_id
        proof_row = evidence.get((source, identifier))
        if not row.photos or row.url is None or not identity_holds(row, proof_row, by_id[identifier]):
            continue
        urls = tuple(url for url in row.photos if isinstance(url, str) and url.startswith("https://"))
        if urls:
            photos = CataloguePhotos(source, urls, row.url)
            offers.setdefault(identifier, []).append(_Offer(photos, row.org_id, proof_row.title))
    return offers


def _columns(model: type[Any]) -> list[Any]:
    """What a cover needs from a cache row, and what `identity_holds` checks; never the reviews."""
    return [model.place_id, model.area_id, model.org_id, model.url, model.photos, model.fetched_at]
