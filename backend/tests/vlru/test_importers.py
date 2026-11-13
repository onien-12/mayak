"""Importer lifecycle against an application database, with the saved pages as the source."""

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.domain.enums import OutageResource, UserRole
from app.domain.outages import House
from app.models import Notification
from app.services.vlru import afisha_importer, outages_importer
from app.services.vlru.client import VlRuClient
from app.services.vlru.outages_importer import Outage
from tests.conftest import API, World
from tests.vlru.conftest import FakeVlRuClient, fixture_text

MULTI_DAY_ID = 254302
SINGLE_ID = 254292


def _afisha_client(listing_html: str, **events: str | None) -> FakeVlRuClient:
    pages: dict[str, str | None] = {"/afisha/vladivostok": listing_html}
    pages.update({f"/afisha/vladivostok/event/{event_id}": html for event_id, html in events.items()})
    return FakeVlRuClient(pages)


async def _import_afisha(world: World, client: FakeVlRuClient) -> afisha_importer.AfishaReport:
    async with world.session() as session:
        return await afisha_importer.run_import(session, client, datetime.now(UTC))  # type: ignore[arg-type]


async def test_afisha_import_creates_verified_external_events(
    world: World, client: AsyncClient, listing_html: str, multi_day_event_html: str, single_event_html: str
) -> None:
    source = _afisha_client(
        listing_html, **{str(MULTI_DAY_ID): multi_day_event_html, str(SINGLE_ID): single_event_html}
    )
    report = await _import_afisha(world, source)
    assert (report.found, report.created, report.updated, report.failed_pages) == (8, 2, 0, 6 + 8)
    assert source.requests[0] == "/afisha/vladivostok"
    assert not any("page=" in request for request in source.requests)

    events = (await client.get(f"{API}/events")).json()
    assert [event["title"] for event in events] == [
        "Вокально-инструментальный дуэт «Любитель». Программа «Формы любви»",
        "Мороза Дом",
    ]
    single, multi = events
    assert (single["status"], multi["status"]) == ("verified", "verified")
    assert single["trust_score"] >= 70
    assert single["external"] == {
        "source": "vl_ru",
        "label": "Афиша VL.ru",
        "url": f"https://www.vl.ru/afisha/vladivostok/event/{SINGLE_ID}",
    }
    assert single["cover_url"] == "https://static.vl.ru/afisha/1792725454643_big"
    assert (single["event"]["price"], single["event"]["price_note"]) == (1200, "от 1200 до 1800 ₽")
    assert single["event"]["starts_at"] == "2026-11-27T09:00:00Z"
    assert single["event"]["ends_at"] == "2026-11-27T11:00:00Z"
    assert (multi["event"]["starts_at"], multi["event"]["ends_at"]) == (
        "2026-12-18T01:00:00Z",
        "2027-01-10T13:59:00Z",
    )

    detail = (await client.get(f"{API}/places/{single['id']}")).json()
    assert detail["author"]["display_name"] == "Афиша VL.ru"
    assert detail["description"].endswith(
        f"Подробнее: https://www.vl.ru/afisha/vladivostok/event/{SINGLE_ID}"
    )
    assert detail["event"]["registration_url"] == single["external"]["url"]
    assert (detail["event"]["age_limit"], detail["event"]["capacity"], detail["photos"]) == (6, None, [])
    assert detail["category"]["slug"] == "culture"

    assert len((await client.get(f"{API}/events", params={"origin": "external"})).json()) == 2
    assert (await client.get(f"{API}/events", params={"origin": "community"})).json() == []
    assert len((await client.get(f"{API}/places", params={"origin": "external"})).json()) == 2
    assert (await client.get(f"{API}/places", params={"origin": "community"})).json() == []
    assert (await client.get(f"{API}/events", params={"free": "true"})).json() == []
    assert (await client.get(f"{API}/users/top")).json() == []
    assert (await client.get(f"{API}/stats")).json()["totals"]["users"] == 0


async def test_system_author_cannot_log_in_and_earns_nothing(
    world: World, client: AsyncClient, listing_html: str, single_event_html: str
) -> None:
    await _import_afisha(world, _afisha_client(listing_html, **{str(SINGLE_ID): single_event_html}))
    login = await client.post(f"{API}/auth/login", json={"email": "afisha@mayak-vl.ru", "password": "!"})
    assert login.status_code == 401

    event = (await client.get(f"{API}/events")).json()[0]
    guest = await world.actor("guest", reputation=20)
    joined = await guest.put(f"/places/{event['id']}/event/participation")
    assert joined.status_code == 200
    assert joined.json()["event"]["participants_count"] == 1
    await guest.post(f"/places/{event['id']}/comments", json={"text": "Кто идёт?"})
    after_vote = await world.vote(guest, event["id"], "present")
    assert after_vote["status"] == "verified"

    author = (await client.get(f"{API}/users/{event['author_id']}")).json()
    assert author["reputation"] == 0
    async with world.session() as session:
        notices = await session.scalar(
            select(func.count()).select_from(Notification).where(Notification.user_id == event["author_id"])
        )
    assert notices == 0


