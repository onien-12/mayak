"""The «Карта» list (SPEC §17, §18): every match city-wide, in view first, in pages."""

from typing import Any

from httpx import AsyncClient
from sqlalchemy import update

from app.domain.enums import ExternalSourceId
from app.models import Place
from tests.conftest import API, World

LAT, LNG = 43.10, 131.95
VIEW = f"{LNG - 0.01},{LAT - 0.01},{LNG + 0.01},{LAT + 0.01}"


async def page(client: AsyncClient, **params: Any) -> dict[str, Any]:
    query = {"layers": "infrastructure,tourism", "view": VIEW, "center": f"{LAT},{LNG}", **params}
    response = await client.get(f"{API}/places/page", params=query)
    assert response.status_code == 200, response.text
    return response.json()


def titles(result: dict[str, Any]) -> list[str]:
    return [item["title"] for item in result["items"]]


async def test_in_view_first_residents_first_nearest_first_in_pages(
    world: World, client: AsyncClient
) -> None:
    author = await world.actor("author", reputation=60)
    other = await world.actor("other", reputation=60)
    await world.create_place(author, title="Туалет в сквере", lat=LAT + 0.005, lng=LNG)
    await world.create_place(author, title="Туалет у причала", lat=LAT + 0.001, lng=LNG)
    await world.create_place(other, title="Туалет за городом", lat=LAT + 0.05, lng=LNG)
    imported = await world.create_place(other, title="Туалет из каталога", lat=LAT, lng=LNG + 0.0005)
    playground = await world.create_place(
        other, "playground", title="Детская площадка", lat=LAT, lng=LNG - 0.001
    )
    await world.create_place(other, "viewpoint", title="Вид на бухту", lat=LAT + 0.0002, lng=LNG)
    async with world.session() as session:
        await session.execute(
            update(Place)
            .where(Place.id.in_([imported["id"], playground["id"]]))
            .values(external_source=ExternalSourceId.OSM, last_confirmed_at=None)
        )
        await session.commit()

    everything = await page(client)
    assert (everything["total"], everything["in_view"]) == (6, 5)
    assert titles(everything) == [
        "Вид на бухту",
        "Туалет у причала",
        "Туалет в сквере",
        "Туалет из каталога",
        "Детская площадка",
        "Туалет за городом",
    ]
    # The default list leaves the bare OpenStreetMap playground out, as the map does.
    default = await page(client, background="hide")
    assert (default["total"], default["in_view"]) == (5, 4)
    assert "Детская площадка" not in titles(default)
    # Pages of the same order; moving the view only re-sorts.
    assert titles(await page(client, offset=2, limit=2)) == titles(everything)[2:4]
    moved = await page(client, view=f"{LNG - 0.01},{LAT + 0.04},{LNG + 0.01},{LAT + 0.06}")
    assert (moved["total"], moved["in_view"]) == (6, 1)
    assert titles(moved)[0] == "Туалет за городом"
    # Filters work as on the map; unconfirmed OSM objects leave with the trust filter.
    assert titles(await page(client, layers="tourism")) == ["Вид на бухту"]
    trusted = await page(client, min_status="preliminary")
    assert "Туалет из каталога" not in titles(trusted)
    assert (await client.get(f"{API}/places/page", params={"limit": 201})).status_code == 422
