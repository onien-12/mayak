"""Screening rules (SPEC §14, §24): validation of the model's answers and what they may cause.

The model is an advisor. Its answers are untrusted input: anything that does not match the
schema is discarded, unknown categories are dropped, numbers are clamped, and a valid opinion
can only map to the outcomes defined here — release, release for a moderator's look, or a quiet
hold until a moderator decides.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from app.domain.enums import AiCategory, AiVerdict

HOLD_CONFIDENCE = 0.6
"""`suspicious` from this confidence holds; below it the item is shown with a warning."""
PHOTO_PASS_CONFIDENCE = 0.5
"""A photo passes only as `ok` with at least this confidence."""
USEFULNESS_HOLD_BELOW = 15
"""Junk scores 0–10 on the real model, a bare but real point («Туалет») about 25."""
USEFUL_FROM = 70
"""Usefulness that earns the author a point of standing."""
NEUTRAL_USEFULNESS = 50
"""Places never rated (imported, seed, older) count as average when ordering."""
MAX_USEFULNESS = 100
MAX_SUMMARY_LENGTH = 300
IMAGE_SIDE_PX = 1024
REQUEST_TIMEOUT_S = 20.0
"""How long one check may take before the fallback applies."""

TEXT_CATEGORIES: tuple[AiCategory, ...] = (
    AiCategory.SPAM,
    AiCategory.ADS,
    AiCategory.OFFENSIVE,
    AiCategory.PERSONAL_DATA,
    AiCategory.FRAUD,
    AiCategory.OFF_TOPIC,
    AiCategory.NONSENSE,
    AiCategory.DANGEROUS,
)
PHOTO_CATEGORIES: tuple[AiCategory, ...] = (
    AiCategory.NUDITY,
    AiCategory.SEXUAL,
    AiCategory.VIOLENCE,
    AiCategory.SHOCKING,
    AiCategory.OBSCENE,
    AiCategory.ADVERTISING,
    AiCategory.PERSONAL_DATA,
    AiCategory.NOT_A_PLACE,
)

CATEGORY_LABELS: dict[AiCategory, str] = {
    AiCategory.SPAM: "спам",
    AiCategory.ADS: "реклама",
    AiCategory.OFFENSIVE: "оскорбления",
    AiCategory.PERSONAL_DATA: "личные данные",
    AiCategory.FRAUD: "мошенничество",
    AiCategory.OFF_TOPIC: "не по теме",
    AiCategory.NONSENSE: "бессмыслица",
    AiCategory.DANGEROUS: "опасное",
    AiCategory.INAPPROPRIATE_IMAGE: "неподходящее фото",
    AiCategory.NUDITY: "нагота",
    AiCategory.SEXUAL: "сексуальное",
    AiCategory.VIOLENCE: "насилие",
    AiCategory.SHOCKING: "шокирующее",
    AiCategory.OBSCENE: "непристойное",
    AiCategory.ADVERTISING: "реклама",
    AiCategory.NOT_A_PLACE: "не про место",
}
VERDICT_LABELS: dict[AiVerdict, str] = {
    AiVerdict.OK: "нарушений нет",
    AiVerdict.SUSPICIOUS: "сомнительно",
    AiVerdict.VIOLATION: "нарушение",
}


def _schema(categories: tuple[AiCategory, ...], *, with_usefulness: bool) -> dict[str, Any]:
    properties: dict[str, Any] = {
        "verdict": {"type": "string", "enum": [verdict.value for verdict in AiVerdict]},
        "categories": {"type": "array", "items": {"type": "string", "enum": [c.value for c in categories]}},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    }
    if with_usefulness:
        properties["usefulness"] = {"type": "integer", "minimum": 0, "maximum": MAX_USEFULNESS}
    properties["summary"] = {"type": "string"}
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(properties),
        "properties": properties,
    }


TEXT_SCHEMA: dict[str, Any] = _schema(TEXT_CATEGORIES, with_usefulness=True)
PHOTO_SCHEMA: dict[str, Any] = _schema(PHOTO_CATEGORIES, with_usefulness=False)


class TextOutcome(StrEnum):
    """What a text opinion does to the item it is about."""

    RELEASE = "release"
    REVIEW = "review"
    """Shown, but with a moderation case and, for places and routes, a warning (`needs_review`)."""
    HOLD = "hold"


@dataclass(frozen=True, slots=True)
class AiOpinion:
    verdict: AiVerdict
    categories: tuple[AiCategory, ...]
    confidence: float
    summary: str
    usefulness: int | None = None
    """0..100 for text reviews; photos have none."""


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _parse(raw: Any, allowed: tuple[AiCategory, ...], *, with_usefulness: bool) -> AiOpinion | None:
    required = (
        "verdict",
        "categories",
        "confidence",
        "summary",
        *(("usefulness",) if with_usefulness else ()),
    )
    if not isinstance(raw, Mapping) or any(key not in raw for key in required):
        return None
    confidence = _number(raw["confidence"])
    usefulness = _number(raw["usefulness"]) if with_usefulness else None
    categories = raw["categories"]
    summary = raw["summary"]
    if confidence is None or (with_usefulness and usefulness is None):
        return None
    if not isinstance(categories, list) or not isinstance(summary, str):
        return None
    try:
        verdict = AiVerdict(raw["verdict"])
    except (ValueError, TypeError):
        return None
    known = {category.value: category for category in allowed}
    parsed = tuple(
        dict.fromkeys(known[item] for item in categories if isinstance(item, str) and item in known)
    )
    return AiOpinion(
        verdict=verdict,
        categories=parsed,
        confidence=min(max(confidence, 0.0), 1.0),
        summary=summary.strip()[:MAX_SUMMARY_LENGTH],
        usefulness=round(min(max(usefulness, 0.0), MAX_USEFULNESS)) if usefulness is not None else None,
    )


def parse_text_opinion(raw: Any) -> AiOpinion | None:
    """Validate a decoded text review; unknown categories are dropped, numbers clamped."""
    return _parse(raw, TEXT_CATEGORIES, with_usefulness=True)


def parse_photo_opinion(raw: Any) -> AiOpinion | None:
    """Validate a decoded photo check; unknown categories are dropped, confidence clamped."""
    return _parse(raw, PHOTO_CATEGORIES, with_usefulness=False)


def text_outcome(opinion: AiOpinion, *, standing_low: bool, rates_usefulness: bool) -> TextOutcome:
    """`violation` of any confidence holds, so does `suspicious` from 0.6 (from 0 for an author
    with low standing) and, for places, usefulness below 15. Doubt below that is only reviewed."""
    if opinion.verdict is AiVerdict.VIOLATION:
        return TextOutcome.HOLD
    if opinion.verdict is AiVerdict.SUSPICIOUS and (standing_low or opinion.confidence >= HOLD_CONFIDENCE):
        return TextOutcome.HOLD
    usefulness = opinion.usefulness
    if rates_usefulness and usefulness is not None and usefulness < USEFULNESS_HOLD_BELOW:
        return TextOutcome.HOLD
    return TextOutcome.REVIEW if opinion.verdict is AiVerdict.SUSPICIOUS else TextOutcome.RELEASE


def photo_passes(opinion: AiOpinion) -> bool:
    return opinion.verdict is AiVerdict.OK and opinion.confidence >= PHOTO_PASS_CONFIDENCE


def is_useful(opinion: AiOpinion) -> bool:
    return opinion.usefulness is not None and opinion.usefulness >= USEFUL_FROM


def describe(opinion: AiOpinion, *, subject: str) -> str:
    """One human-readable line for the moderator, e.g. «Текст: нарушение (реклама), уверенность 0.93»."""
    line = f"{subject}: {VERDICT_LABELS[opinion.verdict]}"
    if opinion.categories:
        line += f" ({', '.join(dict.fromkeys(CATEGORY_LABELS[c] for c in opinion.categories))})"
    line += f", уверенность {opinion.confidence:.2f}"
    if opinion.usefulness is not None and opinion.usefulness < USEFULNESS_HOLD_BELOW:
        line += f", польза {opinion.usefulness} из {MAX_USEFULNESS}"
    return line
