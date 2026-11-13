"""Resident formats (SPEC §3.4): giveaways, requests for help, venues — and the category sync that
brings them to an existing database (SPEC §9)."""

from typing import Any

from httpx import AsyncClient
from sqlalchemy import delete, select

from app.domain.enums import Layer
from app.models import Category
from app.services import catalog
from tests.conftest import API, World


async def _event(world: World, author: Any, slug: str, **event: Any) -> dict[str, Any]:
    fields = {key: event.pop(key) for key in ("title", "attributes") if key in event}
    return await world.create_place(author, slug, event={**world.event_window(), **event}, **fields)


def _participation(place: dict[str, Any]) -> str:
    return f"/places/{place['id']}/event/participation"


async def _contributions(viewer: Any, place: dict[str, Any]) -> list[tuple[str, str, bool]]:
    path = f"/places/{place['id']}/event/contributions"
    response = await (viewer.get(f"{API}{path}") if isinstance(viewer, AsyncClient) else viewer.get(path))
    assert response.status_code == 200, response.text
    return [(item["author"]["username"], item["text"], item["on_review"]) for item in response.json()]


async def test_the_sync_adds_missing_categories_and_refreshes_the_others(world: World) -> None:
    async with world.session() as session:
        await session.execute(delete(Category).where(Category.slug.in_(("swap", "help", "venue"))))
        toilet = await session.scalar(select(Category).where(Category.slug == "toilet"))
        toilet.name, toilet.fields = "Старое имя", []
        session.add(Category(slug="legacy", layer=Layer.EVENT, group="Старое", name="Старое", icon="x"))
        await session.commit()

    async with world.session() as session:
        synced = await catalog.sync_categories(session)
        await session.commit()
    assert sorted(synced.added) == ["help", "swap", "venue"]
    assert synced.updated == ["toilet"]

    categories = {item["slug"]: item for item in (await world.http.get(f"{API}/categories")).json()}
    assert categories["venue"]["layer"] == "infrastructure"
    assert [field["key"] for field in categories["swap"]["fields"]] == ["offer", "bring_own"]
    assert categories["toilet"]["name"] == "Туалет"
    assert categories["toilet"]["fields"]
    assert "legacy" in categories, "a category the catalogue no longer has is never deleted"

    async with world.session() as session:
        again = await catalog.sync_categories(session)
    assert (again.added, again.updated) == ([], [])


async def test_an_empty_catalogue_is_left_to_the_seed(world: World) -> None:
    async with world.session() as session:
        await session.execute(delete(Category))
        await session.commit()
    async with world.session() as session:
        synced = await catalog.sync_categories(session)
        await session.commit()
    assert (synced.added, synced.updated) == ([], [])
    assert (await world.http.get(f"{API}/categories")).json() == []


async def test_venue_fields_are_typed(world: World) -> None:
    owner = await world.actor("owner", reputation=20)
    venue = await world.create_place(
        owner,
        "venue",
        title="Зал на Светланской",
        attributes={
            "activities": "тренировки, лекции",
            "capacity": "25",
            "free": "нет",
            "price": "800",
            "booking": "Телеграм @zal_vl",
            "hours": "9–21",
            "unknown": "дропнется",
        },
    )
    assert venue["layer"] == "infrastructure"
    assert venue["attributes"] == {
        "activities": "тренировки, лекции",
        "capacity": 25,
        "free": False,
        "price": 800,
        "booking": "Телеграм @zal_vl",
        "hours": "9–21",
    }
    wrong = await owner.post(
        "/places", json=await world.place_payload("venue", attributes={"capacity": "много"})
    )
    assert wrong.status_code == 422
    assert wrong.json()["errors"][0]["field"] == "attributes.capacity"

    meetup = await _event(world, owner, "sport", is_meetup=True, venue_place_id=venue["id"])
    assert meetup["event"]["venue_place_id"] == venue["id"]


async def test_a_request_for_help_is_a_free_meetup_answered_by_neighbours(
    world: World, client: AsyncClient
) -> None:
    author = await world.actor("author", reputation=20)
    helper = await world.actor("helper")
    late = await world.actor("late")
    request = await _event(
        world,
        author,
        "help",
        title="Перенести диван на третий этаж",
        capacity=1,
        price=500,
        is_meetup=False,
        contact="Телеграм @dima",
    )
    event = request["event"]
    assert (event["is_meetup"], event["price"], event["contact"]) == (True, 0, "Телеграм @dima")
    assert (await client.get(f"{API}/places/{request['id']}")).json()["event"]["contact"] is None
    assert (await helper.get(f"/places/{request['id']}")).json()["event"]["contact"] is None

    responded = (await helper.put(_participation(request))).json()["event"]
    assert (responded["is_joined"], responded["contact"]) == (True, "Телеграм @dima")
    full = await late.put(_participation(request))
    assert (full.status_code, full.json()["detail"]) == (409, "Помощников уже достаточно — спасибо!")

    # Editing cannot turn it into a public or paid event.
    updated = await author.patch(
        f"/places/{request['id']}", json={"event": {"is_meetup": False, "price": 300}}
    )
    assert (updated.json()["event"]["is_meetup"], updated.json()["event"]["price"]) == (True, 0)


