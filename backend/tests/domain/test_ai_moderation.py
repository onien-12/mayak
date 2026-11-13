import pytest

from app.domain import ai_moderation, moderation_risk
from app.domain import standing as standing_rules
from app.domain.ai_moderation import AiOpinion, TextOutcome
from app.domain.enums import AiCategory, AiVerdict, Layer, StandingReason, UserLevel


def _raw(**overrides: object) -> dict[str, object]:
    raw: dict[str, object] = {
        "verdict": "ok",
        "categories": [],
        "confidence": 0.9,
        "usefulness": 60,
        "summary": "Всё в порядке.",
    }
    raw.update(overrides)
    return raw


def _opinion(verdict: AiVerdict, confidence: float, usefulness: int | None = 60) -> AiOpinion:
    return AiOpinion(verdict, (), confidence, "…", usefulness)


def test_valid_answer_is_parsed() -> None:
    opinion = ai_moderation.parse_text_opinion(
        _raw(verdict="violation", categories=["spam", "ads", "spam"], confidence=1, summary="  Реклама.  ")
    )
    assert opinion == AiOpinion(AiVerdict.VIOLATION, (AiCategory.SPAM, AiCategory.ADS), 1.0, "Реклама.", 60)


def test_summary_is_truncated() -> None:
    opinion = ai_moderation.parse_text_opinion(_raw(summary="а" * 1000))
    assert opinion is not None
    assert len(opinion.summary) == ai_moderation.MAX_SUMMARY_LENGTH


def test_unknown_categories_are_dropped_and_numbers_clamped() -> None:
    opinion = ai_moderation.parse_text_opinion(
        _raw(categories=["hacking", "spam", 7, "nudity"], confidence=1.5, usefulness=250)
    )
    assert opinion is not None
    assert opinion.categories == (AiCategory.SPAM,)
    assert (opinion.confidence, opinion.usefulness) == (1.0, 100)
    low = ai_moderation.parse_text_opinion(_raw(confidence=-0.3, usefulness=-4.6))
    assert low is not None
    assert (low.confidence, low.usefulness) == (0.0, 0)


def test_photo_answers_have_their_own_categories() -> None:
    raw = {
        "verdict": "violation",
        "categories": ["advertising", "spam"],
        "confidence": 0.9,
        "summary": "Казино.",
    }
    opinion = ai_moderation.parse_photo_opinion(raw)
    assert opinion is not None
    assert (opinion.categories, opinion.usefulness) == ((AiCategory.ADVERTISING,), None)
    assert ai_moderation.parse_text_opinion(raw) is None


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "ok",
        [],
        {},
        _raw(verdict="approve"),
        _raw(categories="spam"),
        _raw(confidence="high"),
        _raw(confidence=True),
        _raw(usefulness="высокая"),
        _raw(usefulness=None),
        _raw(summary=None),
        {key: value for key, value in _raw().items() if key != "summary"},
        {key: value for key, value in _raw().items() if key != "usefulness"},
    ],
)
def test_anything_outside_the_schema_is_discarded(raw: object) -> None:
    assert ai_moderation.parse_text_opinion(raw) is None


def test_schemas_list_their_enum_values() -> None:
    text = ai_moderation.TEXT_SCHEMA
    assert text["properties"]["verdict"]["enum"] == [verdict.value for verdict in AiVerdict]
    assert text["properties"]["categories"]["items"]["enum"] == [
        c.value for c in ai_moderation.TEXT_CATEGORIES
    ]
    assert text["required"] == ["verdict", "categories", "confidence", "usefulness", "summary"]
    assert text["additionalProperties"] is False
    photo = ai_moderation.PHOTO_SCHEMA
    assert photo["properties"]["categories"]["items"]["enum"] == [
        "nudity",
        "sexual",
        "violence",
        "shocking",
        "obscene",
        "advertising",
        "personal_data",
        "not_a_place",
    ]
    assert "usefulness" not in photo["properties"]


