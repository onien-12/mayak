from fastapi import APIRouter

from app.core.deps import SessionDep
from app.schemas.stats import Stats
from app.services import stats

router = APIRouter(tags=["stats"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/stats")
async def get_stats(session: SessionDep) -> Stats:
    return await stats.collect(session)