async def test_a_swap_participant_says_what_they_bring(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    guest = await world.actor("guest")
    other = await world.actor("other")
    swap = await _event(
        world,
        author,
        "swap",
        title="Раздаю детские вещи",
        price=200,
        is_meetup=False,
        contact="Телеграм @org",
        attributes={"offer": "одежда на 3–5 лет", "bring_own": True},
    )
    assert (swap["event"]["price"], swap["event"]["is_meetup"]) == (0, True)
    assert (await guest.get(f"/places/{swap['id']}")).json()["event"]["contact"] is None
    assert swap["attributes"] == {"offer": "одежда на 3–5 лет", "bring_own": True}

    joined = await guest.put(_participation(swap), json={"note": "  книги и пазлы "})
    assert joined.status_code == 200, joined.text
    assert joined.json()["event"]["is_joined"] is True
    assert joined.json()["event"]["contact"] == "Телеграм @org"
    edited = await author.patch(f"/places/{swap['id']}", json={"event": {"is_meetup": False}})
    assert edited.json()["event"]["is_meetup"] is True
    assert joined.json()["comments_count"] == 1
    comments = (await client.get(f"{API}/places/{swap['id']}/comments")).json()
    assert [item["text"] for item in comments] == ["Принесу: книги и пазлы"]
    assert await _contributions(client, swap) == [("guest", "книги и пазлы", False)]

    # Later additions go through the same call; the same words are not posted twice.
    assert (await guest.put(_participation(swap), json={"note": "книги и пазлы"})).status_code == 200
    assert (await guest.put(_participation(swap), json={"note": "настолка"})).status_code == 200
    assert [text for _, text, _ in await _contributions(client, swap)] == ["книги и пазлы", "настолка"]

    # A comment written by hand in the same form counts too, but only from a participant.
    await other.post(f"/places/{swap['id']}/comments", json={"text": "Принесу: самокат"})
    assert len(await _contributions(client, swap)) == 2
    await other.put(_participation(swap))
    assert [name for name, _, _ in await _contributions(client, swap)] == ["guest", "guest", "other"]

    # Leaving takes the person's things off the list; their comments stay in the discussion.
    await guest.delete(_participation(swap))
    assert [name for name, _, _ in await _contributions(client, swap)] == ["other"]
    assert len((await client.get(f"{API}/places/{swap['id']}/comments")).json()) == 3


async def test_notes_are_refused_where_they_do_not_belong(world: World) -> None:
    author = await world.actor("author", reputation=20)
    guest = await world.actor("guest")
    closed = await _event(world, author, "swap", attributes={"bring_own": False})
    concert = await _event(world, author, "culture")

    refused = await guest.put(_participation(closed), json={"note": "книги"})
    assert refused.status_code == 422
    assert refused.json()["errors"][0] == {
        "field": "note",
        "message": "Организатор просит ничего с собой не приносить.",
    }
    assert (await guest.put(_participation(concert), json={"note": "цветы"})).status_code == 422

    swap = await _event(world, author, "swap")
    flagged = await guest.put(_participation(swap), json={"note": "ОТДАМ ВСЁ ЗА КОПЕЙКИ СРОЧНО ЗВОНИТЕ"})
    assert flagged.status_code == 422
    assert (await guest.get(f"/places/{swap['id']}")).json()["event"]["is_joined"] is False
    # Joining without a note needs no body at all.
    assert (await guest.put(_participation(closed))).json()["event"]["is_joined"] is True


async def test_a_held_note_is_seen_only_by_its_author(world: World, client: AsyncClient) -> None:
    author = await world.actor("author", reputation=20)
    guest = await world.actor("guest")
    swap = await _event(world, author, "swap")
    fake = world.enable_ai()
    fake.will_say("violation", 0.95, "offensive")

    assert (await guest.put(_participation(swap), json={"note": "кое-что"})).status_code == 200
    await world.ai_done()
    assert await _contributions(guest, swap) == [("guest", "кое-что", True)]
    assert await _contributions(client, swap) == []
    assert await _contributions(author, swap) == []