async def test_afisha_reimport_is_idempotent_and_respects_local_edits(
    world: World, client: AsyncClient, listing_html: str, single_event_html: str
) -> None:
    source = _afisha_client(listing_html, **{str(SINGLE_ID): single_event_html})
    await _import_afisha(world, source)
    event = (await client.get(f"{API}/events")).json()[0]
    guest = await world.actor("guest")
    await guest.put(f"/places/{event['id']}/event/participation")

    moved = single_event_html.replace("19:00", "20:30").replace("от 1200 до 1800", "1500")
    report = await _import_afisha(world, _afisha_client(listing_html, **{str(SINGLE_ID): moved}))
    assert (report.created, report.updated) == (0, 1)
    events = (await client.get(f"{API}/events")).json()
    assert len(events) == 1
    assert events[0]["event"]["starts_at"] == "2026-11-27T10:30:00Z"
    assert (events[0]["event"]["price"], events[0]["event"]["price_note"]) == (1500, "1500 ₽")
    assert [item["kind"] for item in (await guest.get("/notifications")).json()] == ["event_changed"]

    moderator = await world.actor("moderator", role=UserRole.MODERATOR)
    edited = await moderator.patch(f"/places/{event['id']}", json={"title": "Дуэт «Любитель» (уточнено)"})
    assert edited.status_code == 200
    report = await _import_afisha(world, source)
    assert (report.updated, report.kept_local_edits) == (0, 1)
    kept = (await client.get(f"{API}/events")).json()[0]
    assert kept["title"] == "Дуэт «Любитель» (уточнено)"
    assert kept["event"]["starts_at"] == "2026-11-27T10:30:00Z"


async def test_afisha_import_reports_gaps_and_skips_finished(
    world: World, client: AsyncClient, listing_html: str, single_event_html: str, multi_day_event_html: str
) -> None:
    no_coordinates = single_event_html.replace("window.EVENT_LOCATION", "window.SOMETHING_ELSE")
    source = _afisha_client(
        listing_html, **{str(SINGLE_ID): no_coordinates, str(MULTI_DAY_ID): multi_day_event_html}
    )
    world.clock.shift(timedelta(days=90))
    report = await _import_afisha(world, source)
    assert (report.created, report.finished, report.without_coordinates) == (0, 2, [])

    world.clock.shift(timedelta(days=-90))
    report = await _import_afisha(world, source)
    assert report.without_coordinates == [SINGLE_ID]
    assert report.created == 1
    assert report.summary()["without_coordinates"] == 1
    assert len((await client.get(f"{API}/events")).json()) == 1


def _outage(number: str, resource: OutageResource, houses: tuple[House, ...], **extra: Any) -> Outage:
    return Outage(number=number, resource=resource, description="Ремонт на сети", houses=houses, **extra)


RUSSKAYA_46 = House("Русская ул. 46", 43.16668, 131.91284)
WATER = _outage(
    "900101",
    OutageResource.COLD_WATER,
    (
        House("Тухачевского ул. 24", 43.1575, 131.9307),
        House("Тухачевского ул. 26", 43.1581, 131.9312),
        RUSSKAYA_46,
    ),
    initiator="Водоканал",
    complaints_count=7,
)
POWER = _outage("900102", OutageResource.ELECTRICITY, (RUSSKAYA_46,))


async def _apply(world: World, current: list[Outage]) -> outages_importer.OutagesReport:
    async with world.session() as session:
        report = await outages_importer.apply_outages(session, current, datetime.now(UTC))
        await session.commit()
        return report


