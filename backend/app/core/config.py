"""Application settings loaded from the environment and `backend/.env`."""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]
ROUTING_PROVIDER_NAMES = ("osrm", "2gis")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    secret_key: str = "dev-only-secret-key-change-me-in-production"
    database_url: str = f"sqlite+aiosqlite:///{BASE_DIR / 'data' / 'mayak.db'}"
    twogis_api_key: str = ""
    routing_providers: str = "osrm"
    """Comma-separated routing providers, tried in order (`ROUTING_PROVIDER_NAMES`); none
    available means straight segments. `2gis` needs a key with Routing in its subscription."""
    osrm_base_url: str = "https://routing.openstreetmap.de"
    cors_origins: str = "http://localhost:5173"
    media_dir: Path = BASE_DIR / "media"
    access_token_ttl_days: int = 7
    seed_on_startup: bool = True
    afisha_import_enabled: bool = True
    outages_import_enabled: bool = True
    openrouter_api_key: str = ""
    llm_moderation_model: str = "deepseek/deepseek-v4.1-flash"
    llm_moderation_enabled: bool | None = None
    """None means "on when an OpenRouter key is configured"."""
    llm_moderation_images: bool = True
    llm_moderation_daily_limit: int = 2000
    osm_bbox: str = "42.95,131.80,43.25,132.05"
    """South, west, north, east of the territory imported from OpenStreetMap (SPEC §18)."""
    twogis_rating_daily_limit: int = 30
    """2GIS Places requests for aggregate ratings per rolling day (the quota is 1 000 a month)."""
    external_reviews_enabled: bool = False
    """The removable external reviews experiment (SPEC §20)."""
    interests_llm_enabled: bool | None = None
    """Topics from the LLM (SPEC §23.2); None means "on when an OpenRouter key is configured"."""
    interests_llm_model: str = "typesafe/jev-router"
    interests_llm_daily_request_cap: int = 2000

    @field_validator("interests_llm_enabled", mode="before")
    @classmethod
    def _empty_means_default(cls, value: object) -> object:
        """docker-compose passes an unset variable as an empty string."""
        return None if value == "" else value

    @field_validator("routing_providers")
    @classmethod
    def _known_routing_providers(cls, value: str) -> str:
        unknown = set(_csv(value)) - set(ROUTING_PROVIDER_NAMES)
        if unknown:
            raise ValueError(f"unknown routing providers: {', '.join(sorted(unknown))}")
        return value

    @property
    def routing_provider_list(self) -> list[str]:
        return _csv(self.routing_providers)

    @property
    def llm_moderation_active(self) -> bool:
        if not self.openrouter_api_key:
            return False
        return self.llm_moderation_enabled is not False

    @property
    def interests_llm_active(self) -> bool:
        if not self.openrouter_api_key:
            return False
        return self.interests_llm_enabled is not False

    @property
    def cors_origin_list(self) -> list[str]:
        return _csv(self.cors_origins)


def _csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
