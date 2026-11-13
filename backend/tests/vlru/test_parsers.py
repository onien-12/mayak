from datetime import UTC, date, datetime, time, timedelta

import pytest

from app.domain.enums import OutageResource
from app.services.vlru import afisha_parser, outages_parser
from app.services.vlru.common import CITY_TZ

NOW = datetime(2026, 11, 11, 6, 0, tzinfo=UTC)


def _local(*args: int) -> datetime:
    return datetime(*args, tzinfo=CITY_TZ)


def test_listing_yields_unique_events_with_their_categories(listing_html: str) -> None:
    cards = afisha_parser.parse_listing(listing_html)
    assert len(cards) == 8
    assert len({card.event_id for card in cards}) == 8
    assert (cards[0].event_id, cards[0].category_slug) == (254302, "concert")
    assert {card.category_slug for card in cards} == {"concert", "standup", "exhibition"}
    assert afisha_parser.parse_listing("<html><body><p>Ничего нет</p></body></html>") == []


@pytest.mark.parametrize(
    ("source_slug", "category"),
    [
        ("concert", "culture"),
        ("theatre", "culture"),
        ("exhibition", "culture"),
        ("city-event", "city"),
        ("child", "city"),
        ("extreme", "sport"),
        ("masterclasses", "education"),
        ("tours", "education"),
        ("standup", "entertainment"),
        ("quest", "entertainment"),
        ("something-new", "entertainment"),
        (None, "entertainment"),
    ],
)
def test_category_mapping(source_slug: str | None, category: str) -> None:
    assert afisha_parser.map_category(source_slug) == category


def test_multi_day_event_page(multi_day_event_html: str) -> None:
    event = afisha_parser.parse_event(multi_day_event_html)
    assert event is not None
    assert event.title == "Мороза Дом"
    assert (event.start_date, event.end_date) == (date(2026, 12, 18), date(2027, 1, 10))
    assert [(session.day, session.start) for session in event.sessions[:2]] == [
        (date(2026, 12, 18), time(11, 0)),
        (date(2026, 12, 18), time(17, 0)),
    ]
    assert (event.venue, event.address) == ("Рублино", "ул. Адмирала Угрюмова, 48/49")
    assert (event.lat, event.lng) == (43.202666, 132.099197)
    assert event.image_url == "https://static.vl.ru/afisha/1730083607133_big"
    assert event.age_limit == 0
    assert (event.price, event.price_note) == (7900, "7900 ₽")
    assert event.description.startswith("«Мороз Дом» – волшебный формат")
    assert "<" not in event.description
    assert len(event.description) <= afisha_parser.MAX_DESCRIPTION_LENGTH

    window = afisha_parser.event_window(event, NOW)
    assert window == (_local(2026, 12, 18, 11, 0), _local(2027, 1, 10, 23, 59))
    after_first_day = afisha_parser.event_window(event, _local(2026, 12, 18, 12, 0))
    assert after_first_day is not None
    assert after_first_day[0] == _local(2026, 12, 18, 17, 0)
    assert afisha_parser.event_window(event, _local(2027, 1, 11, 9, 0)) is None


def test_single_session_event_page(single_event_html: str) -> None:
    event = afisha_parser.parse_event(single_event_html)
    assert event is not None
    assert event.start_date == event.end_date == date(2026, 11, 27)
    assert (event.price, event.price_note) == (1200, "от 1200 до 1800 ₽")
    assert event.age_limit == 6
    assert event.lat is not None
    starts_at, ends_at = afisha_parser.event_window(event, NOW)
    assert starts_at == _local(2026, 11, 27, 19, 0)
    assert ends_at - starts_at == timedelta(hours=2)
    assert afisha_parser.event_window(event, _local(2026, 11, 27, 21, 30)) is None


def test_event_page_gaps_are_tolerated() -> None:
    html = """<html><body>
    <script type="application/ld+json">{"@type":"Event","name":"Выставка","startDate":"2026-11-20","endDate":"2026-11-20"}</script>
    <script>window.EVENT_LOCATION = { locations: [{"title": "<img src=x onerror=alert(1)>", "latitude": "nope"}] };</script>
    <div class="event-header__price-and-conditions"><strong>Вход свободный</strong></div>
    </body></html>"""
    event = afisha_parser.parse_event(html)
    assert event is not None
    assert (event.lat, event.lng, event.sessions, event.age_limit, event.image_url) == (
        None,
        None,
        (),
        None,
        None,
    )
    assert (event.price, event.price_note) == (0, None)
    assert afisha_parser.event_window(event, NOW) == (_local(2026, 11, 20, 0, 0), _local(2026, 11, 20, 2, 0))


