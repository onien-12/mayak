"""Settings local to the external reviews; credentials belong in the environment or backend/.env."""

from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config import BASE_DIR
from app.services.experimental.external_reviews import rules

DEFAULT_JUDGE_MODEL = "typesafe/jev-router"


class ReviewsSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="EXTERNAL_REVIEWS_",
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # docker-compose passes unset variables as empty strings: they mean "the default".
        env_ignore_empty=True,
    )

    proxy_url: SecretStr = SecretStr("")
    """Optional HTTP(S)/SOCKS proxy. {sid} is replaced once per client instance and again after a
    transport failure."""
    request_timeout_s: float = 20.0
    failure_dump_dir: Path | None = None
    """Debugging only: the raw answer a parser could not read is written here. Raw pages carry
    what the cache never stores (reviewer names included), so keep it unset outside debugging."""
    twogis_enabled: bool = True
    google_enabled: bool = True
    daily_request_cap: int = rules.DAILY_REQUEST_CAP
    """Requests per provider and rolling day."""
    llm_model: str = DEFAULT_JUDGE_MODEL
    """OpenRouter model that settles identities the matcher's rules abstain on."""
    llm_enabled: bool | None = None
    """None means "on when an OpenRouter key is configured" (`OPENROUTER_API_KEY`)."""

    @field_validator("request_timeout_s")
    @classmethod
    def positive_timeout(cls, value: float) -> float:
        if not 0 < value <= 120:
            raise ValueError("request_timeout_s must be between 0 and 120 seconds")
        return value

    @field_validator("daily_request_cap")
    @classmethod
    def positive_cap(cls, value: int) -> int:
        if value < 1:
            raise ValueError("daily_request_cap must be positive")
        return value

    def judge_active(self, openrouter_api_key: str) -> bool:
        return bool(openrouter_api_key) and self.llm_enabled is not False
