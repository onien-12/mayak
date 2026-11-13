"""Shared fixtures: an application on a temporary database, a fake routing client, API helpers."""

import asyncio
import json
import re
from collections.abc import AsyncIterator, Iterator, Sequence
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import Any

import pytest
import time_machine
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import Settings
from app.domain import routing
from app.domain.enums import PathSource, UserRole
from app.domain.geo import LngLat
from app.domain.routing import RoutedPath, TravelMode
from app.main import create_app
from app.models import Category, User
from app.seed import catalog
from app.services.ai_moderation.client import PHOTO_CHECK, ResponseFormat
from app.services.ai_moderation.screener import AiScreener
from app.services.route_planner import RoutePlanner

API = "/api/v1"
PASSWORD = "correct-horse-battery"
START = datetime(2026, 11, 11, 3, 0, tzinfo=UTC)
CENTER = {"lat": 43.1155, "lng": 131.8855}


class FakeRoutingClient:
    """Stands in for a routing provider (OSRM by default): tests never touch the network."""

    def __init__(self, source: PathSource = PathSource.OSM, max_points: int = 25) -> None:
        self.source = source
        self.max_points = max_points
        self.calls: list[tuple[TravelMode, tuple[LngLat, ...]]] = []
        self.available = True

    async def route(self, travel: TravelMode, points: Sequence[LngLat]) -> RoutedPath | None:
        self.calls.append((travel, tuple(points)))
        if not self.available:
            return None
        return RoutedPath(path=list(points), legs_m=routing.straight_legs_m(points), duration_s=1200)

    async def aclose(self) -> None:
        return None


class FakeAiClient:
    """Stands in for OpenRouter: returns prepared answers (text reviews and photo checks apart)
    or raises a prepared error."""

    OK = (
        '{"verdict": "ok", "categories": [], "confidence": 0.95, "usefulness": 60, '
        '"summary": "Нарушений не видно."}'
    )
    PHOTO_OK = '{"verdict": "ok", "categories": [], "confidence": 0.95, "summary": "Обычное фото."}'

    def __init__(self) -> None:
        self.answer: str | Exception | None = self.OK
        self.photo_answers: list[str | Exception | None] = []
        """Consumed one per photo check, in order; when empty every photo is fine."""
        self.calls: list[tuple[str, list[dict[str, Any]]]] = []
        self.photo_calls: list[list[dict[str, Any]]] = []
        self.gate: asyncio.Event | None = None
        """When set, every answer waits for it: lets a test look inside the screening window."""

    def pause(self) -> None:
        self.gate = asyncio.Event()

    def resume(self) -> None:
        if self.gate is not None:
            self.gate.set()

    def will_say(
        self,
        verdict: str,
        confidence: float,
        *categories: str,
        summary: str = "Пояснение.",
        usefulness: int = 60,
    ) -> None:
        self.answer = json.dumps(
            {
                "verdict": verdict,
                "categories": list(categories),
                "confidence": confidence,
                "usefulness": usefulness,
                "summary": summary,
            },
            ensure_ascii=False,
        )

    def photos_will_say(self, *verdicts: tuple[str, float, tuple[str, ...]]) -> None:
        self.photo_answers = [
            json.dumps(
                {
                    "verdict": verdict,
                    "categories": list(categories),
                    "confidence": confidence,
                    "summary": "Фото.",
                },
                ensure_ascii=False,
            )
            for verdict, confidence, categories in verdicts
        ]

    async def complete(
        self, system_prompt: str, user_content: list[dict[str, Any]], response_format: ResponseFormat
    ) -> str | None:
        if self.gate is not None:
            await self.gate.wait()
        if response_format.name == PHOTO_CHECK.name:
            self.photo_calls.append(user_content)
            answer = self.photo_answers.pop(0) if self.photo_answers else self.PHOTO_OK
        else:
            self.calls.append((system_prompt, user_content))
            answer = self.answer
        if isinstance(answer, Exception):
            raise answer
        return answer


@pytest.fixture
def clock() -> Iterator[time_machine.Traveller]:
    """Frozen-but-ticking time that tests can shift to get past cooldowns and windows."""
    with time_machine.travel(START, tick=True) as traveller:
        yield traveller


@pytest.fixture
def routing_client() -> FakeRoutingClient:
    return FakeRoutingClient()


@pytest.fixture
async def app(
    tmp_path: Path, clock: time_machine.Traveller, routing_client: FakeRoutingClient
) -> AsyncIterator[Any]:
    settings = Settings(
        _env_file=None,
        secret_key="test-secret-key-that-is-long-enough-for-hs256",
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'test.db'}",
        media_dir=tmp_path / "media",
        twogis_api_key="",
        openrouter_api_key="",
        access_token_ttl_days=400,
        seed_on_startup=False,
        afisha_import_enabled=False,
        outages_import_enabled=False,
    )
    application = create_app(settings)
    async with application.router.lifespan_context(application):
        application.state.route_planner = RoutePlanner([routing_client])
        async with application.state.database.session_factory() as session:
            for slug, layer, group, name, icon, fields in catalog.CATEGORIES:
                session.add(
                    Category(slug=slug, layer=layer, group=group, name=name, icon=icon, fields=fields)
                )
            await session.commit()
        yield application


@pytest.fixture
async def client(app: Any) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http


