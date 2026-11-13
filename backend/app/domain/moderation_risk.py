"""Risk score of a moderation case: orders the queue so the riskiest content is reviewed first."""

from app.domain import standing as standing_rules
from app.domain.enums import AiVerdict, Layer, UserLevel

COMPLAINT_WEIGHT_POINTS = 8.0
COMPLAINTS_MAX_POINTS = 40.0
ABSENT_WEIGHT_POINTS = 5.0
ABSENT_MAX_POINTS = 25.0
FLAG_POINTS = 10.0
FLAGS_MAX_POINTS = 20.0
MAX_RISK = 100

AUTHOR_LEVEL_POINTS: dict[UserLevel, float] = {
    UserLevel.NEWCOMER: 15.0,
    UserLevel.RESIDENT: 8.0,
    UserLevel.TRUSTED: 3.0,
    UserLevel.EXPERT: 0.0,
}

AI_OK_POINTS = -10.0
AI_SUSPICIOUS_POINTS = 15.0
AI_VIOLATION_POINTS = 40.0

TIME_SENSITIVE_LAYER_POINTS = 5.0
TIME_SENSITIVE_LAYERS = frozenset({Layer.ISSUE, Layer.EVENT})


def ai_points(verdict: AiVerdict | None, confidence: float) -> float:
    """Risk added by the latest LLM opinion: a clean bill lowers it, a confident violation raises it."""
    if verdict is None:
        return 0.0
    if verdict is AiVerdict.OK:
        return AI_OK_POINTS
    if verdict is AiVerdict.SUSPICIOUS:
        return AI_SUSPICIOUS_POINTS
    return AI_SUSPICIOUS_POINTS + (AI_VIOLATION_POINTS - AI_SUSPICIOUS_POINTS) * confidence


def risk_score(
    *,
    complaints_weight: float,
    absent_weight: float,
    flags_count: int,
    author_level: UserLevel,
    layer: Layer | None,
    ai_verdict: AiVerdict | None = None,
    ai_confidence: float = 0.0,
    author_standing: int = standing_rules.START,
) -> int:
    """Weighted sum clamped to 0..100; a low hidden standing of the author adds to it (SPEC §24.4)."""
    score = (
        ai_points(ai_verdict, ai_confidence)
        + standing_rules.risk_points(author_standing)
        + min(complaints_weight * COMPLAINT_WEIGHT_POINTS, COMPLAINTS_MAX_POINTS)
        + min(absent_weight * ABSENT_WEIGHT_POINTS, ABSENT_MAX_POINTS)
        + min(flags_count * FLAG_POINTS, FLAGS_MAX_POINTS)
        + AUTHOR_LEVEL_POINTS[author_level]
        + (TIME_SENSITIVE_LAYER_POINTS if layer in TIME_SENSITIVE_LAYERS else 0.0)
    )
    return max(0, min(MAX_RISK, round(score)))
