"""Covers borrowed from the map services' photos for objects without any of their own (SPEC §20, §25)."""

from datetime import timedelta
from typing import Any

from sqlalchemy.orm import selectinload

from app.core.clock import utcnow
from app.models import Area, Place
from app.services.experimental.external_reviews import targets
from app.services.experimental.external_reviews.models import (
    CatalogueReviewSource,
    ExternalReviewSource,
    Outcome,
    ReviewMatchEvidence,
)
from app.services.experimental.external_reviews.service import Target
from tests.conftest import World

PARK = {"lat": 43.1180, "lng": 131.9225}
VIEWPOINT = {"lat": 43.1172, "lng": 131.9230}


def switch(app: Any, enabled: bool) -> None:
    app.state.settings = app.state.settings.model_copy(update={"external_reviews_enabled": enabled})


async def place_target(world: World, place_id: int) -> Target:
    async with world.session() as session:
        place = await session.get_one(
            Place, place_id, options=[selectinload(Place.area), selectinload(Place.category)]
        )
        target = targets.for_place(place)
    assert target is not None
    return target


async def area_target(world: World, area_id: int) -> Target:
    async with world.session() as session:
        return targets.for_area(await session.get_one(Area, area_id))


async def store(
    world: World,
    target: Target,
    source: str,
    org_id: str,
    title: str,
    photos: list[str],
    age: timedelta = timedelta(0),
) -> None:
    """A match as a lookup leaves it: the source row and its evidence, committed together."""
    fetched_at = utcnow() - age
    owner = {"place_id": target.place_id, "area_id": target.area_id}
    url = f"https://{source}.example/org/{org_id}"
    async with world.session() as session:
        fields = {"outcome": Outcome.MATCHED, "org_id": org_id, "url": url, "photos": photos}
        if source == "yandex":
            session.add(ExternalReviewSource(**owner, **fields, fetched_at=fetched_at))
        else:
            session.add(CatalogueReviewSource(**owner, source=source, **fields, fetched_at=fetched_at))
        session.add(
            ReviewMatchEvidence(
                **owner,
                source=source,
                fingerprint=target.fingerprint,
                org_id=org_id,
                title=title,
                method="exact_name_nearby",
                fetched_at=fetched_at,
            )
        )
        await session.commit()


async def test_a_place_without_photos_borrows_a_sources_photo_with_its_mark(world: World, app: Any) -> None:
    author = await world.actor("author", reputation=20)
    place = await world.create_place(author, "culture_space", title="Приморский океанариум")
    target = await place_target(world, place["id"])
    await store(world, target, "2gis", "70", "Приморский океанариум", ["https://2gis.example/a.jpg"])
    await store(
        world,
        target,
        "yandex",
        "21",
        "Приморский океанариум",
        ["https://avatars.example/y1/L", "https://avatars.example/y2/L"],
        age=timedelta(days=30),
    )
    mark = {"source": "yandex", "label": "Яндекс Карты", "url": "https://yandex.example/org/21"}

    switch(app, False)
    assert (await author.get(f"/places/{place['id']}")).json()["cover_url"] is None, "the experiment is off"

    switch(app, True)
    detail = (await author.get(f"/places/{place['id']}")).json()
    assert (detail["cover_url"], detail["cover_credit"], detail["cover_source"]) == (
        "https://avatars.example/y1/L",
        None,
        mark,
    ), "Yandex first, its first photo; an old match still lends its photo while its identity holds"
    listed = (await author.get("/places", params={"author_id": place["author_id"]})).json()
    card = next(item for item in listed if item["id"] == place["id"])
    assert (card["cover_url"], card["cover_source"]) == ("https://avatars.example/y1/L", mark)

    uploaded = (
        await author.post("/uploads", files={"file": ("p.png", World.png((800, 600)), "image/png")})
    ).json()
    added = (await author.post(f"/places/{place['id']}/photos", json={"photo_ids": [uploaded["id"]]})).json()
    assert (added["cover_url"], added["cover_source"]) == (uploaded["url"], None), "residents' photos first"


async def test_a_renamed_place_loses_the_borrowed_cover(world: World, app: Any) -> None:
    switch(app, True)
    author = await world.actor("author", reputation=20)
    place = await world.create_place(author, "culture_space", title="Приморский океанариум")
    target = await place_target(world, place["id"])
    await store(world, target, "yandex", "21", "Приморский океанариум", ["https://avatars.example/y1/L"])
    async with world.session() as session:
        (await session.get_one(Place, place["id"])).title = "Океанариум на Русском"
        await session.commit()
    assert (await author.get(f"/places/{place['id']}")).json()["cover_url"] is None


async def test_a_place_never_borrows_the_photos_of_the_location_it_lies_in(world: World, app: Any) -> None:
    switch(app, True)
    moderator = await world.actor("moderator", reputation=60)
    author = await world.actor("author", reputation=20)
    area = (
        await moderator.post(
            "/areas", json={"title": "Нагорный парк", "kind": "park", **PARK, "radius_m": 400}
        )
    ).json()
    viewpoint = await world.create_place(author, "viewpoint", title="Смотровая Нагорного парка", **VIEWPOINT)
    assert viewpoint["area"]["id"] == area["id"]
    park_photo = "https://avatars.example/park/L"
    await store(world, await area_target(world, area["id"]), "yandex", "18", "Нагорный парк", [park_photo])
    view = await place_target(world, viewpoint["id"])

    # The source's entry for the viewpoint is the park itself: no photo is better than the park's.
    await store(world, view, "yandex", "18", "Нагорный парк", [park_photo])
    await store(world, view, "google", "0x1", "Нагорный парк культуры", [park_photo])
    detail = (await author.get(f"/places/{viewpoint['id']}")).json()
    assert (detail["cover_url"], detail["cover_source"]) == (None, None)

    # The location shows its own photo.
    location = (await author.get(f"/areas/{area['id']}")).json()
    assert (location["cover_url"], location["cover_source"]["url"]) == (
        park_photo,
        "https://yandex.example/org/18",
    )

    # An entry of the viewpoint itself lends its photo to the place.
    await store(
        world, view, "2gis", "16", "Смотровая площадка Нагорного парка", ["https://2gis.example/v.jpg"]
    )
    detail = (await author.get(f"/places/{viewpoint['id']}")).json()
    assert (detail["cover_url"], detail["cover_source"]["source"]) == ("https://2gis.example/v.jpg", "2gis")


async def test_a_location_without_its_own_entry_borrows_from_its_best_place(world: World, app: Any) -> None:
    switch(app, True)
    moderator = await world.actor("moderator", reputation=60)
    author = await world.actor("author", reputation=20)
    area = (
        await moderator.post(
            "/areas", json={"title": "Нагорный парк", "kind": "park", **PARK, "radius_m": 400}
        )
    ).json()
    viewpoint = await world.create_place(author, "viewpoint", title="Смотровая Нагорного парка", **VIEWPOINT)
    await store(
        world,
        await place_target(world, viewpoint["id"]),
        "yandex",
        "16",
        "Смотровая площадка Нагорного парка",
        ["https://avatars.example/view/L"],
    )
    listed = (await author.get("/areas")).json()
    card = next(item for item in listed if item["id"] == area["id"])
    assert (card["cover_url"], card["cover_source"]["label"]) == (
        "https://avatars.example/view/L",
        "Яндекс Карты",
    )
