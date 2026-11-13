"""Wikivoyage listings: the wikitext parser and the pure decisions, on trimmed real articles."""

from pathlib import Path

import pytest

from app.domain.geo import parse_south_west_north_east
from app.services.wikivoyage import normaliser, parser
from app.services.wikivoyage.normaliser import Role
from app.services.wikivoyage.parser import Listing

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "wikivoyage"
BBOX = parse_south_west_north_east("42.95,131.80,43.25,132.05")


def listings(name: str, article: str) -> list[Listing]:
    return parser.parse_listings(article, (FIXTURES / name).read_text(encoding="utf-8"))


def by_name(items: list[Listing]) -> dict[str, Listing]:
    return {item.name: item for item in items}


def test_multi_line_listings_with_nested_templates_and_links() -> None:
    found = by_name(listings("vladivostok.wiki", "Владивосток"))
    station = found["Железнодорожный вокзал"]
    assert (station.kind, station.lat, station.lng, station.wikidata) == (
        "see",
        43.111242,
        131.881914,
        "Q567308",
    )
    assert station.image == "File:VladivostokStation.jpg"
    assert "Ярославском вокзале Москвы — западном конце Транссиба" in station.description, "[[link|label]]"
    assert "\n" in station.description, "<br> keeps the paragraph break"
    arch = found["Триумфальная арка"]
    assert (arch.alt, arch.address) == ("Николаевские триумфальные ворота", "ул. Петра Великого")
    museum = found["Военно-исторический музей Тихоокеанского флота (ТОФ)"]
    assert museum.hours == "Ср–Вс 10:00–18:00", "{{hours}} is rendered"
    canteen = found["Столовая №1"]
    assert canteen.hours == "Вс–Чт 7:00–1:00, Пт–Сб круглосуточно", "entities and several templates"
    assert "{{" not in str(found)
    assert "[[" not in str(found)


def test_one_line_listings_typos_and_comments() -> None:
    found = by_name(listings("vladivostok.wiki", "Владивосток"))
    nevelskoy = found["Памятник Г. И. Невельскому"]
    assert (nevelskoy.lat, nevelskoy.lng) == (None, None)
    assert nevelskoy.description == "Памятник российскому адмиралу является старейшим во Владивостоке."
    assert "Republic" not in found, "commented-out listings are ignored"
    republic = found["Republic на Светланской"]
    assert (republic.lat, republic.lng) == (43.11543, 131.90255), "`la=` / `lon=` typos are accepted"
    assert republic.hours == "Пн–Чт 9:00–23:00, Пт 9:00–24:00, Сб 10:00–24:00, Вс 10:00–23:00"
    assert found["Миллионка"].listing_id == "Q4293565"
    assert found["Крестовая сопка"].listing_id == parser.listing_id("Владивосток", "Крестовая сопка", None)
    assert found["Крестовая сопка"].listing_id.startswith("h")


@pytest.mark.parametrize(
    ("wikitext", "expected"),
    [
        ("Текст<ref>[http://example.com источник]</ref> дальше", "Текст дальше"),
        ("Он<ref name=a/> был", "Он был"),
        ("[[Файл:A.jpg|thumb|подпись с [[ссылкой]]]]Вид", "Вид"),
        ("См. [http://example.com сайт музея] и [https://x.ru]", "См. сайт музея и"),
        ("'''Жирный''' и ''курсив''", "Жирный и курсив"),
        ("<script>alert(1)</script>Текст", "alert(1)Текст"),
        ("{{lang|en|Hello}} мир {{нет закрытия", "мир нет закрытия"),
        ("А&nbsp;Б &amp; В", "А Б & В"),
    ],
)
def test_plain_text(wikitext: str, expected: str) -> None:
    assert parser.plain_text(wikitext, 500) == expected


def test_hours_template() -> None:
    render = parser.plain_text
    assert render("{{hours|||10|00|19}}", 100) == "ежедневно 10:00–19:00"
    assert render("{{hours|Сб||10||24}}", 100) == "Сб 10:00–24:00"
    assert render("{{hours|Пн|Пт|10}}", 100) == "", "without a closing time it says nothing"
    assert render("{{hours|Пн|Пт|99||10}}", 100) == ""


def test_categories_by_kind_and_keywords() -> None:
    found = by_name(listings("vladivostok.wiki", "Владивосток"))
    assert normaliser.category_for(found["Железнодорожный вокзал"]) == "architecture"
    assert normaliser.category_for(found["Триумфальная арка"]) == "historic"
    assert normaliser.category_for(found["Крестовая сопка"]) == "nature"
    assert normaliser.category_for(found["Бухта Золотой рог"]) == "nature"
    assert normaliser.category_for(found["Миллионка"]) == "unusual"
    assert normaliser.category_for(found["Приморский океанариум"]) == "culture_space"
    assert normaliser.category_for(found["Столовая №1"]) == "food"
    assert normaliser.category_for(found["See You Hostel"]) is None


