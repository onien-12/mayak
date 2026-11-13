"""Overpass API: one query for the whole bounding box, generated from the mapping table."""

import logging
from collections import defaultdict
from typing import Any

import httpx

from app.core.http import USER_AGENT
from app.domain.geo import BBox
from app.services.osm.mapping import AREA_RULES, PLACE_RULES

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
SERVER_TIMEOUT_S = 180
REQUEST_TIMEOUT_S = SERVER_TIMEOUT_S + 30.0

logger = logging.getLogger(__name__)


def _filter(tag: str, values: set[str]) -> str:
    if not values:
        return f"[{tag}]"
    return f'[{tag}~"^({"|".join(sorted(values))})$"]'


def build_query(bbox: BBox) -> str:
    """Objects come back as points (`center` for polygons), territories with their geometry."""
    groups: dict[tuple[str, bool], set[str] | None] = defaultdict(set)
    for rule in PLACE_RULES:
        key = (rule.tag, rule.named_only)
        if not rule.values or groups[key] is None:
            groups[key] = None
        else:
            groups[key].update(rule.values)
    objects = [
        f"  nwr{_filter(tag, values or set())}{'[name]' if named else ''};"
        for (tag, named), values in sorted(groups.items())
    ]
    territory_values: dict[str, set[str]] = defaultdict(set)
    for rule in AREA_RULES:
        territory_values[rule.tag].update(rule.values)
    territories = [f"  wr{_filter(tag, values)}[name];" for tag, values in sorted(territory_values.items())]
    box = f"{bbox.min_lat},{bbox.min_lng},{bbox.max_lat},{bbox.max_lng}"
    return "\n".join(
        [
            f"[out:json][timeout:{SERVER_TIMEOUT_S}][bbox:{box}];",
            "(",
            *objects,
            ")->.objects;",
            "(",
            *territories,
            ")->.territories;",
            ".objects out tags center qt;",
            ".territories out geom qt;",
        ]
    )


class OverpassClient:
    def __init__(self, *, http_client: httpx.AsyncClient | None = None) -> None:
        self._http = http_client or httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT_S, headers={"User-Agent": USER_AGENT}
        )

    async def fetch(self, bbox: BBox) -> dict[str, Any] | None:
        """The raw Overpass answer, or None on any failure. Exactly one request, no retries."""
        try:
            response = await self._http.post(OVERPASS_URL, data={"data": build_query(bbox)})
            payload = response.json() if response.status_code == httpx.codes.OK else None
        except (httpx.HTTPError, ValueError) as error:
            logger.warning("Overpass request failed: %s", type(error).__name__)
            return None
        if not isinstance(payload, dict) or not isinstance(payload.get("elements"), list):
            logger.warning("Overpass answered with HTTP %s and no elements", response.status_code)
            return None
        return payload

    async def aclose(self) -> None:
        await self._http.aclose()
