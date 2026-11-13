"""Plain HTTP requests for external review providers.

Redirects are not followed. Only the Google adapter retains the service's anonymous cookies in
memory; other adapters use a fresh cookie jar for every request. Unexpected HTTP statuses become
`SourceRefusedError` and end that lookup as refused — never retried. A transport failure (the
proxy refused, a connect timeout, a dropped connection) is retried once, after the usual spacing,
through a fresh proxy session; a second one is a plain `SourceUnavailableError`, a failure of that
one lookup.
"""

import asyncio
from dataclasses import dataclass
from typing import ClassVar
from urllib.parse import quote
from uuid import uuid4

import httpx

from app.services.experimental.external_reviews import rules
from app.services.experimental.external_reviews.config import ReviewsSettings

SEARCH_URL = "https://yandex.ru/maps/75/vladivostok/search/{query}/"
ORGANIZATION_URL = "https://yandex.ru/maps/org/{org_id}/"
REVIEWS_URL = "https://yandex.ru/maps/org/{org_id}/reviews/"
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT_S = 6.0
SEARCH_ZOOM = "16"
SEARCH_CITY = "Владивосток"
"""Added to the query: without it the source happily answers with namesakes from other cities."""


class SourceUnavailableError(Exception):
    """The source could not be read: the connection failed or the answer was refused."""


class SourceRefusedError(SourceUnavailableError):
    """A redirect or an error status instead of a page: a challenge, a limit or a ban."""


@dataclass(frozen=True, slots=True)
class FormPost:
    """A read-only RPC transported as a form POST."""

    url: str
    data: dict[str, str]
    headers: dict[str, str]


def search_query(title: str) -> str:
    return title if SEARCH_CITY.casefold() in title.casefold() else f"{title} {SEARCH_CITY}"


def search_url(title: str, lat: float, lng: float) -> str:
    query = quote(search_query(title), safe="")
    return SEARCH_URL.format(query=query) + f"?ll={lng:.6f}%2C{lat:.6f}&z={SEARCH_ZOOM}"


def organization_url(org_id: str) -> str:
    return ORGANIZATION_URL.format(org_id=org_id)


def reviews_url(org_id: str) -> str:
    return REVIEWS_URL.format(org_id=org_id)


class HttpPagesClient:
    """One short-lived HTTP transport per request, optionally sharing anonymous cookies."""

    headers: ClassVar[dict[str, str]] = {}
    keep_cookies: ClassVar[bool] = False

    def __init__(
        self,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        proxy_url: str = "",
        timeout_s: float = REQUEST_TIMEOUT_S,
        retry_pause_s: float = rules.REQUEST_INTERVAL_S,
    ) -> None:
        self._transport = transport
        self._proxy_template = proxy_url
        self._proxy_url: str | None = None
        self._new_proxy_session()
        self._timeout_s = timeout_s
        self._retry_pause_s = retry_pause_s
        self._cookies = httpx.Cookies()

    def _new_proxy_session(self) -> None:
        self._proxy_url = self._proxy_template.replace("{sid}", uuid4().hex) or None

    @classmethod
    def from_settings(cls, settings: ReviewsSettings | None = None) -> "HttpPagesClient":
        settings = settings or ReviewsSettings()
        return cls(proxy_url=settings.proxy_url.get_secret_value(), timeout_s=settings.request_timeout_s)

    async def get(self, url: str | FormPost) -> str:
        try:
            return await self._request(url)
        except httpx.TransportError:
            # The proxy's exit or the route through it failed, not the source: once more, elsewhere.
            self._new_proxy_session()
        except httpx.HTTPError as error:
            raise SourceUnavailableError(type(error).__name__) from error
        await asyncio.sleep(self._retry_pause_s)
        try:
            return await self._request(url)
        except httpx.HTTPError as error:
            raise SourceUnavailableError(type(error).__name__) from error

    async def _request(self, url: str | FormPost) -> str:
        """One request; `SourceRefusedError` for any status but 200, httpx errors pass through."""
        async with httpx.AsyncClient(
            transport=self._transport,
            proxy=self._proxy_url,
            timeout=self._timeout_s,
            headers=self.headers,
            cookies=self._cookies if self.keep_cookies else None,
            follow_redirects=False,
            trust_env=False,
        ) as http:
            response = (
                await http.post(url.url, data=url.data, headers=url.headers)
                if isinstance(url, FormPost)
                else await http.get(url)
            )
            if self.keep_cookies:
                self._cookies = http.cookies
        if response.status_code != httpx.codes.OK:
            raise SourceRefusedError(f"HTTP {response.status_code}")
        return response.text


class YandexMapsClient(HttpPagesClient):
    headers: ClassVar[dict[str, str]] = {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept-Language": "ru-RU,ru;q=0.9",
    }


class GoogleMapsClient(YandexMapsClient):
    """Only Google's own anonymous response cookies, kept in memory for this client session."""

    keep_cookies = True
