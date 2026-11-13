"""A Commons photo belongs to an object only when something ties it to that object (SPEC §19).

The cases are real: what the first Wikimedia snapshot (2026-11-13) gave places by distance alone.
"""

import pytest

from app.domain import archive_photos
from app.domain.archive_photos import Tie
from app.domain.enums import PlaceStatus


@pytest.mark.parametrize(
    ("title", "file"),
    [
        ("Приморская сцена Мариинского театра", "File:Nissan Skyline Vladivostok.jpg"),
        ("Кампус ДВФУ и набережная бухты Аякс", "File:Emberiza spodocephala (Black-faced Bunting).jpg"),
        (
            "Музей истории Дальнего Востока им. Арсеньева",
            "File:Владимир Путин на встрече с руководителями регионов.jpg",
        ),
        ("Набережная Цесаревича", "File:Antarktida (1996).jpg"),
        ("Смотровая галерея Морского вокзала", "File:Vladivostok Training Ship PROFESSOR KHLYUSTIN.jpg"),
        ("Кафе Montmartre", "File:Гостиница «Централь» (Владивосток).jpg"),
        ("Чаёвня «Семь чашек»", "File:Жилой дом (Владивосток, Семеновская улица, 21).jpg"),
        ("Ларёк с пянсе у «Clover House»", "File:Доходный дом, ул. Мордовцева, 8 (Владивосток).jpg"),
        ("Столовая №1", "File:Здание театра и гостиницы «Тихий океан».jpg"),
        ("Здания городского полицейского управления", "File:Уборевича 9.jpg"),
        ("И. П. Уборевичу", "File:Дом, ул. Уборевича, 9.jpg"),
    ],
)
def test_a_photo_merely_nearby_is_not_of_the_object(title: str, file: str) -> None:
    assert not archive_photos.is_of_the_object(Tie.NEARBY, title, [file])
    assert not archive_photos.is_of_the_object(None, title, [file]), "an older row must name it too"


@pytest.mark.parametrize(
    ("title", "texts"),
    [
        ("Токаревский маяк", ["File:Tokarevsky lighthouse.jpg"]),
        ("Набережная Цесаревича", ["File:Tsesarevich Embankment Vladivostok.jpg"]),
        ("Музей «Владивостокская крепость»", ["File:IMG_2041.jpg", "", "Музей «Владивостокская крепость»"]),
        ("Арка любви", ["File:DSC 0001.jpg", "Арка любви на сопке Орлиное гнездо"]),
        ("Новосильцевская батарея", ["File:Novosiltsevskaya battery 2.jpg"]),
        ("Приморский океанариум", ["File:Primorskiy Oceanarium (October 2024)-0 3.jpg"]),
        ("остров Скрыплёва", ["File:Остров Скрыплёва 1.jpg"]),
    ],
)
def test_a_nearby_photo_that_names_the_object_is_kept(title: str, texts: list[str]) -> None:
    assert archive_photos.is_of_the_object(Tie.NEARBY, title, texts)


def test_the_objects_own_identity_ties_any_file() -> None:
    for tie in (Tie.NAMED, Tie.ITEM, Tie.ARTICLE, Tie.CATEGORY):
        assert archive_photos.is_of_the_object(tie, "Золотой мост", ["File:Vladivostok bridge.jpg"])
    assert not archive_photos.is_of_the_object(Tie.NEARBY, "Золотой мост", ["File:Vladivostok bridge.jpg"])


def test_the_city_alone_names_nothing() -> None:
    assert not archive_photos.names_the_object("Владивосток", ["File:Vladivostok 2019.jpg"])
    assert not archive_photos.names_the_object("Сквер", ["File:Сквер.jpg"]), "a kind word is no name"


@pytest.mark.parametrize(
    ("status", "title", "category", "receives"),
    [
        (PlaceStatus.VERIFIED, "Токаревский маяк", "Маяк", True),
        (PlaceStatus.ARCHIVED, "ДЕШЁВЫЕ ТУРЫ В ХУНЬЧУНЬ!!!!!!! ЗВОНИТЕ", "Турагентство", False),
        (PlaceStatus.PENDING, "Новая смотровая", "Видовая площадка", False),
        (PlaceStatus.HIDDEN, "Скрытое место", "Видовая площадка", False),
        (PlaceStatus.UNVERIFIED, "Детская площадка", "Детская площадка", False),
        (PlaceStatus.UNVERIFIED, "Скамейка", "Скамейки", False),
    ],
)
def test_only_public_named_places_receive_archive_photos(
    status: PlaceStatus, title: str, category: str, receives: bool
) -> None:
    assert archive_photos.may_receive(status, title, category, ["Скамейка"]) is receives
