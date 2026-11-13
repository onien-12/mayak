"""Outbound HTTP clients against `httpx.MockTransport`: request shapes and failure handling."""

import json

import httpx
import pytest

from app.core.http import USER_AGENT
from app.domain import geo
from app.domain.routing import TravelMode
from app.services.ai_moderation.client import COMPLETIONS_URL, PHOTO_CHECK, TEXT_REVIEW, OpenRouterClient
from app.services.geometry_lookup import NominatimClient
from app.services.osm.client import OverpassClient
from app.services.twogis_routing import ROUTING_URL, TwoGisRoutingClient
from app.services.vlru.client import VlRuClient

ROUTE_RESPONSE = {
    "result": [
        {
            "total_distance": 900,
            "total_duration": 600,
            "maneuvers": [
                {"outcoming_path": {"geometry": [{"selection": "LINESTRING(131.88 43.11, 131.885 43.112)"}]}},
                {
                    "outcoming_path": {
                        "geometry": [{"selection": "LINESTRING(131.885 43.112, 131.89 43.115)"}]
                    }
                },
            ],
        }
    ]
}
POINTS = [(131.88, 43.11), (131.885, 43.112), (131.89, 43.115)]


def _client(handler: httpx.MockTransport) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=handler)


async def test_routing_request_marks_intermediate_points_as_via() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=ROUTE_RESPONSE)

    client = TwoGisRoutingClient("test-key", http_client=_client(httpx.MockTransport(handler)))
    routed = await client.route(TravelMode.FOOT, POINTS)
    assert routed is not None
    assert (len(routed.legs_m), routed.travel_min, len(routed.path)) == (2, 10, 3)
    request = seen[0]
    assert str(request.url) == f"{ROUTING_URL}?key=test-key"
    body = json.loads(request.content)
    assert (body["transport"], body["locale"]) == ("walking", "ru")
    assert [point["type"] for point in body["points"]] == ["stop", "pref", "stop"]
    assert body["points"][0] == {"type": "stop", "lon": 131.88, "lat": 43.11}


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(429, json={"message": "quota"}),
        httpx.Response(200, json={"status": "FAIL"}),
        httpx.Response(200, text="not json"),
        httpx.Response(
            200,
            json={
                "result": [
                    {**ROUTE_RESPONSE["result"][0], "maneuvers": ROUTE_RESPONSE["result"][0]["maneuvers"][:1]}
                ]
            },
        ),
    ],
)
async def test_routing_failures_mean_no_route(response: httpx.Response) -> None:
    client = TwoGisRoutingClient("test-key", http_client=_client(httpx.MockTransport(lambda _: response)))
    assert await client.route(TravelMode.FOOT, POINTS) is None


async def test_routing_without_key_or_network_is_no_route() -> None:
    def explode(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("no network", request=request)

    assert (
        await TwoGisRoutingClient("", http_client=_client(httpx.MockTransport(explode))).route(
            TravelMode.FOOT, POINTS
        )
        is None
    )
    assert (
        await TwoGisRoutingClient("k", http_client=_client(httpx.MockTransport(explode))).route(
            TravelMode.FOOT, POINTS
        )
        is None
    )


def _completion(content: object) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}, "finish_reason": "stop"}]})


async def test_openrouter_request_shape() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return _completion('{"verdict": "ok"}')

    client = OpenRouterClient(
        "secret-key", "deepseek/deepseek-v4.1-flash", http_client=_client(httpx.MockTransport(handler))
    )
    answer = await client.complete("system", [{"type": "text", "text": "data"}], TEXT_REVIEW)
    assert answer == '{"verdict": "ok"}'
    request = seen[0]
    assert str(request.url) == COMPLETIONS_URL
    assert request.headers["authorization"] == "Bearer secret-key"
    body = json.loads(request.content)
    assert (body["model"], body["temperature"], body["max_tokens"]) == (
        "deepseek/deepseek-v4.1-flash",
        0,
        400,
    )
    assert body["reasoning"] == {"enabled": False}
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["strict"] is True
    assert body["response_format"]["json_schema"]["name"] == "content_review"
    assert body["response_format"]["json_schema"]["schema"]["required"] == [
        "verdict",
        "categories",
        "confidence",
        "usefulness",
        "summary",
    ]
    assert [message["role"] for message in body["messages"]] == ["system", "user"]