class Actor:
    """An authenticated API user."""

    def __init__(self, http: AsyncClient, token: str, user: dict[str, Any]) -> None:
        self._http = http
        self.headers = {"Authorization": f"Bearer {token}"}
        self.id: int = user["id"]
        self.user = user

    async def request(self, method: str, path: str, **kwargs: Any) -> Any:
        return await self._http.request(method, f"{API}{path}", headers=self.headers, **kwargs)

    async def get(self, path: str, **kwargs: Any) -> Any:
        return await self.request("GET", path, **kwargs)

    async def post(self, path: str, **kwargs: Any) -> Any:
        return await self.request("POST", path, **kwargs)

    async def patch(self, path: str, **kwargs: Any) -> Any:
        return await self.request("PATCH", path, **kwargs)

    async def put(self, path: str, **kwargs: Any) -> Any:
        return await self.request("PUT", path, **kwargs)

    async def delete(self, path: str, **kwargs: Any) -> Any:
        return await self.request("DELETE", path, **kwargs)


class World:
    """Test DSL over the API plus a few direct database shortcuts for arranging state."""

    def __init__(self, app: Any, http: AsyncClient, clock: time_machine.Traveller) -> None:
        self.app = app
        self.http = http
        self.clock = clock
        self._counter = 0

    def session(self) -> AsyncSession:
        return self.app.state.database.session_factory()

    @staticmethod
    def clock_now() -> datetime:
        return datetime.now(UTC)

    def enable_ai(self, **settings: Any) -> FakeAiClient:
        """Switch the LLM pre-screening on with a fake client; returns the fake to script answers."""
        fake = FakeAiClient()
        configured = self.app.state.settings.model_copy(update=settings)
        self.app.state.ai_screener = AiScreener(fake, self.app.state.database.session_factory, configured)
        return fake

    async def ai_done(self) -> None:
        client = self.app.state.ai_screener._client
        if isinstance(client, FakeAiClient):
            client.resume()
        await self.app.state.ai_screener.drain()

    async def actor(
        self, name: str, *, reputation: int = 0, role: UserRole = UserRole.USER, age_days: int = 30
    ) -> Actor:
        """Create a user directly (old enough not to count as a fresh account) and log in."""
        async with self.session() as session:
            session.add(
                User(
                    email=f"{name}@example.com",
                    username=name,
                    display_name=name.capitalize(),
                    password_hash=security.hash_password(PASSWORD),
                    role=role,
                    reputation=reputation,
                    created_at=datetime.now(UTC) - timedelta(days=age_days),
                )
            )
            await session.commit()
        response = await self.http.post(
            f"{API}/auth/login", json={"email": f"{name}@example.com", "password": PASSWORD}
        )
        assert response.status_code == 200, response.text
        body = response.json()
        return Actor(self.http, body["access_token"], body["user"])

    async def set_reputation(self, actor: Actor, reputation: int) -> None:
        async with self.session() as session:
            await session.execute(update(User).where(User.id == actor.id).values(reputation=reputation))
            await session.commit()

    async def category_id(self, slug: str) -> int:
        response = await self.http.get(f"{API}/categories")
        return next(item["id"] for item in response.json() if item["slug"] == slug)

    async def place_payload(self, slug: str = "toilet", **overrides: Any) -> dict[str, Any]:
        """A valid place body at a fresh spot, so proximity limits never interfere."""
        self._counter += 1
        categories = (await self.http.get(f"{API}/categories")).json()
        category = next(item for item in categories if item["slug"] == slug)
        payload: dict[str, Any] = {
            "layer": category["layer"],
            "category_id": category["id"],
            "title": f"Тестовая точка {self._counter}",
            "description": "Описание тестовой точки.",
            "lat": CENTER["lat"] + self._counter * 0.004,
            "lng": CENTER["lng"],
        }
        payload.update(overrides)
        return payload

    async def create_place(self, author: Actor, slug: str = "toilet", **overrides: Any) -> dict[str, Any]:
        """Create a place through the API, stepping over the creation cooldown first."""
        self.clock.shift(timedelta(seconds=30))
        response = await author.post("/places", json=await self.place_payload(slug, **overrides))
        assert response.status_code == 201, response.text
        return response.json()

    async def vote(self, voter: Actor, place_id: int, kind: str = "present", **extra: Any) -> dict[str, Any]:
        if kind == "unclear":
            # «Требует уточнения» must say what is unclear (SPEC §3.1).
            extra.setdefault("comment", "Нужно уточнить часы работы")
        response = await voter.post(f"/places/{place_id}/votes", json={"kind": kind, **extra})
        assert response.status_code == 200, response.text
        return response.json()

    @staticmethod
    def png(size: tuple[int, int] = (64, 48), color: str = "teal") -> bytes:
        buffer = BytesIO()
        Image.new("RGB", size, color).save(buffer, format="PNG")
        return buffer.getvalue()

    def event_window(self, starts_in_hours: float = 48, duration_hours: float = 2) -> dict[str, str]:
        starts_at = datetime.now(UTC) + timedelta(hours=starts_in_hours)
        return {
            "starts_at": starts_at.isoformat(),
            "ends_at": (starts_at + timedelta(hours=duration_hours)).isoformat(),
        }


@pytest.fixture
def world(app: Any, client: AsyncClient, clock: time_machine.Traveller) -> World:
    return World(app, client, clock)


def solve_captcha(question: str) -> str:
    left, right = map(int, re.findall(r"\d+", question))
    return str(left + right)