def test_roles_create_only_described_located_open_listings() -> None:
    drafts = {
        draft.title: draft
        for draft in normaliser.normalise(listings("vladivostok.wiki", "Владивосток"), BBOX)
    }
    assert "Памятник Г. И. Невельскому" not in drafts, "no coordinates"
    assert "See You Hostel" not in drafts, "accommodation is not shown on the map"
    assert drafts["Миллионка"].role is Role.CREATE
    assert drafts["Миллионка"].description.startswith("В прошлом"), "capitalised"
    assert drafts["Бухта Золотой рог"].role is Role.ENRICH, "no description"
    assert drafts["Приморский океанариум"].role is Role.ENRICH, "«Приморский Океанариум ДВО РАН» is too short"
    assert drafts["Ресторан «Орлиное Гнездо»"].role is Role.ENRICH, "on reconstruction"
    assert drafts["Столовая №1"].attributes == {"hours": "Вс–Чт 7:00–1:00, Пт–Сб круглосуточно"}
    assert (
        drafts["Миллионка"].url
        == "https://ru.wikivoyage.org/wiki/%D0%92%D0%BB%D0%B0%D0%B4%D0%B8%D0%B2%D0%BE%D1%81%D1%82%D0%BE%D0%BA"
    )


def test_copy_pasted_coordinates_and_points_outside_the_area_only_enrich() -> None:
    drafts = {
        draft.title: draft for draft in normaliser.normalise(listings("russky.wiki", "Остров Русский"), BBOX)
    }
    assert drafts["Ворошиловская батарея"].role is Role.CREATE
    assert drafts["Новосильцевская батарея"].role is Role.ENRICH, "43.57 is far north of the city"
    assert drafts["Мыс Тобизина"].role is Role.ENRICH, "just outside the service area"
    assert drafts["Русский мост"].role is Role.ENRICH, "shares its point with the university"
    assert drafts["Дальневосточный федеральный университет"].role is Role.ENRICH


def draft(title: str, category: str = "historic", alt: str = "") -> normaliser.ListingDraft:
    return normaliser.ListingDraft(
        external_id="wikivoyage:x",
        url="https://ru.wikivoyage.org/wiki/x",
        category=category,
        title=title,
        alt=alt,
        description="",
        lat=43.1,
        lng=131.9,
        address=None,
        attributes={},
        role=Role.CREATE,
        wikidata=None,
        image=None,
    )


def test_a_listing_describes_a_place_by_name_or_by_a_similar_name_close_by() -> None:
    match = normaliser.place_match
    assert match(draft("Сопка Бурачка", "nature"), "Сопка Бурачка", "viewpoint", 120) == 0, "same name, 120 m"
    assert match(draft("Сопка Бурачка", "nature"), "Сопка Бурачка", "viewpoint", 600) is None
    museum = draft(
        "Мемориальный дом-музей В.К. Арсеньева", "culture_space", alt="Дом путешественника Арсеньева"
    )
    assert match(museum, "В.К. Арсеньеву", "historic", 15) is None, "a museum is not the monument next door"
    assert match(museum, "Дом путешественника Арсеньева", "culture_space", 15) == 0, "by the alternative name"
    arch = draft("Триумфальная арка", alt="Николаевские триумфальные ворота")
    assert match(arch, "Николаевские ворота", "architecture", 50) == 1
    assert match(arch, "Николаевские ворота", "architecture", 90) is None


def test_a_listing_describes_an_area_it_lies_in_or_next_to() -> None:
    hill = draft("Сопка в Нагорном парке", "nature")
    assert normaliser.describes_area(hill, "Нагорный парк", False, 187, 93)
    assert not normaliser.describes_area(hill, "Нагорный парк", False, 400, 93)
    assert normaliser.describes_area(hill, "Нагорный парк", True, 900, 93)
    assert not normaliser.describes_area(hill, "Покровский парк", True, 0, 93)


def test_a_sight_described_by_two_articles_is_created_once() -> None:
    russky = listings("russky.wiki", "Остров Русский")
    city = [
        item for item in listings("vladivostok.wiki", "Владивосток") if item.name == "Приморский океанариум"
    ]
    drafts = {item.title: item for item in normaliser.normalise([*city, *russky], BBOX)}
    assert drafts["Приморский океанариум"].role is Role.ENRICH
    oceanarium = [
        item for item in normaliser.normalise([*russky, *city], BBOX) if item.title == "Приморский океанариум"
    ]
    assert [item.role for item in oceanarium] == [Role.CREATE, Role.ENRICH]
