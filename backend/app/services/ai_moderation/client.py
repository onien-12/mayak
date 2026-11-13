"""OpenRouter chat-completions client for the screening model. Never logs the key or images."""

import logging
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.domain import ai_moderation

COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"
REQUEST_TIMEOUT_S = ai_moderation.REQUEST_TIMEOUT_S
ATTEMPTS = 2

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ResponseFormat:
    """The strict JSON schema the answer must follow, and a token budget for it."""

    name: str
    schema: dict[str, Any]
    max_tokens: int


TEXT_REVIEW = ResponseFormat("content_review", ai_moderation.TEXT_SCHEMA, max_tokens=400)
PHOTO_CHECK = ResponseFormat("photo_check", ai_moderation.PHOTO_SCHEMA, max_tokens=300)


class AiClient(Protocol):
    async def complete(
        self, system_prompt: str, user_content: list[dict[str, Any]], response_format: ResponseFormat
    ) -> str | None:
        """The model's raw answer, or None when no usable answer was produced."""


class OpenRouterClient:
    def __init__(self, api_key: str, model: str, *, http_client: httpx.AsyncClient | None = None) -> None:
        self._api_key = api_key
        self._model = model
        self._http = http_client or httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S)

    def _request_body(
        self, system_prompt: str, user_content: list[dict[str, Any]], response_format: ResponseFormat
    ) -> dict[str, Any]:
        return {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0,
            "max_tokens": response_format.max_tokens,
            "reasoning": {"enabled": False},
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": response_format.name,
                    "strict": True,
                    "schema": response_format.schema,
                },
            },
        }

    async def complete(
        self, system_prompt: str, user_content: list[dict[str, Any]], response_format: ResponseFormat
    ) -> str | None:
        """One retry on transport errors and non-200 answers; an empty answer is not retried."""
        body = self._request_body(system_prompt, user_content, response_format)
        headers = {"Authorization": f"Bearer {self._api_key}"}
        for attempt in range(1, ATTEMPTS + 1):
            try:
                response = await self._http.post(COMPLETIONS_URL, json=body, headers=headers)
            except httpx.HTTPError as error:
                logger.warning("OpenRouter request failed (attempt %d): %s", attempt, type(error).__name__)
                continue
            if response.status_code != httpx.codes.OK:
                logger.warning(
                    "OpenRouter responded with HTTP %s (attempt %d)", response.status_code, attempt
                )
                continue
            return _message_content(response)
        return None

    async def aclose(self) -> None:
        await self._http.aclose()


def _message_content(response: httpx.Response) -> str | None:
    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError):
        return None
    return content if isinstance(content, str) and content.strip() else None
