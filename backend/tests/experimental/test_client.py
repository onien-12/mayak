from unittest.mock import patch

import httpx
import pytest

from app.services.experimental.external_reviews.client import (
    HttpPagesClient,
    SourceRefusedError,
    SourceUnavailableError,
    YandexMapsClient,
)
from app.services.experimental.external_reviews.config import ReviewsSettings


async def test_client_uses_proxy_with_one_random_session_and_no_environment_proxy() -> None:
    proxy = "socks5h://country-ru-session-{sid}:private@proxy.test:10081"
    first = YandexMapsClient(proxy_url=proxy, timeout_s=20)
    second = YandexMapsClient(proxy_url=proxy)
    observed = []
    real_client = httpx.AsyncClient

    def factory(**kwargs):
        observed.append(kwargs)
        return real_client(transport=httpx.MockTransport(lambda _: httpx.Response(200, text="page")))

    with patch("app.services.experimental.external_reviews.client.httpx.AsyncClient", side_effect=factory):
        assert await first.get("https://yandex.ru/maps/") == "page"
        await first.get("https://yandex.ru/maps/")
        await second.get("https://yandex.ru/maps/")
    assert observed[0]["proxy"] == observed[1]["proxy"]
    assert observed[0]["proxy"] != observed[2]["proxy"]
    assert "{sid}" not in observed[0]["proxy"]
    assert observed[0]["trust_env"] is False
    assert observed[0]["follow_redirects"] is False
    assert observed[0]["timeout"] == 20


@pytest.mark.parametrize("status", [302, 403, 429, 500])
async def test_client_does_not_follow_redirects_or_retry_a_refusal(status: int) -> None:
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(status, headers={"location": "https://example.com/challenge"})

    client = YandexMapsClient(transport=httpx.MockTransport(respond))
    with pytest.raises(SourceRefusedError, match=f"HTTP {status}"):
        await client.get("https://yandex.ru/maps/")
    assert len(requests) == 1


def test_empty_variables_mean_defaults_and_the_judge_needs_a_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EXTERNAL_REVIEWS_LLM_ENABLED", "")
    monkeypatch.setenv("EXTERNAL_REVIEWS_DAILY_REQUEST_CAP", "")
    settings = ReviewsSettings(_env_file=None)
    assert (settings.llm_enabled, settings.daily_request_cap) == (None, 10_000)
    assert settings.llm_model == "typesafe/jev-router"
    assert settings.judge_active("key")
    assert not settings.judge_active("")
    assert not settings.model_copy(update={"llm_enabled": False}).judge_active("key")


def test_proxy_is_redacted_in_settings() -> None:
    settings = ReviewsSettings(_env_file=None, proxy_url="socks5h://user:private@proxy.test:1080")
    assert "private" not in repr(settings)


async def test_2gis_transport_does_not_inherit_yandex_browser_headers() -> None:
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(200, text="public web configuration")

    client = HttpPagesClient(transport=httpx.MockTransport(respond))
    await client.get("https://2gis.ru/")
    assert requests[0].headers["user-agent"].startswith("python-httpx/")
    assert "accept-language" not in requests[0].headers


@pytest.mark.parametrize(
    "failure",
    [httpx.ProxyError("proxy"), httpx.ConnectTimeout("connect"), httpx.RemoteProtocolError("dropped")],
)
async def test_a_transport_failure_is_retried_once_through_a_fresh_proxy_session(failure: Exception) -> None:
    proxy = "socks5h://country-ru-session-{sid}:private@proxy.test:10081"
    client = YandexMapsClient(proxy_url=proxy, retry_pause_s=0)
    observed = []
    real_client = httpx.AsyncClient

    def factory(**kwargs):
        observed.append(kwargs["proxy"])

        def respond(_: httpx.Request) -> httpx.Response:
            if len(observed) == 1:
                raise failure
            return httpx.Response(200, text="page")

        return real_client(transport=httpx.MockTransport(respond))

    with patch("app.services.experimental.external_reviews.client.httpx.AsyncClient", side_effect=factory):
        assert await client.get("https://yandex.ru/maps/") == "page"
        await client.get("https://yandex.ru/maps/")
    assert len(observed) == 3
    assert observed[0] != observed[1], "a fresh session for the retry"
    assert observed[1] == observed[2], "and for what follows"


async def test_a_second_transport_failure_fails_the_lookup() -> None:
    requests = []

    def respond(request):
        requests.append(request)
        raise httpx.ConnectTimeout("connect")

    client = YandexMapsClient(transport=httpx.MockTransport(respond), retry_pause_s=0)
    with pytest.raises(SourceUnavailableError, match="ConnectTimeout") as caught:
        await client.get("https://yandex.ru/maps/")
    assert not isinstance(caught.value, SourceRefusedError)
    assert len(requests) == 2
