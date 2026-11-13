from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel
from app.schemas.user import DisplayName, UserMe

Email = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_lower=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    ),
]
Username = Annotated[str, StringConstraints(pattern=r"^[a-z0-9_]{3,24}$")]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class CaptchaOut(ApiModel):
    token: str
    question: str


class RegisterIn(ApiModel):
    email: Email
    username: Username
    display_name: DisplayName
    password: Password
    captcha_token: str
    captcha_answer: str
    website: str = Field(default="", description="Honeypot: real users leave it empty.")


class LoginIn(ApiModel):
    email: str
    password: str


class TokenOut(ApiModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserMe
