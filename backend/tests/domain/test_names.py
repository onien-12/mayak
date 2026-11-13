"""Name similarity shared by the matchers that link our places to other catalogues."""

import pytest

from app.domain import names


@pytest.mark.parametrize(
    ("ours", "theirs", "similar"),
    [
        ("Приморский океанариум", "Приморский океанариум", True),
        ("Океанариум", "Приморский океанариум", True),
        ("Нагорный парк", "Нагорный парк культуры", True),
        ("Маяк Токаревского", "Токаревский маяк", True),
        ("Сопка Орлиное Гнездо", "Орлиное гнездо", True),
        ("Мост через бухту Золотой Рог", "Золотой мост", True),
        ("Площадь Борцов Революции", "Площадь Борцов Революции (Владивосток)", True),
        ("В.И. Ленину", "Памятник Ленину (Владивосток)", True),
        ("Форт №7", "Форт 7", True),
        ("Парк Победы", "Сквер Победы", False),
        ("Покровский парк", "Покровский собор", False),
        ("Нагорный парк", "Пиццерия Додо", False),
        ("Арка любви", "Галерея современного искусства Арка", False),
        ("Смотровая площадка", "Смотровая Нагорного парка", False),
        ("", "Пиццерия Додо", False),
    ],
)
def test_similar_names(ours: str, theirs: str, similar: bool) -> None:
    assert names.similar_names(ours, theirs) is similar
    assert names.similar_names(theirs, ours) is similar


def test_kind_words_carry_no_identity() -> None:
    assert names.kinds("Смотровая площадка Нагорного парка") == {"смотров", "площад", "парк"}
    assert names.distinctive_stems("Смотровая площадка Нагорного парка") == {"нагор"}
    assert names.distinctive_stems("«Арка» — №1, ул. Ёлочная") == {"арка", "1", "елочн"}


def test_a_name_made_only_of_kinds_is_a_weak_signal() -> None:
    assert names.same_kind_only("Смотровая площадка", "Смотровая Нагорного парка")
    assert not names.same_kind_only("Смотровая площадка", "Пляж")
    assert not names.same_kind_only("Нагорный парк", "Покровский парк"), "both have distinctive words"


def test_same_name_ignores_spelling() -> None:
    assert names.same_name("Приморский океанариум", "приморский  Океанариум")
    assert not names.same_name("Смотровая Нагорного парка", "Нагорный парк")


@pytest.mark.parametrize(
    ("whole", "name", "expected"),
    [
        ("Нагорный парк", "Нагорный парк", True),
        ("Нагорный парк", "Нагорный парк культуры", True),
        ("Нагорный парк", "Смотровая площадка Нагорного парка", False),
        ("Спортивная набережная", "Набережная Спортивной гавани", True),
        ("Миллионка", "Исторический квартал Миллионка", True),
        ("Миллионка", "Ресторан Миллионка", False),
    ],
)
def test_a_name_of_the_whole_is_not_a_name_of_its_part(whole: str, name: str, expected: bool) -> None:
    assert names.names_the_whole(whole, name) is expected
