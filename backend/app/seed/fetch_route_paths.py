"""One-off tool: pre-compute seed route paths with the configured routing providers.

    uv run python -m app.seed.fetch_route_paths                 # every `roads` route
    uv run python -m app.seed.fetch_route_paths tobizina_trail  # only these

The result is committed as `route_paths.json`, so seeding never touches the network. Routes are
requested one after another (one request per route, the providers space them politely). A route
missing from the file, or whose stops no longer match it, falls back to straight segments at seed
time.
"""

import argparse
import asyncio
import json

from app.core.config import get_settings
from app.domain import routing
from app.domain.enums import PathMode, PathSource
from app.domain.geo import LngLat
from app.seed.routes import ROUTES
from app.seed.runner import ALL_PLACES, ROUTE_PATHS_FILE
from app.seed.specs import SeedRoute
from app.services.route_planner import build_planner

COORDINATE_PRECISION = 6


def _stop_points(route: SeedRoute) -> list[LngLat]:
    places = {place.key: place for place in ALL_PLACES}
    points: list[LngLat] = []
    for stop in route.stops:
        place = places[stop.place] if stop.place else None
        lng = stop.lng if stop.lng is not None else place.lng
        lat = stop.lat if stop.lat is not None else place.lat
        points.append((lng, lat))
    return points


async def _fetch(keys: list[str]) -> None:
    roads_routes = [route for route in ROUTES if route.path_mode is PathMode.ROADS]
    stored = json.loads(ROUTE_PATHS_FILE.read_text(encoding="utf-8")) if ROUTE_PATHS_FILE.exists() else {}
    stored = {key: entry for key, entry in stored.items() if key in {route.key for route in roads_routes}}
    planner = build_planner(get_settings())
    try:
        for route in (route for route in roads_routes if not keys or route.key in keys):
            points = _stop_points(route)
            planned = await planner.plan(route.kind, points)
            if planned.source is PathSource.STRAIGHT:
                print(f"{route.key}: маршрут не получен, останется прямая линия")
                continue
            stored[route.key] = {
                "stops": [list(point) for point in points],
                "path": [
                    [round(lng, COORDINATE_PRECISION), round(lat, COORDINATE_PRECISION)]
                    for lng, lat in planned.path
                ],
                "legs_m": planned.legs_m,
                "travel_min": planned.travel_min,
                "source": planned.source.value,
            }
            detour = planned.distance_m / max(sum(routing.straight_legs_m(points)), 1)
            print(
                f"{route.key} ({planned.source}): {planned.distance_m} м, {planned.travel_min} мин, "
                f"точек линии: {len(planned.path)}, длиннее прямых в {detour:.2f} раза, "
                f"участки: {planned.legs_m}"
            )
    finally:
        await planner.aclose()
    ROUTE_PATHS_FILE.write_text(
        json.dumps(stored, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Построить геометрию демо-маршрутов по дорогам и тропам.")
    parser.add_argument("keys", nargs="*", help="ключи маршрутов из app/seed/routes.py (по умолчанию все)")
    asyncio.run(_fetch(parser.parse_args().keys))


if __name__ == "__main__":
    main()
