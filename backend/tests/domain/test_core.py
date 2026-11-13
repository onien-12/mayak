"""Stateless security helpers and the sliding-window limiter."""

from datetime import UTC, datetime, timedelta

from app.core import security
from app.core.rate_limit import SlidingWindowLimiter
from tests.conftest import solve_captcha

NOW = datetime(2026, 11, 11, 12, 0, tzinfo=UTC)
SECRET = "unit-test-secret-key-long-enough-for-hs256"


def test_password_hash_roundtrip() -> None:
    hashed = security.hash_password("mayak2026")
    assert hashed != "mayak2026"
    assert security.verify_password("mayak2026", hashed)
    assert not security.verify_password("wrong", hashed)


def test_access_token_roundtrip_and_rejection() -> None:
    now = datetime.now(UTC)
    token = security.create_access_token(42, secret=SECRET, ttl=timedelta(days=7), now=now)
    assert security.decode_access_token(token, secret=SECRET) == 42
    assert security.decode_access_token(token, secret=SECRET + "x") is None
    assert security.decode_access_token("garbage", secret=SECRET) is None
    expired = security.create_access_token(
        42, secret=SECRET, ttl=timedelta(days=7), now=now - timedelta(days=8)
    )
    assert security.decode_access_token(expired, secret=SECRET) is None


def test_captcha_accepts_only_the_right_answer_before_expiry() -> None:
    token, question = security.issue_captcha(secret=SECRET, now=NOW)
    answer = solve_captcha(question)
    assert security.verify_captcha(token, answer, secret=SECRET, now=NOW)
    assert security.verify_captcha(token, f" {answer} ", secret=SECRET, now=NOW + timedelta(minutes=4))
    assert not security.verify_captcha(token, str(int(answer) + 1), secret=SECRET, now=NOW)
    assert not security.verify_captcha(
        token, answer, secret=SECRET, now=NOW + timedelta(minutes=5, seconds=1)
    )
    assert not security.verify_captcha(token, answer, secret="another-secret", now=NOW)
    assert not security.verify_captcha("not-a-token", answer, secret=SECRET, now=NOW)


def test_sliding_window_limiter() -> None:
    limiter = SlidingWindowLimiter()
    window = timedelta(minutes=10)
    assert all(limiter.allow("k", limit=3, window=window, now=NOW + timedelta(seconds=i)) for i in range(3))
    assert not limiter.allow("k", limit=3, window=window, now=NOW + timedelta(seconds=5))
    assert limiter.allow("other", limit=3, window=window, now=NOW)
    assert limiter.allow("k", limit=3, window=window, now=NOW + timedelta(minutes=10, seconds=1))
