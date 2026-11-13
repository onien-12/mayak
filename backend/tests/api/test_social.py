"""Users, respects, subscriptions, collections, notifications, statistics and uploads."""

from io import BytesIO
from typing import Any

from httpx import AsyncClient
from PIL import Image

from app.domain import limits
from app.domain.enums import UserRole
from tests.conftest import API, CENTER, World


def _image_bytes(
    size: tuple[int, int] = (2400, 1200), image_format: str = "PNG", color: str = "navy"
) -> bytes:
    buffer = BytesIO()
    Image.new("RGBA" if image_format == "PNG" else "RGB", size, color).save(buffer, format=image_format)
    return buffer.getvalue()


async def _upload(actor: Any, data: bytes, name: str = "photo.png") -> Any:
    return await actor.post("/uploads", files={"file": (name, data, "application/octet-stream")})


async def test_profile_and_top(world: World, client: AsyncClient) -> None:
    expert = await world.actor("expert", reputation=210)
    resident = await world.actor("resident", reputation=18)
    place = await world.create_place(resident)
    await world.vote(expert, place["id"])

    top = (await client.get(f"{API}/users/top", params={"limit": 1})).json()
    assert [user["username"] for user in top] == ["expert"]

    profile = (await client.get(f"{API}/users/{resident.id}")).json()
    assert (profile["level"], profile["reputation"]) == ("resident", 21)
    assert profile["next_level"] == {"level": "trusted", "reputation_required": 50}
    assert profile["stats"] == {
        "places_total": 1,
        "places_verified": 0,
        "votes": 0,
        "reviews": 0,
        "routes": 0,
        "events_organized": 0,
        "respects_received": 0,
    }
    assert profile["respected_by_me"] is False
    assert "email" not in profile
    assert (await client.get(f"{API}/users/{expert.id}")).json()["next_level"] is None
    assert (await client.get(f"{API}/users/9999")).status_code == 404

    updated = (
        await resident.patch("/users/me", json={"display_name": "Дима Чуркин", "bio": "Чуркин — сила"})
    ).json()
    assert (updated["display_name"], updated["bio"]) == ("Дима Чуркин", "Чуркин — сила")
    assert (await client.patch(f"{API}/users/me", json={"bio": "x"})).status_code == 401


async def test_user_places_show_pending_only_to_the_owner(world: World, client: AsyncClient) -> None:
    newcomer = await world.actor("newcomer")
    pending = await world.create_place(newcomer)
    path = f"/users/{newcomer.id}/places"
    assert (await client.get(f"{API}{path}")).json() == []
    assert [item["id"] for item in (await newcomer.get(path)).json()] == [pending["id"]]


async def test_respect_rules(world: World) -> None:
    resident = await world.actor("resident", reputation=18)
    newcomer = await world.actor("newcomer")
    target = await world.actor("target", reputation=48)

    assert (await newcomer.post(f"/users/{target.id}/respect")).status_code == 403
    assert (await resident.post(f"/users/{resident.id}/respect")).status_code == 400

    sent = await resident.post(f"/users/{target.id}/respect")
    assert sent.status_code == 200
    profile = sent.json()
    assert (profile["respected_by_me"], profile["reputation"], profile["level"]) == (True, 51, "trusted")
    assert profile["stats"]["respects_received"] == 1
    assert (await resident.post(f"/users/{target.id}/respect")).status_code == 409

    kinds = [item["kind"] for item in (await target.get("/notifications")).json()]
    assert sorted(kinds) == ["level_up", "respect"]
    events = (await target.get("/me/reputation")).json()
    assert [(item["reason"], item["delta"]) for item in events] == [("respect_received", 3)]
    assert events[0]["message"]

    others = [await world.actor(f"other{index}") for index in range(limits.RESPECTS_PER_DAY)]
    statuses = [(await resident.post(f"/users/{other.id}/respect")).status_code for other in others]
    assert statuses == [200] * (limits.RESPECTS_PER_DAY - 1) + [429]


