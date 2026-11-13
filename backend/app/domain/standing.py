"""Hidden author standing (SPEC §24.4): how carefully the next publication is looked at.

Separate from the public reputation: it never changes vote weights, levels or limits, and
only moderators ever see it.
"""

from app.domain.enums import StandingReason

START = 50
MIN = 0
MAX = 100
LOW_BELOW = 30
"""Below this a failed check does not release and `suspicious` of any confidence holds."""

DELTAS: dict[StandingReason, int] = {
    StandingReason.PASSED: 1,
    StandingReason.USEFUL: 1,
    StandingReason.HELD: -8,
    StandingReason.CONFIRMED: -15,
    StandingReason.RELEASED: 8,
}

RISK_POINTS_PER_STEP = 0.4
"""Risk added to a case for every point of standing below the start."""


def changed(score: int, reason: StandingReason) -> int:
    return max(MIN, min(MAX, score + DELTAS[reason]))


def is_low(score: int) -> bool:
    return score < LOW_BELOW


def risk_points(score: int) -> float:
    """Only a standing below the start adds risk; a good one does not lower it."""
    return max(START - score, 0) * RISK_POINTS_PER_STEP
