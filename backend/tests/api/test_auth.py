from datetime import timedelta

from httpx import AsyncClient

from app.domain import limits
from tests.conftest import API, PASSWORD, World, solve_captcha


async def _registration_body(client: AsyncClient, **overrides: object) -> dict[str, object]:
    captcha = (await client.get(f"{API}/auth/captcha")).json()
    body: dict[str, object] = {
        "email": "Newbie@Example.com",
        "username": "newbie",
        "display_name": "Новенький",
        "password": PASSWORD,
        "captcha_token": captcha["token"],
        "captcha_answer": solve_captcha(captcha["question"]),
    }
    body.update(overrides)
    return body


async def test_register_login_me(client: AsyncClient) -> None:
    response = await client.post(f"{API}/auth/register", json=await _registration_body(client))
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["token_type"] == "bearer"
    user = body["user"]
    assert user["email"] == "newbie@example.com"
    assert (user["level"], user["role"], user["reputation"]) == ("newcomer", "user", 0)
    assert user["permissions"] == {
        "can_moderate": False,
        "publishes_directly": True,
        "can_respect": False,
        "daily_place_limit": 3,
        "places_left_today": 3,
    }
    assert user["unread_notifications"] == 0

    login = await client.post(f"{API}/auth/login", json={"email": "NEWBIE@example.com", "password": PASSWORD})
    assert login.status_code == 200
    token = login.json()["access_token"]
    me = await client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "newbie"


async def test_wrong_captcha_answer_is_rejected(client: AsyncClient) -> None:
    body = await _registration_body(client, captcha_answer="999")
    response = await client.post(f"{API}/auth/register", json=body)
    assert response.status_code == 400
    assert response.json()["code"] == "captcha_failed"


async def test_expired_captcha_is_rejected(client: AsyncClient, world: World) -> None:
    body = await _registration_body(client)
    world.clock.shift(limits.CAPTCHA_TTL + timedelta(seconds=5))
    response = await client.post(f"{API}/auth/register", json=body)
    assert response.status_code == 400


async def test_honeypot_catches_bots(client: AsyncClient) -> None:
    body = await _registration_body(client, website="https://spam.example")
    response = await client.post(f"{API}/auth/register", json=body)
    assert response.status_code == 400
    assert response.json()["code"] == "registration_rejected"


async def test_taken_email_or_username_conflicts(client: AsyncClient) -> None:
    assert (
        await client.post(f"{API}/auth/register", json=await _registration_body(client))
    ).status_code == 201
    same_email = await _registration_body(client, username="another")
    assert (await client.post(f"{API}/auth/register", json=same_email)).status_code == 409
    same_username = await _registration_body(client, email="other@example.com")
    response = await client.post(f"{API}/auth/register", json=same_username)
    assert response.status_code == 409
    assert response.json() == {"detail": "Имя пользователя уже используется.", "code": "conflict"}


async def test_validation_errors_list_fields_in_russian(client: AsyncClient) -> None:
    body = await _registration_body(client, username="Bad Name", password="short", email="not-an-email")
    response = await client.post(f"{API}/auth/register", json=body)
    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "validation_error"
    assert {error["field"] for error in payload["errors"]} == {"username", "password", "email"}
    assert all(error["message"] for error in payload["errors"])


async def test_wrong_password(client: AsyncClient, world: World) -> None:
    await world.actor("anna")
    response = await client.post(
        f"{API}/auth/login", json={"email": "anna@example.com", "password": "nope-nope"}
    )
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"


async def test_me_requires_a_valid_token(client: AsyncClient) -> None:
    assert (await client.get(f"{API}/auth/me")).status_code == 401
    bad = await client.get(f"{API}/auth/me", headers={"Authorization": "Bearer nonsense"})
    assert bad.status_code == 401
    assert bad.json()["code"] == "unauthorized"


async def test_login_attempts_are_rate_limited_per_ip(client: AsyncClient) -> None:
    credentials = {"email": "ghost@example.com", "password": "whatever"}
    statuses = [
        (await client.post(f"{API}/auth/login", json=credentials)).status_code
        for _ in range(limits.LOGINS_PER_WINDOW + 1)
    ]
    assert statuses[:-1] == [401] * limits.LOGINS_PER_WINDOW
    assert statuses[-1] == 429


async def test_unknown_route_uses_the_error_envelope(client: AsyncClient) -> None:
    response = await client.get(f"{API}/nope")
    assert response.status_code == 404
    assert response.json() == {"detail": "Ресурс не найден.", "code": "not_found"}
