"""Home area: a private setting that quietly feeds the trust model (SPEC §16)."""

from datetime import timedelta

from httpx import AsyncClient

from app.domain.enums import UserRole
from tests.conftest import API, World

HOME = {"lat": 43.137146, "lng": 131.902771, "label": "Первая Речка"}
FAR = {"lat": 43.0299, "lng": 131.8921}
INTERNAL_WORDS = ("home", "confidence", "local_factor", "weight")


async def test_set_home_creates_the_my_area_subscription(world: World) -> None:
    user = await world.actor("user")
    assert (await user.get("/auth/me")).json()["home"] is None

    response = await user.put("/users/me/home", json=HOME)
    assert response.status_code == 200, response.text
    home = response.json()["home"]
    assert (home["lat"], home["lng"], home["label"]) == (43.137, 131.903, "Первая Речка")
    assert home["set_at"].endswith("Z")
    assert home["can_change_at"] is not None

    subscriptions = (await user.get("/me/subscriptions")).json()
    assert [(item["title"], item["radius_m"], item["layers"]) for item in subscriptions] == [
        ("Мой район", 1000, ["issue", "event"])
    ]
    assert (subscriptions[0]["lat"], subscriptions[0]["lng"]) == (43.137, 131.903)
    assert subscriptions[0]["is_home"] is True
    direct_delete = await user.delete(f"/me/subscriptions/{subscriptions[0]['id']}")
    assert direct_delete.status_code == 409
    manual = await user.post(
        "/me/subscriptions",
        json={"title": "Работа", "lat": 43.1, "lng": 131.9, "radius_m": 500, "layers": ["event"]},
    )
    assert manual.json()["is_home"] is False
    assert (await user.delete(f"/me/subscriptions/{manual.json()['id']}")).status_code == 204
    assert (await user.get("/auth/me")).json()["home"] == home
    assert (await world.http.put(f"{API}/users/me/home", json=HOME)).status_code == 401
    assert (await user.put("/users/me/home", json={"lat": 143, "lng": 131.9})).status_code == 422


async def test_home_change_cooldown(world: World) -> None:
    user = await world.actor("user")
    await user.put("/users/me/home", json=HOME)

    relabel = await user.put("/users/me/home", json={**HOME, "label": "У станции"})
    assert relabel.status_code == 200
    assert relabel.json()["home"]["label"] == "У станции"

    too_soon = await user.put("/users/me/home", json=FAR)
    assert too_soon.status_code == 429
    assert too_soon.json()["code"] == "home_cooldown"

    world.clock.shift(timedelta(days=29))
    assert (await user.put("/users/me/home", json=FAR)).status_code == 429
    world.clock.shift(timedelta(days=2))
    assert (await user.get("/auth/me")).json()["home"]["can_change_at"] is None
    moved = await user.put("/users/me/home", json=FAR)
    assert moved.status_code == 200
    assert (moved.json()["home"]["lat"], moved.json()["home"]["label"]) == (43.03, None)
    subscriptions = (await user.get("/me/subscriptions")).json()
    assert [(item["lat"], item["lng"]) for item in subscriptions] == [(43.03, 131.892)]


async def test_remove_home_keeps_the_cooldown(world: World) -> None:
    user = await world.actor("user")
    await user.put("/users/me/home", json=HOME)

    removed = await user.delete("/users/me/home")
    assert removed.status_code == 200
    assert removed.json()["home"] is None
    assert (await user.get("/me/subscriptions")).json() == []
    assert (await user.delete("/users/me/home")).status_code == 200

    assert (await user.put("/users/me/home", json=FAR)).status_code == 429
    world.clock.shift(timedelta(days=31))
    assert (await user.put("/users/me/home", json=FAR)).status_code == 200


