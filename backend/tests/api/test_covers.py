"""The cover is the photo that makes the best preview, not the first one (SPEC §25)."""

from typing import Any

from tests.conftest import Actor, World

TRUSTED = 80


async def upload(world: World, actor: Actor, size: tuple[int, int], color: str) -> dict[str, Any]:
    response = await actor.post("/uploads", files={"file": ("p.png", world.png(size, color), "image/png")})
    assert response.status_code == 201, response.text
    return response.json()


async def test_a_place_takes_its_best_photo_as_the_cover(world: World) -> None:
    author = await world.actor("author", reputation=TRUSTED)
    poster = await upload(world, author, (700, 1000), "navy")
    landscape = await upload(world, author, (1200, 800), "teal")
    place = await world.create_place(author, "viewpoint", photo_ids=[poster["id"], landscape["id"]])

    # The gallery keeps the order the author chose; only the preview is the better-shaped photo.
    assert [photo["id"] for photo in place["photos"]] == [poster["id"], landscape["id"]]
    assert place["cover_url"] == landscape["url"]

    listed = (await author.get("/places", params={"author_id": place["author_id"]})).json()
    assert next(item for item in listed if item["id"] == place["id"])["cover_url"] == landscape["url"]


async def test_adding_a_better_photo_changes_the_cover(world: World) -> None:
    author = await world.actor("author", reputation=TRUSTED)
    visitor = await world.actor("visitor", reputation=TRUSTED)
    tiny = await upload(world, author, (200, 150), "gray")
    place = await world.create_place(author, "viewpoint", photo_ids=[tiny["id"]])
    assert place["cover_url"] == tiny["url"]

    better = await upload(world, visitor, (1600, 1000), "orange")
    added = await visitor.post(f"/places/{place['id']}/photos", json={"photo_ids": [better["id"]]})
    assert added.status_code == 200, added.text
    assert added.json()["cover_url"] == better["url"]

    # Equal photos: the earlier one stays.
    same = await upload(world, visitor, (1600, 1000), "purple")
    again = await visitor.post(f"/places/{place['id']}/photos", json={"photo_ids": [same["id"]]})
    assert again.json()["cover_url"] == better["url"]


async def test_a_route_takes_the_best_stop_photo(world: World) -> None:
    hiker = await world.actor("hiker", reputation=TRUSTED)
    poster = await upload(world, hiker, (600, 1000), "navy")
    wide = await upload(world, hiker, (1400, 900), "green")
    response = await hiker.post(
        "/routes",
        json={
            "title": "Тропа к маяку",
            "kind": "walk",
            "visibility": "private",
            "stops": [
                {"title": "Старт", "lat": 43.1, "lng": 131.9, "photo_ids": [poster["id"]]},
                {"title": "Финиш", "lat": 43.101, "lng": 131.901, "photo_ids": [wide["id"]]},
            ],
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["cover_url"] == wide["url"]
