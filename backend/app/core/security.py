"""Password hashing, JWT access tokens and the stateless signed captcha."""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.domain.limits import CAPTCHA_TTL

JWT_ALGORITHM = "HS256"
_CAPTCHA_MIN_OPERAND = 2
_CAPTCHA_MAX_OPERAND = 9

_password_hash = PasswordHash((Argon2Hasher(),))


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hash.verify(password, password_hash)


def create_access_token(user_id: int, *, secret: str, ttl: timedelta, now: datetime) -> str:
    return jwt.encode({"sub": str(user_id), "iat": now, "exp": now + ttl}, secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str, *, secret: str) -> int | None:
    """User id from a valid, unexpired token; None otherwise."""
    try:
        payload = jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def _captcha_signature(secret: str, expires_at: int, nonce: str, answer: str) -> str:
    message = f"{expires_at}.{nonce}.{answer}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def issue_captcha(*, secret: str, now: datetime) -> tuple[str, str]:
    """Return `(token, question)`. The token signs the answer, so no server state is kept."""
    left = secrets.randbelow(_CAPTCHA_MAX_OPERAND - _CAPTCHA_MIN_OPERAND + 1) + _CAPTCHA_MIN_OPERAND
    right = secrets.randbelow(_CAPTCHA_MAX_OPERAND - _CAPTCHA_MIN_OPERAND + 1) + _CAPTCHA_MIN_OPERAND
    expires_at = int((now + CAPTCHA_TTL).timestamp())
    nonce = secrets.token_hex(8)
    signature = _captcha_signature(secret, expires_at, nonce, str(left + right))
    return f"{expires_at}.{nonce}.{signature}", f"Сколько будет {left} + {right}?"


def verify_captcha(token: str, answer: str, *, secret: str, now: datetime) -> bool:
    try:
        raw_expires_at, nonce, signature = token.split(".")
        expires_at = int(raw_expires_at)
    except ValueError:
        return False
    if now.timestamp() > expires_at:
        return False
    expected = _captcha_signature(secret, expires_at, nonce, answer.strip())
    return hmac.compare_digest(expected, signature)
