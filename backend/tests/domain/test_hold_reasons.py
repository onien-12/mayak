import itertools

import pytest

from app.domain import ai_moderation, hold_reasons
from app.domain.ai_moderation import AiOpinion
from app.domain.enums import AiCategory, AiTarget, AiVerdict
from app.domain.hold_reasons import MANUAL_CHECK
from app.services import content
from app.services.ai_moderation import effects

FORBIDDEN = ("уверенность", "польза", "оценка автора", "модель", "0.", "из 100")


def _line(
    verdict: AiVerdict, confidence: float, *categories: AiCategory, usefulness: int | None = None
) -> str:
    opinion = AiOpinion(verdict, categories, confidence, "Сводка модели, которую автор не видит.", usefulness)
    return ai_moderation.describe(opinion, subject="Текст" if usefulness is not None else "Фото 2")


@pytest.mark.parametrize(
    ("line", "target", "told"),
    [
        (
            _line(AiVerdict.VIOLATION, 0.93, AiCategory.NONSENSE, usefulness=60),
            AiTarget.PLACE,
            "Текст: бессмыслица",
        ),
        (
            _line(AiVerdict.VIOLATION, 0.93, AiCategory.ADS, AiCategory.SPAM, usefulness=4),
            AiTarget.PLACE,
            "Текст: реклама, спам, слишком мало сведений о месте",
        ),
        (_line(AiVerdict.OK, 0.9, usefulness=4), AiTarget.PLACE, "Текст: слишком мало сведений о месте"),
        (
            _line(AiVerdict.OK, 0.9, AiCategory.SPAM, usefulness=4),
            AiTarget.PLACE,
            "Текст: слишком мало сведений о месте",
        ),
        (
            _line(AiVerdict.SUSPICIOUS, 0.6, AiCategory.FRAUD, usefulness=60),
            AiTarget.ROUTE,
            "Текст: мошенничество",
        ),
        (
            _line(AiVerdict.VIOLATION, 0.9, usefulness=60),
            AiTarget.COMMENT,
            "Текст: возможное нарушение правил",
        ),
        (
            _line(AiVerdict.VIOLATION, 0.8, AiCategory.OFFENSIVE, usefulness=3),
            AiTarget.COMMENT,
            "Текст: оскорбления",
        ),
        (_line(AiVerdict.VIOLATION, 0.95, AiCategory.NOT_A_PLACE), AiTarget.PLACE, "Фото 2: не про место"),
        (_line(AiVerdict.SUSPICIOUS, 0.2, AiCategory.NUDITY), AiTarget.PHOTO, "Фото 2: нагота"),
        (_line(AiVerdict.OK, 0.3), AiTarget.PHOTO, "Фото 2: нужна ручная проверка модератора"),
        (
            hold_reasons.GIBBERISH.format(label="название"),
            AiTarget.PLACE,
            "Похоже на случайный набор букв: название",
        ),
    ],
)
def test_the_author_reads_what_was_found_and_where(line: str, target: AiTarget, told: str) -> None:
    assert hold_reasons.for_author([line], target) == [told]


@pytest.mark.parametrize(
    "line",
    [
        _line(AiVerdict.SUSPICIOUS, 0.3, AiCategory.ADS, usefulness=60),
        _line(AiVerdict.SUSPICIOUS, 0.59, usefulness=60),
        hold_reasons.UNCHECKED_TEXT,
        hold_reasons.UNCHECKED_PHOTO.format(index=3),
    ],
)
def test_a_hold_only_the_standing_caused_reads_as_a_plain_manual_check(line: str) -> None:
    """Doubt below the hold threshold and an unavailable model hold only a low-standing author."""
    assert hold_reasons.for_author([line], AiTarget.PLACE) == [MANUAL_CHECK]


def test_unknown_lines_are_a_manual_check_and_repeats_are_dropped() -> None:
    assert hold_reasons.author_line("Что-то новое: 0.97", rates_usefulness=True) is None
    lines = [
        "Что-то новое",
        hold_reasons.UNCHECKED_TEXT,
        _line(AiVerdict.VIOLATION, 0.9, AiCategory.NOT_A_PLACE),
    ]
    assert hold_reasons.for_author(lines, AiTarget.PLACE) == [MANUAL_CHECK, "Фото 2: не про место"]
    assert hold_reasons.for_author([], AiTarget.NOTE) == [MANUAL_CHECK]


def test_every_line_the_screening_stores_is_understood_and_hides_the_numbers() -> None:
    """Catches `ai_moderation.describe` and the stored constants drifting away from this module."""
    stored = [
        effects.UNCHECKED_TEXT,
        effects.UNCHECKED_PHOTO.format(index=12),
        *content.gibberish_reasons({"название": "цукйцук", "точки маршрута": "фывапролдж"}),
    ]
    for verdict, usefulness in itertools.product(AiVerdict, (None, 0, 14, 60)):
        for confidence in (0.0, 0.31, 0.6, 1.0):
            stored.append(_line(verdict, confidence, usefulness=usefulness))
            for category in ai_moderation.TEXT_CATEGORIES + ai_moderation.PHOTO_CATEGORIES:
                stored.append(_line(verdict, confidence, category, usefulness=usefulness))
            stored.append(
                _line(verdict, confidence, *ai_moderation.PHOTO_CATEGORIES[:3], usefulness=usefulness)
            )
    assert len(stored) > 300
    for line in stored:
        for target in AiTarget:
            told = hold_reasons.author_line(line, rates_usefulness=target is AiTarget.PLACE)
            assert told is not None, line
            assert not any(word in told for word in FORBIDDEN), (line, told)
            assert "Сводка" not in told


def test_the_notice_names_the_item_and_says_what_happens_next() -> None:
    assert hold_reasons.notice_title(AiTarget.COMMENT, "Сквер") == (
        "Комментарий к «Сквер» не прошёл автоматическую проверку"
    )
    assert (
        hold_reasons.notice_title(AiTarget.NOTE, None) == "Заметка на карте не прошла автоматическую проверку"
    )
    long_title = hold_reasons.notice_title(AiTarget.PLACE, "Очень длинное название " * 20)
    assert len(long_title) <= hold_reasons.NOTICE_TITLE_LIMIT
    assert long_title.endswith("не прошла автоматическую проверку")
    body = hold_reasons.notice_body(
        AiTarget.ROUTE, [_line(AiVerdict.VIOLATION, 0.9, AiCategory.SPAM, usefulness=3)]
    )
    assert body == (
        "Что нашла проверка: Текст: спам. Пока его видите только вы — модератор посмотрит и решит. "
        "Можно исправить его — модератор увидит новую версию."
    )
