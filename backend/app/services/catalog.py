"""Category catalog (SPEC §9)."""

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import Layer
from app.models import Category
from app.schemas.catalog import CategoryOut


async def list_categories(session: AsyncSession, layer: Layer | None) -> list[CategoryOut]:
    """Ordered by layer (in the canonical layer order), group and id."""
    layer_order = case({member.value: index for index, member in enumerate(Layer)}, value=Category.layer)
    statement = select(Category).order_by(layer_order, Category.group, Category.id)
    if layer is not None:
        statement = statement.where(Category.layer == layer)
    return [CategoryOut.model_validate(row) for row in await session.scalars(statement)]