async def test_home_is_private(world: World, client: AsyncClient) -> None:
    resident = await world.actor("resident", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    await resident.put("/users/me/home", json=HOME)
    place = await world.create_place(resident, lat=HOME["lat"], lng=HOME["lng"])

    profile_fields = {
        "id",
        "username",
        "display_name",
        "level",
        "role",
        "reputation",
        "bio",
        "created_at",
        "stats",
        "next_level",
        "respected_by_me",
    }
    public_profile = (await client.get(f"{API}/users/{resident.id}")).json()
    seen_by_moderator = (await moderator.get(f"/users/{resident.id}")).json()
    for profile in (public_profile, seen_by_moderator):
        assert set(profile) == profile_fields
        assert not any(word in str(profile).lower() for word in INTERNAL_WORDS)
    detail = (await moderator.get(f"/places/{place['id']}")).json()
    assert set(detail["author"]) == {"id", "username", "display_name", "level", "role", "reputation"}
    top = (await client.get(f"{API}/users/top")).json()
    assert all("home" not in user for user in top)
    assert (await moderator.get("/me/subscriptions")).json() == []
    history = (await client.get(f"{API}/places/{place['id']}/history")).json()
    assert not any(word in entry["message"].lower() for entry in history for word in ("район", "дом"))


async def test_resident_vote_on_an_outage_outweighs_a_distant_one(world: World) -> None:
    author = await world.actor("author", reputation=20)
    neighbour = await world.actor("neighbour", reputation=200)
    visitor = await world.actor("visitor", reputation=200)
    spot = {"lat": HOME["lat"] + 0.001, "lng": HOME["lng"]}

    await neighbour.put("/users/me/home", json=HOME)
    await visitor.put("/users/me/home", json=FAR)
    world.clock.shift(timedelta(days=31))
    landmark = await world.create_place(author, "viewpoint", **spot)
    await world.vote(neighbour, landmark["id"], **spot)
    await world.vote(visitor, landmark["id"])

    near_outage = await world.create_place(author, "utilities", lat=HOME["lat"] + 0.002, lng=HOME["lng"])
    twin_outage = await world.create_place(author, "utilities", lat=HOME["lat"] + 0.004, lng=HOME["lng"])
    by_neighbour = await world.vote(neighbour, near_outage["id"])
    by_visitor = await world.vote(visitor, twin_outage["id"])

    assert near_outage["trust_score"] == twin_outage["trust_score"]
    assert by_neighbour["trust_score"] > by_visitor["trust_score"]
    assert (by_neighbour["issue"]["stage"], by_visitor["issue"]["stage"]) == ("confirmed", "detected")
    assert by_neighbour["verification"] == {
        **by_visitor["verification"],
        "my_vote": by_neighbour["verification"]["my_vote"],
    }

    event = await world.create_place(author, "culture", event=world.event_window(), **spot)
    twin_event = await world.create_place(
        author, "culture", event=world.event_window(), lat=spot["lat"] + 0.004, lng=spot["lng"]
    )
    assert (await world.vote(neighbour, event["id"]))["trust_score"] == (
        await world.vote(visitor, twin_event["id"])
    )["trust_score"]


async def test_author_living_nearby_gets_a_stronger_prior(world: World) -> None:
    local = await world.actor("local", reputation=20)
    stranger = await world.actor("stranger", reputation=20)
    await local.put("/users/me/home", json=HOME)
    world.clock.shift(timedelta(days=31))
    warmup = await world.create_place(stranger, "viewpoint", lat=HOME["lat"], lng=HOME["lng"])
    await world.vote(local, warmup["id"], lat=HOME["lat"], lng=HOME["lng"])

    by_local = await world.create_place(local, "utilities", lat=HOME["lat"] + 0.001, lng=HOME["lng"])
    by_stranger = await world.create_place(stranger, "utilities", lat=HOME["lat"] + 0.003, lng=HOME["lng"])
    assert by_local["trust_score"] > by_stranger["trust_score"]
    tourism_local = await world.create_place(local, "viewpoint", lat=HOME["lat"] + 0.005, lng=HOME["lng"])
    tourism_stranger = await world.create_place(
        stranger, "viewpoint", lat=HOME["lat"] + 0.007, lng=HOME["lng"]
    )
    assert tourism_local["trust_score"] == tourism_stranger["trust_score"]
