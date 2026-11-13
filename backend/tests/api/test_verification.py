from httpx import AsyncClient

from app.domain.enums import UserRole
from tests.conftest import API, World


async def _reputation(actor) -> int:
    return (await actor.get("/auth/me")).json()["reputation"]


async def test_votes_move_a_place_from_unverified_to_verified(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    expert = await world.actor("expert", reputation=200)
    trusted = await world.actor("trusted", reputation=60)
    resident = await world.actor("resident", reputation=15)
    place = await world.create_place(author, "viewpoint")
    assert place["status"] == "unverified"

    after_first = await world.vote(expert, place["id"])
    assert after_first["status"] == "preliminary"
    assert after_first["verification"]["present"] == 1
    assert after_first["verification"]["my_vote"]["kind"] == "present"
    assert after_first["last_confirmed_at"] is not None
    assert after_first["trust_score"] > place["trust_score"]

    after_second = await world.vote(trusted, place["id"])
    assert after_second["status"] == "preliminary"

    after_third = await world.vote(resident, place["id"])
    assert after_third["status"] == "verified"
    assert after_third["trust_score"] > after_second["trust_score"]

    assert await _reputation(expert) == 202
    assert await _reputation(author) == 20 + 3 + 10
    reasons = [item["reason"] for item in (await author.get("/me/reputation")).json()]
    assert reasons == ["place_verified", "place_preliminary"]

    kinds = [item["kind"] for item in (await author.get("/notifications")).json()]
    assert kinds == ["place_verified"]
    history = (await client.get(f"{API}/places/{place['id']}/history")).json()
    assert [(entry["old_status"], entry["new_status"]) for entry in history[:2]] == [
        ("preliminary", "verified"),
        ("unverified", "preliminary"),
    ]
    assert (await client.get(f"{API}/places", params={"min_status": "verified"})).json()[0]["id"] == place[
        "id"
    ]


async def test_cannot_vote_on_own_place(world: World) -> None:
    author = await world.actor("author", reputation=20)
    place = await world.create_place(author)
    response = await author.post(f"/places/{place['id']}/votes", json={"kind": "present"})
    assert response.status_code == 403
    assert (
        await world.http.post(f"{API}/places/{place['id']}/votes", json={"kind": "present"})
    ).status_code == 401


async def test_revote_replaces_the_vote_and_is_rewarded_once(world: World) -> None:
    author = await world.actor("author", reputation=20)
    voter = await world.actor("voter", reputation=200)
    place = await world.create_place(author)

    await world.vote(voter, place["id"], "present")
    changed = await world.vote(voter, place["id"], "unclear")
    assert changed["verification"] == {
        "present": 0,
        "absent": 0,
        "unclear": 1,
        "my_vote": changed["verification"]["my_vote"],
    }
    assert changed["verification"]["my_vote"]["kind"] == "unclear"
    assert changed["status"] == "unverified"
    assert await _reputation(voter) == 202


async def test_proximity_makes_a_vote_heavier(world: World) -> None:
    author = await world.actor("author", reputation=20)
    far_voter = await world.actor("far", reputation=15)
    near_voter = await world.actor("near", reputation=15)
    first = await world.create_place(author)
    second = await world.create_place(author)

    far = await world.vote(far_voter, first["id"], lat=43.0, lng=131.8)
    near = await world.vote(near_voter, second["id"], lat=second["lat"], lng=second["lng"])
    assert near["trust_score"] > far["trust_score"]


async def test_fresh_newcomer_vote_weighs_too_little_to_confirm(world: World) -> None:
    author = await world.actor("author", reputation=20)
    fresh = await world.actor("fresh", age_days=0)
    place = await world.create_place(author)
    assert (await world.vote(fresh, place["id"]))["status"] == "unverified"


async def test_absent_votes_trigger_review_then_hide(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    experts = [await world.actor(f"expert{index}", reputation=200) for index in range(3)]
    trusted = await world.actor("trusted", reputation=60)
    place = await world.create_place(author, "viewpoint")

    assert (await world.vote(experts[0], place["id"], "absent"))["status"] == "unverified"
    disputed = await world.vote(trusted, place["id"], "absent")
    assert disputed["status"] == "needs_review"
    case = (await moderator.get("/moderation/queue")).json()[0]
    assert (case["target_id"], case["triggers"]) == (place["id"], ["absent_votes"])
    assert (await client.get(f"{API}/places/{place['id']}")).status_code == 200

    await world.vote(experts[1], place["id"], "absent")
    hidden = await experts[2].post(f"/places/{place['id']}/votes", json={"kind": "absent"})
    assert hidden.status_code == 200
    assert hidden.json()["status"] == "hidden"

    assert (await client.get(f"{API}/places/{place['id']}")).status_code == 404
    assert (await client.get(f"{API}/places")).json() == []
    own = (await author.get(f"/places/{place['id']}")).json()
    assert own["status"] == "hidden"
    assert own["can_appeal"] is True
    assert await _reputation(author) == 20 - 10
    assert len((await moderator.get("/moderation/queue")).json()) == 1
    assert (
        await experts[0].post(f"/places/{place['id']}/votes", json={"kind": "present"})
    ).status_code == 404


async def test_votes_are_rate_limited_per_hour(world: World) -> None:
    author = await world.actor("author", reputation=20)
    voter = await world.actor("voter", reputation=15)
    place = await world.create_place(author)
    statuses = [
        (await voter.post(f"/places/{place['id']}/votes", json={"kind": "present"})).status_code
        for _ in range(61)
    ]
    assert statuses[:60] == [200] * 60
    assert statuses[60] == 429


async def test_issue_is_confirmed_and_resolved_by_votes(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    experts = [await world.actor(f"expert{index}", reputation=200) for index in range(4)]
    issue = await world.create_place(author, "roads", issue={"severity": "high", "radius_m": 200})
    assert issue["issue"]["stage"] == "detected"
    assert issue["issue"]["source"] == "user"
    assert issue["issue"]["severity"] == "high"

    first = await world.vote(experts[0], issue["id"], "present")
    assert (first["issue"]["stage"], first["status"]) == ("detected", "preliminary")
    confirmed = await world.vote(experts[1], issue["id"], "present")
    assert confirmed["issue"]["stage"] == "confirmed"

    await world.vote(experts[2], issue["id"], "absent")
    resolved = await world.vote(experts[3], issue["id"], "absent")
    assert resolved["issue"]["stage"] == "resolved"
    assert resolved["issue"]["resolved_at"] is not None
    assert resolved["status"] == "preliminary"

    assert await _reputation(author) == 20 + 3 + 5
    assert (await client.get(f"{API}/places")).json() == []
    with_resolved = (await client.get(f"{API}/places", params={"include_resolved": "true"})).json()
    assert with_resolved[0]["issue"] == {
        "stage": "resolved",
        "severity": "high",
        "radius_m": 200,
        "source": "user",
        "outage": None,
    }

    kinds = [entry["kind"] for entry in (await client.get(f"{API}/places/{issue['id']}/history")).json()]
    assert kinds.count("issue_stage") == 2
    notifications = [item["kind"] for item in (await author.get("/notifications")).json()]
    assert notifications.count("issue_update") == 2
    assert [item["kind"] for item in (await experts[0].get("/notifications")).json()] == ["issue_update"] * 2
    assert [item["kind"] for item in (await experts[1].get("/notifications")).json()] == ["issue_update"]
    assert (await experts[3].get("/notifications")).json() == []

    late = await experts[0].post(f"/places/{issue['id']}/votes", json={"kind": "present"})
    assert late.status_code == 409


async def test_moderator_attaches_official_info(world: World) -> None:
    author = await world.actor("author", reputation=20)
    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    issue = await world.create_place(author, "utilities", attributes={"service": "cold_water"})

    forbidden = await author.patch(f"/places/{issue['id']}/issue/official", json={"stage": "in_progress"})
    assert forbidden.status_code == 403

    response = await moderator.patch(
        f"/places/{issue['id']}/issue/official",
        json={
            "stage": "in_progress",
            "official_note": "Бригада выехала.",
            "responsible_org": "Водоканал",
            "expected_fix_at": "2026-11-12T08:00:00Z",
        },
    )
    assert response.status_code == 200, response.text
    official = response.json()["issue"]
    assert (official["stage"], official["source"]) == ("in_progress", "official")
    assert official["official_note"] == "Бригада выехала."
    assert official["expected_fix_at"] == "2026-11-12T08:00:00Z"
    assert official["appeal_number"] is None

    resolved = await moderator.patch(f"/places/{issue['id']}/issue/official", json={"stage": "resolved"})
    assert resolved.json()["issue"]["resolved_at"] is not None
    assert await _reputation(author) == 20
    kinds = [item["kind"] for item in (await author.get("/notifications")).json()]
    assert kinds == ["issue_update", "issue_update"]

    toilet = await world.create_place(author)
    not_issue = await moderator.patch(f"/places/{toilet['id']}/issue/official", json={"stage": "resolved"})
    assert not_issue.status_code == 400


async def test_a_vote_can_be_taken_back(world: World) -> None:
    author = await world.actor("author", reputation=20)
    expert = await world.actor("expert", reputation=200)
    place = await world.create_place(author, "viewpoint")

    voted = await world.vote(expert, place["id"])
    assert voted["status"] == "preliminary"
    assert await _reputation(expert) == 202

    response = await expert.delete(f"/places/{place['id']}/votes")
    assert response.status_code == 200, response.text
    withdrawn = response.json()
    assert withdrawn["verification"]["my_vote"] is None
    assert withdrawn["verification"]["present"] == 0
    assert withdrawn["status"] == "unverified"
    assert withdrawn["trust_score"] == place["trust_score"]
    assert withdrawn["last_confirmed_at"] is None

    # Nothing to take back: the place is returned as it is.
    assert (await expert.delete(f"/places/{place['id']}/votes")).json()["status"] == "unverified"
    # Voting again counts, but is not rewarded a second time.
    assert (await world.vote(expert, place["id"]))["status"] == "preliminary"
    assert await _reputation(expert) == 202
    assert (await world.http.delete(f"{API}/places/{place['id']}/votes")).status_code == 401
