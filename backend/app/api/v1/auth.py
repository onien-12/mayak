from fastapi import APIRouter, Depends, status

from app.core.deps import CurrentUser, SessionDep, SettingsDep
from app.core.rate_limit import limit_by_ip
from app.domain import limits
from app.schemas.auth import CaptchaOut, LoginIn, RegisterIn, TokenOut
from app.schemas.user import UserMe
from app.services import auth, users

router = APIRouter(prefix="/auth", tags=["auth"])

_registration_limit = limit_by_ip(
    "register",
    limit=limits.REGISTRATIONS_PER_WINDOW,
    window=limits.REGISTRATION_WINDOW,
    message="Слишком много регистраций с вашего адреса. Попробуйте позже.",
)
_login_limit = limit_by_ip(
    "login",
    limit=limits.LOGINS_PER_WINDOW,
    window=limits.LOGIN_WINDOW,
    message="Слишком много попыток входа. Подождите несколько минут.",
)


@router.get("/captcha")
async def get_captcha(settings: SettingsDep) -> CaptchaOut:
    return auth.new_captcha(settings)


@router.post("/register", status_code=status.HTTP_201_CREATED, dependencies=[Depends(_registration_limit)])
async def register(payload: RegisterIn, session: SessionDep, settings: SettingsDep) -> TokenOut:
    return await auth.register(session, settings, payload)


@router.post("/login", dependencies=[Depends(_login_limit)])
async def login(payload: LoginIn, session: SessionDep, settings: SettingsDep) -> TokenOut:
    return await auth.login(session, settings, payload)


@router.get("/me")
async def get_me(user: CurrentUser, session: SessionDep) -> UserMe:
    return await users.get_me(session, user)
