"""Category catalog (SPEC §9)."""

import logging
from dataclasses import dataclass, field

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import Layer
from app.models import Category
from app.schemas.catalog import CategoryOut
from app.seed import catalog

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CatalogSync:
    added: list[str] = field(default_factory=list)
    updated: list[str] = field(default_factory=list)

    def summary(self) -> str:
        return f"added {self.added or 'none'}, updated {self.updated or 'none'}"


async def list_categories(session: AsyncSession, layer: Layer | None) -> list[CategoryOut]:
    """Ordered by layer (in the canonical layer order), group and id."""
    layer_order = case({member.value: index for index, member in enumerate(Layer)}, value=Category.layer)
    statement = select(Category).order_by(layer_order, Category.group, Category.id)
    if layer is not None:
        statement = statement.where(Category.layer == layer)
    return [CategoryOut.model_validate(row) for row in await session.scalars(statement)]


async def sync_categories(session: AsyncSession) -> CatalogSync:
    """Bring a seeded database in step with the catalogue: add the categories it lacks and refresh
    the group, name, icon and fields of the others. Never deletes one, never moves one to another
    layer (its places would end up on the wrong layer). An empty catalogue is left to the seed.
    Flushes; the caller commits."""
    result = CatalogSync()
    if not await session.scalar(select(func.count()).select_from(Category)):
        return result
    existing = {category.slug: category for category in await session.scalars(select(Category))}
    for slug, layer, group, name, icon, fields in catalog.CATEGORIES:
        category = existing.get(slug)
        if category is None:
            session.add(Category(slug=slug, layer=layer, group=group, name=name, icon=icon, fields=fields))
            result.added.append(slug)
            continue
        if category.layer is not layer:
            logger.warning("Category %s stays on layer %s (catalogue: %s)", slug, category.layer, layer)
        if (category.group, category.name, category.icon, category.fields) != (group, name, icon, fields):
            category.group, category.name, category.icon, category.fields = group, name, icon, fields
            result.updated.append(slug)
    await session.flush()
    return result