async def test_subscriptions_and_territory_notifications(world: World) -> None:
    subscriber = await world.actor("subscriber")
    author = await world.actor("author", reputation=20)
    newcomer = await world.actor("newcomer")
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    body = {"title": "Центр", **CENTER, "radius_m": 500, "layers": ["infrastructure", "issue"]}

    created = await subscriber.post("/me/subscriptions", json=body)
    assert created.status_code == 201
    subscription = created.json()
    assert subscription["layers"] == ["infrastructure", "issue"]
    assert (await subscriber.post("/me/subscriptions", json={**body, "radius_m": 100})).status_code == 422

    await world.create_place(author, lat=CENTER["lat"] + 0.001, lng=CENTER["lng"])
    await world.create_place(author, lat=CENTER["lat"] + 0.05, lng=CENTER["lng"])
    await world.create_place(author, "viewpoint", lat=CENTER["lat"] + 0.002, lng=CENTER["lng"])
    pending = await world.create_place(newcomer, lat=CENTER["lat"] - 0.001, lng=CENTER["lng"])

    notifications = (await subscriber.get("/notifications")).json()
    assert [item["kind"] for item in notifications] == ["territory"]
    assert notifications[0]["title"] == "Новое на территории «Центр»"

    case_id = (await moderator.get("/moderation/queue")).json()[0]["id"]
    await moderator.post(
        f"/moderation/cases/{case_id}/resolve", json={"action": "approve", "reason": "Подтверждаю"}
    )
    notifications = (await subscriber.get("/notifications")).json()
    assert notifications[0]["link"] == f"/?place={pending['id']}"
    assert len(notifications) == 2

    assert [item["id"] for item in (await subscriber.get("/me/subscriptions")).json()] == [subscription["id"]]
    assert (await author.delete(f"/me/subscriptions/{subscription['id']}")).status_code == 404
    assert (await subscriber.delete(f"/me/subscriptions/{subscription['id']}")).status_code == 204
    assert (await subscriber.get("/me/subscriptions")).json() == []

    for index in range(limits.MAX_SUBSCRIPTIONS):
        assert (
            await subscriber.post("/me/subscriptions", json={**body, "title": f"Зона {index}"})
        ).status_code == 201
    assert (await subscriber.post("/me/subscriptions", json=body)).status_code == 409


async def test_notifications_read_flow(world: World) -> None:
    author = await world.actor("author", reputation=20)
    guest = await world.actor("guest")
    place = await world.create_place(author)
    for text in ("Первый", "Второй", "Третий"):
        await guest.post(f"/places/{place['id']}/comments", json={"text": text})

    assert (await author.get("/auth/me")).json()["unread_notifications"] == 3
    notifications = (await author.get("/notifications")).json()
    assert [item["is_read"] for item in notifications] == [False] * 3
    assert "Третий" in notifications[0]["body"]
    assert len((await author.get("/notifications", params={"limit": 2, "offset": 2})).json()) == 1

    one = await author.post("/notifications/read", json={"ids": [notifications[0]["id"]]})
    assert one.json() == {"unread": 2}
    everything = await author.post("/notifications/read", json={})
    assert everything.json() == {"unread": 0}
    assert (await author.get("/auth/me")).json()["unread_notifications"] == 0
    assert (await guest.get("/notifications")).json() == []
    assert (await world.http.get(f"{API}/notifications")).status_code == 401


async def test_collections(world: World, client: AsyncClient) -> None:
    owner = await world.actor("owner", reputation=20)
    stranger = await world.actor("stranger")
    first = await world.create_place(owner)
    second = await world.create_place(owner, "viewpoint")

    created = await owner.post(
        "/collections", json={"title": "Куда сводить гостей", "description": "Проверено"}
    )
    assert created.status_code == 201
    collection = created.json()
    assert (collection["is_public"], collection["items_count"], collection["cover_url"]) == (False, 0, None)
    path = f"/collections/{collection['id']}"

    assert (await owner.put(f"{path}/places/{first['id']}")).status_code == 204
    assert (await owner.put(f"{path}/places/{second['id']}")).status_code == 204
    assert (await owner.put(f"{path}/places/{second['id']}")).status_code == 204
    assert (await owner.put(f"{path}/places/9999")).status_code == 404

    assert (await client.get(f"{API}{path}")).status_code == 404
    assert (await stranger.get(path)).status_code == 404
    assert (await stranger.put(f"{path}/places/{first['id']}")).status_code == 404
    assert (await client.get(f"{API}/collections")).json() == []
    assert (await client.get(f"{API}/collections", params={"scope": "mine"})).status_code == 401
    mine = (await owner.get("/collections", params={"scope": "mine"})).json()
    assert [(item["id"], item["items_count"]) for item in mine] == [(collection["id"], 2)]

    published = (await owner.patch(path, json={"is_public": True, "title": "Гостям города"})).json()
    assert (published["is_public"], published["title"], published["items_count"]) == (
        True,
        "Гостям города",
        2,
    )
    assert (await stranger.patch(path, json={"title": "Взлом"})).status_code == 403
    assert (await stranger.delete(path)).status_code == 403

    detail = (await client.get(f"{API}{path}")).json()
    assert [place["id"] for place in detail["places"]] == [first["id"], second["id"]]
    assert (detail["can_edit"], detail["owner"]["username"]) == (False, "owner")
    assert (await owner.get(path)).json()["can_edit"] is True
    assert [item["id"] for item in (await client.get(f"{API}/collections")).json()] == [collection["id"]]

    assert (await owner.delete(f"{path}/places/{first['id']}")).status_code == 204
    assert (await client.get(f"{API}{path}")).json()["items_count"] == 1
    assert (await owner.delete(path)).status_code == 204
    assert (await client.get(f"{API}{path}")).status_code == 404
    assert (await owner.post("/collections", json={"title": "ab"})).status_code == 422


