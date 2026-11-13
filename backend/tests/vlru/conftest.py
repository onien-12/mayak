"""Saved VL.ru page fragments and a fake client that serves them without touching the network."""

from collections.abc import Mapping
from pathlib import Path

import pytest

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "vlru"


def fixture_text(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


class FakeVlRuClient:
    def __init__(self, pages: dict[str, str | None]) -> None:
        self.pages = pages
        self.requests: list[str] = []

    async def get(self, path: str, params: Mapping[str, str] | None = None) -> str | None:
        key = path + ("?" + "&".join(f"{name}={value}" for name, value in params.items()) if params else "")
        self.requests.append(key)
        return self.pages.get(key)


@pytest.fixture
def listing_html() -> str:
    return fixture_text("afisha_listing.html")


@pytest.fixture
def multi_day_event_html() -> str:
    return fixture_text("event_multi_day.html")


@pytest.fixture
def single_event_html() -> str:
    return fixture_text("event_single.html")


@pytest.fixture
def outage_map_html() -> str:
    return fixture_text("off_map.html")


@pytest.fixture
def blackouts_html() -> str:
    return fixture_text("off_blackouts.html")