@pytest.mark.parametrize(
    ("verdict", "confidence", "usefulness", "outcome"),
    [
        (AiVerdict.OK, 1.0, 60, TextOutcome.RELEASE),
        (AiVerdict.OK, 1.0, 25, TextOutcome.RELEASE),
        (AiVerdict.OK, 1.0, 14, TextOutcome.HOLD),
        (AiVerdict.SUSPICIOUS, 0.59, 60, TextOutcome.REVIEW),
        (AiVerdict.SUSPICIOUS, 0.6, 60, TextOutcome.HOLD),
        (AiVerdict.VIOLATION, 0.1, 60, TextOutcome.HOLD),
        (AiVerdict.VIOLATION, 1.0, 90, TextOutcome.HOLD),
    ],
)
def test_hold_rule(verdict: AiVerdict, confidence: float, usefulness: int, outcome: TextOutcome) -> None:
    opinion = _opinion(verdict, confidence, usefulness)
    assert ai_moderation.text_outcome(opinion, standing_low=False, rates_usefulness=True) is outcome


def test_usefulness_counts_only_where_it_is_rated() -> None:
    junk = _opinion(AiVerdict.OK, 0.9, 3)
    assert ai_moderation.text_outcome(junk, standing_low=False, rates_usefulness=False) is TextOutcome.RELEASE


def test_low_standing_holds_any_doubt() -> None:
    doubt = _opinion(AiVerdict.SUSPICIOUS, 0.2)
    assert ai_moderation.text_outcome(doubt, standing_low=True, rates_usefulness=True) is TextOutcome.HOLD
    clean = _opinion(AiVerdict.OK, 0.9)
    assert ai_moderation.text_outcome(clean, standing_low=True, rates_usefulness=True) is TextOutcome.RELEASE


@pytest.mark.parametrize(
    ("verdict", "confidence", "passes"),
    [
        (AiVerdict.OK, 0.5, True),
        (AiVerdict.OK, 0.49, False),
        (AiVerdict.SUSPICIOUS, 0.3, False),
        (AiVerdict.VIOLATION, 0.9, False),
    ],
)
def test_photo_passes_only_as_a_confident_ok(verdict: AiVerdict, confidence: float, passes: bool) -> None:
    assert ai_moderation.photo_passes(_opinion(verdict, confidence, None)) is passes


def test_description_for_the_moderator() -> None:
    opinion = AiOpinion(AiVerdict.VIOLATION, (AiCategory.ADS, AiCategory.SPAM), 0.93, "…", 4)
    assert ai_moderation.describe(opinion, subject="Текст") == (
        "Текст: нарушение (реклама, спам), уверенность 0.93, польза 4 из 100"
    )


def test_standing_changes_are_clamped() -> None:
    assert standing_rules.changed(standing_rules.START, StandingReason.HELD) == 42
    assert standing_rules.changed(42, StandingReason.RELEASED) == 50
    assert standing_rules.changed(5, StandingReason.CONFIRMED) == 0
    assert standing_rules.changed(100, StandingReason.PASSED) == 100
    assert standing_rules.is_low(29)
    assert not standing_rules.is_low(30)


def test_ai_opinion_and_standing_move_case_risk() -> None:
    def risk(verdict: AiVerdict | None, confidence: float = 0.0, standing: int = standing_rules.START) -> int:
        return moderation_risk.risk_score(
            complaints_weight=0,
            absent_weight=0,
            flags_count=0,
            author_level=UserLevel.NEWCOMER,
            layer=Layer.TOURISM,
            ai_verdict=verdict,
            ai_confidence=confidence,
            author_standing=standing,
        )

    assert risk(AiVerdict.OK, 0.9) < risk(None) < risk(AiVerdict.SUSPICIOUS, 0.5)
    assert risk(AiVerdict.SUSPICIOUS, 0.5) < risk(AiVerdict.VIOLATION, 0.5) < risk(AiVerdict.VIOLATION, 1.0)
    assert moderation_risk.ai_points(AiVerdict.VIOLATION, 1.0) == moderation_risk.AI_VIOLATION_POINTS
    assert risk(None, standing=100) == risk(None) < risk(None, standing=20) < risk(None, standing=0)