async def test_openrouter_photo_check_has_its_own_schema() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return _completion('{"verdict": "ok"}')

    client = OpenRouterClient("k", "m", http_client=_client(httpx.MockTransport(handler)))
    await client.complete("system", [], PHOTO_CHECK)
    body = json.loads(seen[0].content)
    assert body["max_tokens"] == 300
    assert body["response_format"]["json_schema"]["name"] == "photo_check"
    assert "usefulness" not in body["response_format"]["json_schema"]["schema"]["required"]


@pytest.mark.parametrize("content", [None, "", "   ", 42])
async def test_openrouter_empty_content_is_no_answer(content: object) -> None:
    client = OpenRouterClient(
        "k", "m", http_client=_client(httpx.MockTransport(lambda _: _completion(content)))
    )
    assert await client.complete("system", [], TEXT_REVIEW) is None


async def test_openrouter_retries_once() -> None:
    attempts: list[int] = []

    def flaky(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        if len(attempts) == 1:
            raise httpx.ReadTimeout("slow", request=request)
        return _completion("answer")

    client = OpenRouterClient("k", "m", http_client=_client(httpx.MockTransport(flaky)))
    assert await client.complete("system", [], TEXT_REVIEW) == "answer"
    assert len(attempts) == 2

    attempts.clear()

    def down(_: httpx.Request) -> httpx.Response:
        attempts.append(1)
        return httpx.Response(503)

    client = OpenRouterClient("k", "m", http_client=_client(httpx.MockTransport(down)))
    assert await client.complete("system", [], TEXT_REVIEW) is None
    assert len(attempts) == 2


async def test_vlru_client_is_polite_and_tolerant() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/missing":
            return httpx.Response(404)
        return httpx.Response(200, text="<html>ok</html>")

    http = httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://www.vl.ru",
        headers={"User-Agent": USER_AGENT},
    )
    client = VlRuClient(http_client=http, min_interval_s=0.05)
    assert await client.get("/off/summary/map", {"date": "now"}) == "<html>ok</html>"
    assert await client.get("/missing") is None
    assert seen[0].headers["user-agent"] == USER_AGENT
    assert "@" not in USER_AGENT
    assert str(seen[0].url) == "https://www.vl.ru/off/summary/map?date=now"
    await client.aclose()


async def test_nominatim_search_is_bounded_to_the_service_region() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=[{"name": "Нагорный парк"}])

    region = geo.parse_south_west_north_east("42.95,131.80,43.25,132.05")
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler), headers={"User-Agent": USER_AGENT})
    client = NominatimClient(region, http_client=http)
    assert await client.search("Нагорный парк") == [{"name": "Нагорный парк"}]
    params = seen[0].url.params
    assert (params["viewbox"], params["bounded"]) == ("131.8,43.25,132.05,42.95", "1")
    await client.aclose()


async def test_overpass_is_asked_once_and_failures_are_none() -> None:
    seen: list[httpx.Request] = []
    answers = iter([httpx.Response(200, json={"elements": []}), httpx.Response(504, text="busy")])

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return next(answers)

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler), headers={"User-Agent": USER_AGENT})
    client = OverpassClient(http_client=http)
    region = geo.parse_south_west_north_east("42.95,131.80,43.25,132.05")
    assert await client.fetch(region) == {"elements": []}
    assert await client.fetch(region) is None
    assert len(seen) == 2
    assert seen[0].method == "POST"
    assert b"out%3Ajson" in seen[0].content
    await client.aclose()


def test_descriptive_user_agent_has_no_personal_data() -> None:
    assert USER_AGENT == "MayakCityMap/0.1 (hackathon project; city map of Vladivostok)"
    assert "@" not in USER_AGENT
