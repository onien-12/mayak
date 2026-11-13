from fastapi import APIRouter, UploadFile, status

from app.core.deps import CurrentUser, SessionDep, SettingsDep
from app.domain import limits
from app.schemas.place import PhotoOut
from app.services import uploads

router = APIRouter(tags=["uploads"])


@router.post("/uploads", status_code=status.HTTP_201_CREATED)
async def upload_photo(
    file: UploadFile, user: CurrentUser, session: SessionDep, settings: SettingsDep
) -> PhotoOut:
    data = await file.read(limits.MAX_UPLOAD_BYTES + 1)
    return await uploads.upload_photo(session, user, data, settings.media_dir)
