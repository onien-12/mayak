from fastapi import APIRouter

from app.core.deps import SessionDep
from app.domain.enums import Layer
from app.schemas.catalog import CategoryOut
from app.services import catalog

router = APIRouter(tags=["catalog"])


@router.get("/categories")
async def list_categories(session: SessionDep, layer: Layer | None = None) -> list[CategoryOut]:
    return await catalog.list_categories(session, layer)