async def test_outages_upsert_and_resolve_lifecycle(world: World, client: AsyncClient) -> None:
    started = datetime.now(UTC) - timedelta(hours=2)
    report = await _apply(
        world,
        [
            _outage(WATER.number, WATER.resource, WATER.houses, initiator="Водоканал", starts_at=started),
            POWER,
        ],
    )
    assert (report.outages, report.houses, report.created, report.resolved) == (2, 3, 2, 0)
    assert report.without_schedule == ("900102",)

    cards = {card["issue"]["outage"]["number"]: card for card in (await client.get(f"{API}/places")).json()}
    water, power = cards["900101"], cards["900102"]
    assert water["title"] == "Нет холодной воды: Тухачевского ул., Русская ул."
    assert (water["status"], water["layer"]) == ("verified", "issue")
    assert water["external"]["source"] == "vl_ru_off"
    assert water["external"]["url"] == "https://www.vl.ru/off/blackout/900101.html"
    assert water["issue"] == {
        "stage": "in_progress",
        "severity": "low",
        "radius_m": water["issue"]["radius_m"],
        "source": "official",
        "outage": {
            "number": "900101",
            "resource": "cold_water",
            "buildings_count": 3,
            "complaints_count": 0,
            "started_at": started.isoformat().replace("+00:00", "Z"),
            "planned_end_at": None,
            "organization": "Водоканал",
        },
    }
    assert 60 <= water["issue"]["radius_m"] <= 3000
    assert (power["issue"]["stage"], power["issue"]["source"], power["issue"]["radius_m"]) == (
        "confirmed",
        "user",
        60,
    )
    assert (power["lat"], power["lng"]) == (RUSSKAYA_46.lat, RUSSKAYA_46.lng)
    assert (power["issue"]["outage"]["organization"], power["issue"]["outage"]["planned_end_at"]) == (
        None,
        None,
    )

    detail = (await client.get(f"{API}/places/{water['id']}")).json()
    assert [house["address"] for house in detail["issue"]["outage_buildings"]] == [
        "Русская ул. 46",
        "Тухачевского ул. 24",
        "Тухачевского ул. 26",
    ]
    assert detail["issue"]["responsible_org"] == "Водоканал"
    assert detail["attributes"] == {"service": "cold_water"}
    assert detail["author"]["display_name"] == "Отключения VL.ru"

    voter = await world.actor("voter", reputation=200)
    second = await world.actor("second", reputation=200)
    for user in (voter, second):
        assert (await world.vote(user, water["id"], "absent"))["issue"]["stage"] == "in_progress"

    report = await _apply(world, [WATER])
    assert (report.created, report.updated, report.resolved) == (0, 1, 1)
    remaining = (await client.get(f"{API}/places")).json()
    assert [card["id"] for card in remaining] == [water["id"]]
    assert remaining[0]["issue"]["outage"]["complaints_count"] == 7
    resolved = (await client.get(f"{API}/places/{power['id']}")).json()
    assert resolved["issue"]["stage"] == "resolved"
    assert resolved["issue"]["resolved_at"] is not None

    report = await _apply(world, [WATER, POWER])
    assert (report.created, report.updated) == (0, 2)
    assert len((await client.get(f"{API}/places")).json()) == 2
    assert (await client.get(f"{API}/places/{power['id']}")).json()["issue"]["stage"] == "confirmed"
    kinds = [item["kind"] for item in (await voter.get("/notifications")).json()]
    assert kinds == []


async def test_outage_endpoints(world: World, client: AsyncClient) -> None:
    empty = (await client.get(f"{API}/outages/summary")).json()
    assert (empty["updated_at"], empty["totals"]) == (None, {"outages": 0, "buildings": 0})
    assert [item["resource"] for item in empty["by_resource"]] == [
        "cold_water",
        "hot_water",
        "heat",
        "electricity",
    ]

    await _apply(world, [WATER, POWER])
    summary = (await client.get(f"{API}/outages/summary")).json()
    assert summary["updated_at"] is None
    assert summary["source_url"] == "https://www.vl.ru/off/"
    assert summary["totals"] == {"outages": 2, "buildings": 3}
    by_resource = {item["resource"]: (item["outages"], item["buildings"]) for item in summary["by_resource"]}
    assert by_resource == {"cold_water": (1, 3), "hot_water": (0, 0), "heat": (0, 0), "electricity": (1, 1)}

    everywhere = "131.80,43.00,132.10,43.30"
    points = (await client.get(f"{API}/outages/buildings", params={"bbox": everywhere})).json()
    assert len(points) == 3
    shared = next(point for point in points if point["address"] == "Русская ул. 46")
    assert sorted(shared["resources"]) == ["cold_water", "electricity"]
    assert len(shared["place_ids"]) == 2
    power_only = (
        await client.get(f"{API}/outages/buildings", params={"bbox": everywhere, "resource": "electricity"})
    ).json()
    assert [(point["address"], point["resources"]) for point in power_only] == [
        ("Русская ул. 46", ["electricity"])
    ]
    nearby = (
        await client.get(f"{API}/outages/buildings", params={"bbox": "131.92,43.15,131.94,43.16"})
    ).json()
    assert {point["address"] for point in nearby} == {"Тухачевского ул. 24", "Тухачевского ул. 26"}
    assert (await client.get(f"{API}/outages/buildings")).status_code == 422
    assert (
        await client.get(f"{API}/outages/buildings", params={"bbox": everywhere, "resource": "gas"})
    ).status_code == 422

    async def check(query: str) -> list[dict[str, Any]]:
        response = await client.get(f"{API}/outages/check", params={"q": query})
        assert response.status_code == 200, response.text
        return response.json()

    exact = await check("тухачевского 24")
    assert [(match["address"], len(match["outages"])) for match in exact] == [("Тухачевского ул. 24", 1)]
    assert exact[0]["outages"][0]["issue"]["outage"]["resource"] == "cold_water"
    assert [match["address"] for match in await check("ул. Тухачевского, д. 26")] == ["Тухачевского ул. 26"]
    assert len(await check("тухач")) == 2
    assert await check("тухачевского 2") == []
    both = await check("Русская 46")
    assert len(both) == 1
    assert {card["issue"]["outage"]["resource"] for card in both[0]["outages"]} == {
        "cold_water",
        "electricity",
    }
    assert await check("светланская 1") == []
    assert await check("") == []
    assert await check("ул. д.") == []

    await _apply(world, [])
    assert (await client.get(f"{API}/outages/summary")).json()["totals"] == {"outages": 0, "buildings": 0}
    assert await check("тухачевского 24") == []
    assert (await client.get(f"{API}/outages/buildings", params={"bbox": everywhere})).json() == []


