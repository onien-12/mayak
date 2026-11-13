import pytest

from app.domain import content_check as cc


def test_clean_text_has_no_flags() -> None:
    assert cc.text_flags("Туалет на набережной", "Чисто, работает до 22:00. Сайт: https://example.org") == []


def test_none_and_empty_pieces_are_ignored() -> None:
    assert cc.text_flags(None, "", "Обычный текст") == []


def test_more_than_two_links() -> None:
    two = "https://a.ru и https://b.ru"
    assert cc.text_flags(two) == []
    assert cc.text_flags(f"{two} и www.c.ru") == [cc.FLAG_TOO_MANY_LINKS]


@pytest.mark.parametrize("text", ["Запись: https://bit.ly/abc", "clck.ru/xyz", "смотри T.CO/q"])
def test_link_shorteners(text: str) -> None:
    assert cc.FLAG_LINK_SHORTENER in cc.text_flags(text)


def test_shortener_host_inside_another_domain_is_not_flagged() -> None:
    assert cc.text_flags("Расписание на sport.com/events") == []


@pytest.mark.parametrize(
    "text", ["какая-то хуйня", "Вот бляди", "ёбаный фонарь", "сука", "да похуй", "пиздец"]
)
def test_profanity_is_recognised_but_never_flagged(text: str) -> None:
    assert cc.has_profanity(text)
    assert cc.text_flags(text) == []


@pytest.mark.parametrize(
    "text",
    [
        "Небанальный маршрут",
        "Застрахуйте багаж",
        "Барсука видели на тропе",
        "Колебаться не стоит",
        "Нельзя употреблять",
    ],
)
def test_innocent_words_are_not_profanity(text: str) -> None:
    assert not cc.has_profanity(text)
    assert cc.mask_profanity(text) == text


@pytest.mark.parametrize(
    ("text", "masked"),
    [
        ("хуй", "х*й"),
        ("Пиздец, опять яма", "П****ц, опять яма"),
        ("да похуй", "да п***й"),
        ("ЁБАНЫЙ фонарь", "Ё****Й фонарь"),
        ("сука!", "с**а!"),
        ("Застрахуйте багаж, блядь", "Застрахуйте багаж, б***ь"),
        ("", ""),
    ],
)
def test_masking_keeps_first_and_last_letter(text: str, masked: str) -> None:
    assert cc.mask_profanity(text) == masked
    assert cc.mask_profanity(masked) == masked


def test_shouting_needs_twenty_letters_and_seventy_percent_caps() -> None:
    assert cc.text_flags("ВНИМАНИЕ") == []
    assert cc.text_flags("ЛУЧШИЕ ЦЕНЫ ТОЛЬКО У НАС СЕГОДНЯ") == [cc.FLAG_SHOUTING]
    assert cc.text_flags("Лучшие цены только у нас сегодня и ВСЕГДА") == []


def test_shouting_title_is_flagged_despite_a_calm_description() -> None:
    assert cc.text_flags("СРОЧНО КУПИТЕ БИЛЕТЫ ПРЯМО СЕЙЧАС", "Обычное спокойное описание места.") == [
        cc.FLAG_SHOUTING
    ]


def test_long_character_repeats() -> None:
    assert cc.text_flags("Круто!!!!!") == []
    assert cc.text_flags("Круто!!!!!!") == [cc.FLAG_CHAR_REPEAT]
    assert cc.text_flags("Даааааааа") == [cc.FLAG_CHAR_REPEAT]


def test_flags_are_combined_without_duplicates() -> None:
    flags = cc.text_flags("ДЕШЁВЫЕ ТУРЫ В КИТАЙ!!!!!!!", "ЗАПИСЬ ТУТ: https://clck.ru/tury")
    assert flags == [cc.FLAG_LINK_SHORTENER, cc.FLAG_SHOUTING, cc.FLAG_CHAR_REPEAT]


def test_title_normalisation_for_duplicates() -> None:
    assert cc.normalize_title("  Туалет   НА площади ") == "туалет на площади"
