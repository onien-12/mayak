"""Common FastAPI dependencies: database session and the authenticated user in three modes."""

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.database import get_session
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import decode_access_token
from app.domain import levels
from app.models import User

_bearer = HTTPBearer(auto_error=False)

SessionDep = Annotated[AsyncSession, Depends(get_session)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_app_settings)]


async def get_optional_user(
    session: SessionDep, settings: SettingsDep, credentials: Credentials
) -> User | None:
    """The user behind a valid token; anonymous (None) when the token is absent or invalid."""
    if credentials is None:
        return None
    user_id = decode_access_token(credentials.credentials, secret=settings.secret_key)
    if user_id is None:
        return None
    return await session.get(User, user_id)


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


async def get_current_user(user: OptionalUser) -> User:
    if user is None:
        raise UnauthorizedError("Войдите в аккаунт, чтобы продолжить.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_moderator(user: CurrentUser) -> User:
    if not levels.is_staff(user.role):
        raise ForbiddenError("Раздел доступен только модераторам.")
    return user


Moderator = Annotated[User, Depends(get_moderator)]
