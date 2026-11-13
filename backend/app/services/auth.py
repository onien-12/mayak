"""Registration with captcha and honeypot, login, access tokens."""

from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.clock import utcnow
from app.core.config import Settings
from app.core.errors import BadRequestError, ConflictError, UnauthorizedError
from app.models import User
from app.schemas.auth import CaptchaOut, LoginIn, RegisterIn, TokenOut
from app.services import users


def new_captcha(settings: Settings) -> CaptchaOut:
    token, question = security.issue_captcha(secret=settings.secret_key, now=utcnow())
    return CaptchaOut(token=token, question=question)


async def _issue_token(session: AsyncSession, user: User, settings: Settings) -> TokenOut:
    now = utcnow()
    access_token = security.create_access_token(
        user.id, secret=settings.secret_key, ttl=timedelta(days=settings.access_token_ttl_days), now=now
    )
    return TokenOut(access_token=access_token, user=await users.build_me(session, user, now))


async def register(session: AsyncSession, settings: Settings, payload: RegisterIn) -> TokenOut:
    now = utcnow()
    if payload.website:
        raise BadRequestError(
            "Не удалось завершить регистрацию. Попробуйте ещё раз.", code="registration_rejected"
        )
    if not security.verify_captcha(
        payload.captcha_token, payload.captcha_answer, secret=settings.secret_key, now=now
    ):
        raise BadRequestError(
            "Неверный ответ на проверочный вопрос. Попробуйте ещё раз.", code="captcha_failed"
        )
    taken = await session.scalar(
        select(User).where(or_(User.email == payload.email, User.username == payload.username))
    )
    if taken is not None:
        field = "E-mail" if taken.email == payload.email else "Имя пользователя"
        raise ConflictError(f"{field} уже используется.")
    user = User(
        email=payload.email,
        username=payload.username,
        display_name=payload.display_name,
        password_hash=security.hash_password(payload.password),
        created_at=now,
    )
    session.add(user)
    await session.commit()
    return await _issue_token(session, user, settings)


async def login(session: AsyncSession, settings: Settings, payload: LoginIn) -> TokenOut:
    user = await session.scalar(select(User).where(User.email == payload.email.strip().lower()))
    is_valid = (
        user is not None
        and not user.is_system
        and security.verify_password(payload.password, user.password_hash)
    )
    if not is_valid:
        raise UnauthorizedError("Неверный e-mail или пароль.", code="invalid_credentials")
    return await _issue_token(session, user, settings)
