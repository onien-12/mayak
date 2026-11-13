import pytest

from app.domain import gibberish


@pytest.mark.parametrize(
    "text",
    [
        "цукйцук",
        "фывапр",
        "asdfgh",
        "ывапвапр",
        "asdasd",
        "йцукен",
        "qwerty",
        "sdfsdf",
        "ЫВАПРОЛДЖ",
        "фыва",
        "ячсмит",
        "Тут цукйцук",
        "прлдвпжмстрн",
    ],
)
def test_keyboard_mashing_is_gibberish(text: str) -> None:
    assert gibberish.is_gibberish(text)


@pytest.mark.parametrize(
    "text",
    [
        "цукини",
        "ДВФУ",
        "ЖК",
        "Wi-Fi",
        "пр-т 100-летия Владивостока",
        "Эгершельд",
        "Чуркин",
        "Brooklyn",
        "ВДНХ",
        "СМИ",
        "ЛОР",
        "КПП",
        "МФЦ",
        "Про",
        "Туалет",
        "Пянсе у остановки Лазо",
        "Воркаут у школы 13",
        "Смотровая на сопке Орлиное Гнездо",
        "Апрель",
        "митинг",
        "Некрасовская",
        "проспект",
        "Фокино",
        "фуникулёр",
        "Samsung",
        "Starbucks",
        "rhythm",
        "Отличное место! фывапр, но вид хороший и тихо",
        "",
        "12:00–18:00",
    ],
)
def test_ordinary_words_are_not(text: str) -> None:
    assert not gibberish.is_gibberish(text)


def test_a_typed_over_tail_spoils_an_address() -> None:
    assert gibberish.address_is_mashed("Каторжная слободацукйцук")
    assert gibberish.address_is_mashed("Светланская ул., 33 фывапр")


@pytest.mark.parametrize(
    "address",
    [
        None,
        "",
        "Каторжная слобода",
        "ул. Светланская, 33",
        "пр-т 100-летия Владивостока, 52",
        "Русская ул., 46",
        "о. Русский, кампус ДВФУ, корпус A",
        "Эгершельд, ул. Верхнепортовая, 2",
        "Brooklyn st. 5",
    ],
)
def test_real_addresses_pass(address: str | None) -> None:
    assert not gibberish.address_is_mashed(address)
