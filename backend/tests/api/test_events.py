from datetime import timedelta
from typing import Any

from httpx import AsyncClient

from tests.conftest import API, World


async def _event(world: World, organizer: Any, **event: Any) -> dict[str, Any]:
    window = world.event_window(event.pop("starts_in_hours", 48), event.pop("duration_hours", 2))
    place_fields = {key: event.pop(key) for key in ("title",) if key in event}
    slug = event.pop("slug", "culture")
    return await world.create_place(organizer, slug, event={**window, **event}, **place_fields)


async def test_event_layer_requires_event_block(world: World) -> None:
    organizer = await world.actor("organizer", reputation=20)
    missing = await organizer.post("/places", json=await world.place_payload("culture"))
    assert missing.status_code == 422

    window = world.event_window()
    reversed_window = {"starts_at": window["ends_at"], "ends_at": window["starts_at"]}
    assert (
        await organizer.post("/places", json=await world.place_payload("culture", event=reversed_window))
    ).status_code == 422

    in_the_past = world.event_window(starts_in_hours=-10)
    past = await organizer.post("/places", json=await world.place_payload("culture", event=in_the_past))
    assert past.status_code == 422
    assert past.json()["errors"][0]["field"] == "event.ends_at"

    on_wrong_layer = await organizer.post("/places", json=await world.place_payload("toilet", event=window))
    assert on_wrong_layer.status_code == 422


async def test_join_leave_and_capacity(world: World, client: AsyncClient) -> None:
    organizer = await world.actor("organizer", reputation=20)
    first = await world.actor("first")
    second = await world.actor("second")
    event = await _event(world, organizer, capacity=1, is_meetup=True, contact="Телеграм: @org")
    path = f"/places/{event['id']}/event/participation"
    assert event["event"]["phase"] == "open"
    assert event["event"]["seats_left"] == 1
    assert event["event"]["contact"] == "Телеграм: @org"

    assert (await first.get(f"/places/{event['id']}")).json()["event"]["contact"] is None

    joined = await first.put(path)
    assert joined.status_code == 200, joined.text
    details = joined.json()["event"]
    assert (details["is_joined"], details["participants_count"], details["seats_left"]) == (True, 1, 0)
    assert details["phase"] == "closed"
    assert details["contact"] == "Телеграм: @org"
    assert (await first.put(path)).status_code == 200

    full = await second.put(path)
    assert full.status_code == 409
    assert full.json()["detail"] == "Свободных мест не осталось."

    participants = (await client.get(f"{API}/places/{event['id']}/event/participants")).json()
    assert [user["username"] for user in participants] == ["first"]
    assert [item["kind"] for item in (await organizer.get("/notifications")).json()] == ["event_joined"]
    assert [item["id"] for item in (await first.get("/me/events")).json()] == [event["id"]]
    assert [item["id"] for item in (await organizer.get("/me/events")).json()] == [event["id"]]

    left = (await first.delete(path)).json()["event"]
    assert (left["is_joined"], left["participants_count"], left["phase"]) == (False, 0, "open")
    assert (await second.put(path)).status_code == 200
    assert (await first.get("/me/events")).json() == []

    toilet = await world.create_place(organizer)
    assert (await first.put(f"/places/{toilet['id']}/event/participation")).status_code == 400


async def test_phase_follows_the_clock(world: World, client: AsyncClient) -> None:
    organizer = await world.actor("organizer", reputation=20)
    guest = await world.actor("guest")
    event = await _event(world, organizer, starts_in_hours=48, duration_hours=2)
    url = f"{API}/places/{event['id']}"

    async def phase() -> str:
        return (await client.get(url)).json()["event"]["phase"]

    assert await phase() == "open"
    world.clock.shift(timedelta(hours=46))
    assert await phase() == "soon"
    world.clock.shift(timedelta(hours=2, minutes=30))
    assert await phase() == "ongoing"
    assert (await guest.put(f"/places/{event['id']}/event/participation")).status_code == 200

    world.clock.shift(timedelta(hours=3))
    assert await phase() == "finished"
    assert (await guest.put(f"/places/{event['id']}/event/participation")).status_code == 200
    another = await world.actor("another")
    late = await another.put(f"/places/{event['id']}/event/participation")
    assert late.status_code == 409

    assert (await client.get(f"{API}/places")).json() == []
    assert (await client.get(f"{API}/events")).json() == []
    assert len((await client.get(f"{API}/places", params={"include_past_events": "true"})).json()) == 1
    past = (await client.get(f"{API}/events", params={"scope": "past"})).json()
    assert [item["id"] for item in past] == [event["id"]]
    assert past[0]["event"]["phase"] == "finished"
    assert past[0]["is_stale"] is False


async def test_recurring_event_creates_a_series(world: World, client: AsyncClient) -> None:
    organizer = await world.actor("organizer", reputation=20)
    first = await _event(
        world, organizer, repeat={"interval_days": 7, "count": 4}, is_meetup=True, capacity=10
    )
    assert first["event"]["series_id"]

    listed = (await client.get(f"{API}/events")).json()
    assert len(listed) == 4
    starts = [item["event"]["starts_at"] for item in listed]
    assert starts == sorted(starts)
    details = [(await client.get(f"{API}/places/{item['id']}")).json() for item in listed]
    assert {detail["event"]["series_id"] for detail in details} == {first["event"]["series_id"]}
    assert (await organizer.get("/auth/me")).json()["permissions"]["places_left_today"] == 9


