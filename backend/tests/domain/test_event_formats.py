import pytest

from app.domain import event_formats


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Принесу: книги и пазлы", "книги и пазлы"),
        ("принесу:  самокат ", "самокат"),
        ("ПРИНЕСУ :чайник", "чайник"),
        ("Принесу:", None),
        ("Я принесу: книги", None),
        ("Во сколько начинаем?", None),
        ("Принесу книги", None),
    ],
)
def test_what_a_comment_says_is_brought(text: str, expected: str | None) -> None:
    assert event_formats.brought(text) == expected


def test_bring_comment_round_trips() -> None:
    assert event_formats.brought(event_formats.bring_comment("  детские вещи ")) == "детские вещи"


def test_fixed_fields_of_the_formats() -> None:
    assert event_formats.is_meetup("help", requested=False) is True
    assert event_formats.is_meetup("swap", requested=False) is True
    assert event_formats.is_meetup("culture", requested=False) is False
    assert event_formats.price("swap", 300) == 0
    assert event_formats.price("culture", 300) == 300
    assert event_formats.note_refusal("swap", {}) is None
    assert event_formats.note_refusal("swap", {"bring_own": False}) == event_formats.NOTHING_TO_BRING
    assert event_formats.note_refusal("help", {}) == event_formats.NOTE_NOT_ACCEPTED
    assert event_formats.join_refusal("help", "Свободных мест не осталось.") != "Свободных мест не осталось."
    assert event_formats.join_refusal("sport", "Свободных мест не осталось.") == "Свободных мест не осталось."
