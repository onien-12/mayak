from fastapi import APIRouter, status

from app.core.deps import CurrentUser, SessionDep
from app.schemas.complaint import ComplaintCreated, ComplaintIn
from app.services import complaints

router = APIRouter(tags=["complaints"])


@router.post("/complaints", status_code=status.HTTP_201_CREATED)
async def create_complaint(payload: ComplaintIn, user: CurrentUser, session: SessionDep) -> ComplaintCreated:
    return await complaints.create_complaint(session, user, payload)