async def test_event_list_filters_and_sorting(world: World, client: AsyncClient) -> None:
    organizer = await world.actor("organizer", reputation=20)
    guest = await world.actor("guest")
    concert = await _event(world, organizer, starts_in_hours=72, price=500, title="Концерт")
    meetup = await _event(
        world, organizer, slug="sport", starts_in_hours=24, is_meetup=True, title="Стритбол"
    )
    lecture = await _event(world, organizer, slug="education", starts_in_hours=200, title="Лекция о крепости")
    await guest.put(f"/places/{lecture['id']}/event/participation")

    async def ids(**params: Any) -> list[int]:
        response = await client.get(f"{API}/events", params=params)
        assert response.status_code == 200, response.text
        return [item["id"] for item in response.json()]

    assert await ids() == [meetup["id"], concert["id"], lecture["id"]]
    assert await ids(sort="popular") == [lecture["id"], meetup["id"], concert["id"]]
    assert await ids(sort="price") == [meetup["id"], lecture["id"], concert["id"]]
    assert await ids(free="true") == [meetup["id"], lecture["id"]]
    assert await ids(meetups="only") == [meetup["id"]]
    assert await ids(meetups="exclude") == [concert["id"], lecture["id"]]
    assert await ids(q="крепост") == [lecture["id"]]
    assert await ids(categories=str(concert["category_id"])) == [concert["id"]]
    assert await ids(limit=1, offset=1) == [concert["id"]]
    window = world.event_window(starts_in_hours=60, duration_hours=40)
    assert await ids(**{"from": window["starts_at"], "to": window["ends_at"]}) == [concert["id"]]
    nearest_first = await ids(sort="distance", lat=lecture["lat"], lng=lecture["lng"])
    assert nearest_first[0] == lecture["id"]
    assert (await client.get(f"{API}/events", params={"sort": "distance"})).status_code == 422

    # Test places stand about 445 m apart: the meetup is the lecture's neighbour, the concert is not.
    around_lecture = {"lat": lecture["lat"], "lng": lecture["lng"]}
    assert await ids(radius_m=100, **around_lecture) == [lecture["id"]]
    assert await ids(radius_m=500, **around_lecture) == [meetup["id"], lecture["id"]]
    assert await ids(radius_m=500, sort="distance", **around_lecture) == [lecture["id"], meetup["id"]]
    assert await ids(radius_m=500, limit=1, offset=1, **around_lecture) == [lecture["id"]]
    assert (await client.get(f"{API}/events", params={"radius_m": 500})).status_code == 422

    overlapping = await client.get(
        f"{API}/places",
        params={"layers": "event", "event_from": window["starts_at"], "event_to": window["ends_at"]},
    )
    assert [item["id"] for item in overlapping.json()] == [concert["id"]]


async def test_reschedule_and_cancel_notify_participants(world: World, client: AsyncClient) -> None:
    organizer = await world.actor("organizer", reputation=20)
    guest = await world.actor("guest")
    event = await _event(world, organizer)
    await guest.put(f"/places/{event['id']}/event/participation")

    moved = world.event_window(starts_in_hours=96)
    rescheduled = await organizer.patch(f"/places/{event['id']}", json={"event": moved})
    assert rescheduled.status_code == 200, rescheduled.text
    assert rescheduled.json()["event"]["starts_at"][:16] == moved["starts_at"][:16]

    cancelled = await organizer.patch(f"/places/{event['id']}", json={"event": {"is_cancelled": True}})
    assert cancelled.json()["event"]["phase"] == "cancelled"
    assert cancelled.json()["event"]["is_cancelled"] is True

    kinds = [item["kind"] for item in (await guest.get("/notifications")).json()]
    assert kinds == ["event_cancelled", "event_changed"]
    assert (await client.get(f"{API}/events")).json() == []
    assert (await client.get(f"{API}/events", params={"scope": "past"})).json() == []
    everything = (await client.get(f"{API}/events", params={"scope": "all"})).json()
    assert [(item["id"], item["event"]["phase"]) for item in everything] == [(event["id"], "cancelled")]
    assert (await guest.get("/me/events")).json() == []
    assert (await organizer.get("/me/events")).json() == []
    for person in (guest, organizer):
        past = (await person.get("/me/events", params={"scope": "past"})).json()
        assert [item["id"] for item in past] == [event["id"]]
    assert (await client.get(f"{API}/places/{event['id']}")).status_code == 200
    assert (await guest.put(f"/places/{event['id']}/event/participation")).status_code == 200
    stranger = await world.actor("stranger")
    refused = await stranger.put(f"/places/{event['id']}/event/participation")
    assert refused.status_code == 409
    assert refused.json()["detail"] == "Событие отменено."

    world.clock.shift(timedelta(days=10))
    ended = (await client.get(f"{API}/events", params={"scope": "past"})).json()
    assert [(item["id"], item["event"]["phase"]) for item in ended] == [(event["id"], "cancelled")]

    closed = await _event(world, organizer)
    await organizer.patch(f"/places/{closed['id']}", json={"event": {"registration_closed": True}})
    assert (await stranger.put(f"/places/{closed['id']}/event/participation")).status_code == 409