@pytest.mark.parametrize(
    "html",
    [
        "",
        "<html><body>нет данных</body></html>",
        '<script type="application/ld+json">{broken</script>',
        '<script type="application/ld+json">{"@type":"Event","name":"","startDate":"2026-11-20"}</script>',
        '<script type="application/ld+json">{"@type":"Event","name":"X","startDate":"вчера"}</script>',
        '<script type="application/ld+json">{"@type":"Person","name":"X"}</script>',
    ],
)
def test_pages_without_a_usable_event_are_rejected(html: str) -> None:
    assert afisha_parser.parse_event(html) is None


def test_outage_map(outage_map_html: str) -> None:
    outage_map = outages_parser.parse_map(outage_map_html)
    assert outage_map is not None
    assert set(outage_map.blackouts) == {"169611", "169683"}
    assert outage_map.blackouts["169611"].resource is OutageResource.COLD_WATER
    assert (
        outage_map.blackouts["169683"].description
        == "Ведутся аварийные ремонтные работы на сети водоснабжения"
    )
    assert len(outage_map.buildings) == 43
    first = outage_map.buildings[0]
    assert first.house.address == "Тухачевского ул. 24"
    assert (round(first.house.lat, 4), round(first.house.lng, 4)) == (43.1575, 131.9307)
    assert first.blackout_numbers == ("169611",)


@pytest.mark.parametrize(
    "html",
    ["", "<html></html>", '<script class="map-config" type="application/json">{"data": "not json"}</script>'],
)
def test_unreadable_outage_map(html: str) -> None:
    assert outages_parser.parse_map(html) is None


def test_outage_map_skips_malformed_entries() -> None:
    html = (
        '<script class="map-config" type="application/json">{"data": "{'
        '\\"blackouts\\": {\\"1\\": {\\"type\\": \\"gas\\"}, \\"2\\": {\\"type\\": \\"heat\\", \\"description\\": \\"d\\"}},'
        '\\"buildings\\": {\\"a\\": {\\"address\\": \\"Без координат 1\\", \\"blackouts\\": [2]},'
        '\\"b\\": {\\"address\\": \\"Русская ул. 2\\", \\"coordinates\\": [131.9, 43.1], \\"blackouts\\": [2]}}}"}</script>'
    )
    outage_map = outages_parser.parse_map(html)
    assert outage_map is not None
    assert list(outage_map.blackouts) == ["2"]
    assert [building.house.address for building in outage_map.buildings] == ["Русская ул. 2"]


def test_blackout_list(blackouts_html: str) -> None:
    outages = {outage.number: outage for outage in outages_parser.parse_blackouts(blackouts_html, NOW)}
    assert len(outages) == 8

    open_ended = outages["169689"]
    assert open_ended.resource is OutageResource.ELECTRICITY
    assert (open_ended.starts_at, open_ended.ends_at) == (_local(2026, 11, 11, 15, 16), None)
    assert open_ended.initiator == "АО ВПЭС (электрические сети)"
    assert open_ended.complaints_count == 3
    assert open_ended.description == "Ведутся аварийные ремонтные работы на сети электроснабжения"

    planned = outages["169684"]
    assert (planned.starts_at, planned.ends_at) == (_local(2026, 11, 11, 12, 23), _local(2026, 11, 11, 14, 0))
    assert planned.initiator is None
    assert planned.complaints_count == 19
    assert outages["169688"].resource is OutageResource.HEAT
    assert outages["169683"].initiator == "КГУП «Приморский водоканал»"


def test_period_parsing_and_year_rollover() -> None:
    assert outages_parser.parse_period("11 ноя. 12:23 — 11 ноя. 14:00", NOW) == (
        _local(2026, 11, 11, 12, 23),
        _local(2026, 11, 11, 14, 0),
    )
    assert outages_parser.parse_period(" 11 ноя. 15:16 ", NOW) == (_local(2026, 11, 11, 15, 16), None)

    new_year = _local(2027, 1, 2, 9, 0)
    started_last_year = outages_parser.parse_period("30 дек. 22:10 — 3 янв. 18:00", new_year)
    assert started_last_year == (_local(2026, 12, 30, 22, 10), _local(2027, 1, 3, 18, 0))

    new_year_eve = _local(2026, 12, 31, 20, 0)
    ends_next_year = outages_parser.parse_period("31 дек. 19:00 — 1 янв. 02:00", new_year_eve)
    assert ends_next_year == (_local(2026, 12, 31, 19, 0), _local(2027, 1, 1, 2, 0))

    assert outages_parser.parse_period("скоро", NOW) == (None, None)
    assert outages_parser.parse_period("", NOW) == (None, None)