async def test_address_check_matches_street_by_prefix_and_house_number_exactly(
    world: World, client: AsyncClient
) -> None:
    houses = (
        House("Некрасовская ул. 5", 43.1200, 131.9050),
        House("Некрасовская ул. 53", 43.1215, 131.9075),
        House("Некрасовский пер. 5", 43.1230, 131.9090),
    )
    await _apply(world, [_outage("900201", OutageResource.HEAT, houses)])

    async def addresses(query: str) -> list[str]:
        response = await client.get(f"{API}/outages/check", params={"q": query})
        return sorted(match["address"] for match in response.json())

    assert await addresses("некрасовская 5") == ["Некрасовская ул. 5"]
    assert await addresses("некрасовская 53") == ["Некрасовская ул. 53"]
    assert await addresses("некрас") == ["Некрасовская ул. 5", "Некрасовская ул. 53", "Некрасовский пер. 5"]
    assert await addresses("некрас 5") == ["Некрасовская ул. 5", "Некрасовский пер. 5"]
    assert await addresses("Некрасовская улица, дом 53") == ["Некрасовская ул. 53"]
    assert await addresses("красовская 5") == []
    assert await addresses("некрасовская 3") == []


async def test_outages_import_from_saved_pages(world: World, client: AsyncClient) -> None:
    map_html = fixture_text("off_map.html")
    source = FakeVlRuClient(
        {
            "/off/summary/map?date=now": map_html,
            "/off/summary/blackouts?date=now": fixture_text("off_blackouts.html"),
        }
    )
    async with world.session() as session:
        report = await outages_importer.run_import(session, source, datetime.now(UTC))  # type: ignore[arg-type]
    assert report is not None
    assert (report.outages, report.houses, report.created) == (2, 43, 2)
    assert report.without_schedule == ("169611",)
    assert source.requests[0] == "/off/summary/map?date=now"
    assert sorted(source.requests[1:4]) == [
        "/off/summary/map?date=now&resourceType=electricity",
        "/off/summary/map?date=now&resourceType=heat",
        "/off/summary/map?date=now&resourceType=hot_water",
    ]
    assert not any(request.startswith(("/off/map/", "/off/blackout/")) for request in source.requests)
    assert (await client.get(f"{API}/outages/summary")).json()["updated_at"] is not None

    cards = {card["issue"]["outage"]["number"]: card for card in (await client.get(f"{API}/places")).json()}
    listed = cards["169683"]
    assert (listed["issue"]["stage"], listed["issue"]["source"]) == ("in_progress", "official")
    detail = (await client.get(f"{API}/places/{listed['id']}")).json()
    assert detail["issue"]["responsible_org"] == "КГУП «Приморский водоканал»"
    assert detail["issue"]["detected_at"] == "2026-11-11T01:53:00Z"
    assert detail["issue"]["outage"]["started_at"] == "2026-11-11T01:53:00Z"
    assert detail["issue"]["outage"]["organization"] == "КГУП «Приморский водоканал»"
    assert listed["issue"]["outage"] == detail["issue"]["outage"]
    assert cards["169611"]["issue"]["stage"] == "confirmed"

    unreadable = FakeVlRuClient({"/off/summary/map?date=now": "<html>maintenance</html>"})
    async with world.session() as session:
        assert await outages_importer.run_import(session, unreadable, datetime.now(UTC)) is None  # type: ignore[arg-type]
    assert len((await client.get(f"{API}/places")).json()) == 2


async def test_real_client_refuses_paths_disallowed_by_robots() -> None:
    real = VlRuClient()
    try:
        for path in ("/off/blackout/169689.html", "/off/map/x"):
            with pytest.raises(ValueError, match="robots"):
                await real.get(path)
        with pytest.raises(ValueError, match="robots"):
            await real.get("/afisha/vladivostok", {"page": "2"})
    finally:
        await real.aclose()