async def test_stats(world: World, client: AsyncClient) -> None:
    expert = await world.actor("expert", reputation=210)
    resident = await world.actor("resident", reputation=18)
    newcomer = await world.actor("newcomer")
    toilet = await world.create_place(resident)
    await world.create_place(resident, "culture", event=world.event_window())
    issue = await world.create_place(resident, "roads")
    await world.create_place(newcomer)
    await world.vote(expert, toilet["id"])
    await world.vote(expert, issue["id"])

    stats = (await client.get(f"{API}/stats")).json()
    assert stats["totals"] == {
        "places": 3,
        "verified_places": 0,
        "imported_places": 0,
        "confirmed_imported": 0,
        "events_upcoming": 1,
        "events_upcoming_community": 1,
        "issues_open": 1,
        "issues_open_community": 1,
        "issues_resolved": 0,
        "routes": 0,
        "users": 3,
        "votes": 2,
    }
    assert [(item["source"], item["count"]) for item in stats["imported_by_source"]] == [
        ("vl_ru", 0),
        ("vl_ru_off", 0),
        ("osm", 0),
        ("wikivoyage", 0),
    ]
    assert {item["layer"]: item["count"] for item in stats["by_layer"]} == {
        "infrastructure": 1,
        "event": 1,
        "tourism": 0,
        "issue": 1,
    }
    assert {item["status"]: item["count"] for item in stats["status_breakdown"]} == {
        "unverified": 1,
        "preliminary": 2,
        "verified": 0,
        "needs_review": 0,
    }
    assert {item["stage"]: item["count"] for item in stats["issues_by_stage"]}["detected"] == 1
    assert len(stats["issues_by_stage"]) == 5
    assert {item["name"] for item in stats["top_categories"]} == {"Туалет", "Культура", "Дороги и транспорт"}
    assert len(stats["activity"]) == 30
    # The newcomer's place was not checked (no model) and waits for a moderator: not counted yet.
    assert stats["activity"][-1] == {"date": "2026-11-11", "places": 3, "votes": 2}
    assert stats["activity"][0]["date"] == "2026-10-13"
    assert stats["top_contributors"][0]["username"] == "expert"


async def test_upload_and_attach_photos(world: World, client: AsyncClient, app: Any) -> None:
    author = await world.actor("author", reputation=20)
    guest = await world.actor("guest")

    uploaded = await _upload(author, _image_bytes())
    assert uploaded.status_code == 201, uploaded.text
    photo = uploaded.json()
    assert (photo["width"], photo["height"]) == (1600, 800)
    assert photo["url"].startswith("/media/")
    assert photo["url"].endswith(".jpg")
    served = await client.get(photo["url"])
    assert served.status_code == 200
    with Image.open(BytesIO(served.content)) as stored:
        assert (stored.format, stored.size) == ("JPEG", (1600, 800))
        assert not stored.getexif()

    assert (await _upload(author, b"definitely not an image")).status_code == 415
    gif = BytesIO()
    Image.new("RGB", (10, 10)).save(gif, format="GIF")
    assert (await _upload(author, gif.getvalue(), "anim.gif")).status_code == 415
    assert (await _upload(author, b"\0" * (limits.MAX_UPLOAD_BYTES + 1))).status_code == 413
    assert (
        await world.http.post(f"{API}/uploads", files={"file": ("a.png", _image_bytes((10, 10)))})
    ).status_code == 401

    place = await world.create_place(author, photo_ids=[photo["id"]])
    assert place["cover_url"] == photo["url"]
    assert [item["id"] for item in place["photos"]] == [photo["id"]]
    assert (await client.get(f"{API}/places")).json()[0]["cover_url"] == photo["url"]

    stolen = await guest.post("/places", json=await world.place_payload(photo_ids=[photo["id"]]))
    assert stolen.status_code == 422

    extra = (await _upload(guest, _image_bytes((300, 500), "JPEG", "teal"), "extra.jpg")).json()
    added = await guest.post(f"/places/{place['id']}/photos", json={"photo_ids": [extra["id"]]})
    assert added.status_code == 200, added.text
    assert [item["id"] for item in added.json()["photos"]] == [photo["id"], extra["id"]]
    history = (await client.get(f"{API}/places/{place['id']}/history")).json()
    assert history[0]["kind"] == "photos_added"

    reordered = await author.patch(f"/places/{place['id']}", json={"photo_ids": [extra["id"]]})
    assert reordered.status_code == 200, reordered.text
    assert reordered.json()["cover_url"] == extra["url"]
    assert [item["id"] for item in reordered.json()["photos"]] == [extra["id"]]
