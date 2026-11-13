"""Home area as an internal trust signal (SPEC §16).

Residents know their neighbourhood better than passers-by, so a vote about locally known
content weighs more when the voter credibly lives nearby. Nothing here is ever exposed.
"""

import math
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from app.domain.enums import IssueStage, Layer, PlaceStatus, VoteKind

UTILITIES_CATEGORY = "utilities"
SENSITIVITY_UTILITIES = 1.0
SENSITIVITY_ISSUE = 0.6
SENSITIVITY_INFRASTRUCTURE = 0.4
SENSITIVITY_NONE = 0.0

FULL_PROXIMITY_M = 500.0
PROXIMITY_SCALE_M = 1500.0
RESIDENT_BONUS = 0.5
STRANGER_PENALTY = 0.4

HOME_COORDINATE_PRECISION = 3
HOME_CHANGE_COOLDOWN_DAYS = 30
HOME_SUBSCRIPTION_RADIUS_M = 1000
HOME_SUBSCRIPTION_LAYERS = (Layer.ISSUE, Layer.EVENT)

BASE_CONFIDENCE = 0.2
GEO_WEIGHT = 0.3
TENURE_WEIGHT = 0.2
LOCAL_WEIGHT = 0.3
ELSEWHERE_PENALTY = 0.3
GEO_DAYS_FOR_FULL = 4
TENURE_DAYS_FOR_FULL = 30
LOCAL_VOTES_FOR_FULL = 8
GEO_RADIUS_M = 1000.0
LOCAL_RADIUS_M = 1500.0
ELSEWHERE_RADIUS_M = 5000.0
ELSEWHERE_MIN_VOTES = 5
UNDECIDED_AGREEMENT = 0.5


class Outcome(StrEnum):
    """What the community has concluded about a place so far."""

    PRESENT = "present"
    ABSENT = "absent"
    UNDECIDED = "undecided"


@dataclass(frozen=True, slots=True)
class VoteFact:
    """One of the user's votes, as far as the home confidence is concerned."""

    kind: VoteKind
    is_geo_confirmed: bool
    cast_on: date
    distance_from_home_m: float
    outcome: Outcome


@dataclass(frozen=True, slots=True)
class HomeEvidence:
    geo_days: int
    tenure_days: float
    local_votes: int
    local_agreement: float
    elsewhere_share: float


def sensitivity(layer: Layer, category_slug: str) -> float:
    """How much better residents know this kind of content than passers-by."""
    if layer is Layer.ISSUE:
        return SENSITIVITY_UTILITIES if category_slug == UTILITIES_CATEGORY else SENSITIVITY_ISSUE
    if layer is Layer.INFRASTRUCTURE:
        return SENSITIVITY_INFRASTRUCTURE
    return SENSITIVITY_NONE


def proximity(distance_m: float) -> float:
    """1 within 500 m of home, then exponential decay (about 0.5 at 1.5 km, 0.1 at 4 km)."""
    if distance_m <= FULL_PROXIMITY_M:
        return 1.0
    return math.exp(-(distance_m - FULL_PROXIMITY_M) / PROXIMITY_SCALE_M)


def local_factor(sensitivity_: float, home_confidence_: float, distance_from_home_m: float | None) -> float:
    """Multiplier of a vote weight; `distance_from_home_m` is None when no home is declared.

    Evidence `e` that the voter lives near the place is 0 without a home, so declaring one can
    only raise the factor, and a home far from the place earns nothing.
    """
    evidence = 0.0 if distance_from_home_m is None else home_confidence_ * proximity(distance_from_home_m)
    return 1 + sensitivity_ * (RESIDENT_BONUS * evidence - STRANGER_PENALTY * (1 - evidence))


def outcome_of(status: PlaceStatus, stage: IssueStage | None) -> Outcome:
    if status in (PlaceStatus.HIDDEN, PlaceStatus.ARCHIVED) or stage is IssueStage.RESOLVED:
        return Outcome.ABSENT
    if status in (PlaceStatus.PRELIMINARY, PlaceStatus.VERIFIED):
        return Outcome.PRESENT
    return Outcome.UNDECIDED


def agreement(kind: VoteKind, outcome: Outcome) -> float:
    """1 when the vote matches the community outcome, 0 when it contradicts it, 0.5 when undecided."""
    if outcome is Outcome.UNDECIDED or kind is VoteKind.UNCLEAR:
        return UNDECIDED_AGREEMENT
    return 1.0 if kind.value == outcome.value else 0.0


def gather_evidence(votes: Iterable[VoteFact], tenure_days: float) -> HomeEvidence:
    geo_days: set[date] = set()
    local_agreements: list[float] = []
    geo_confirmed = elsewhere = 0
    for vote in votes:
        if vote.distance_from_home_m <= LOCAL_RADIUS_M:
            local_agreements.append(agreement(vote.kind, vote.outcome))
        if not vote.is_geo_confirmed:
            continue
        geo_confirmed += 1
        if vote.distance_from_home_m <= GEO_RADIUS_M:
            geo_days.add(vote.cast_on)
        elif vote.distance_from_home_m > ELSEWHERE_RADIUS_M:
            elsewhere += 1
    return HomeEvidence(
        geo_days=len(geo_days),
        tenure_days=tenure_days,
        local_votes=len(local_agreements),
        local_agreement=sum(local_agreements) / len(local_agreements) if local_agreements else 0.0,
        elsewhere_share=elsewhere / geo_confirmed if elsewhere >= ELSEWHERE_MIN_VOTES else 0.0,
    )


def home_confidence(evidence: HomeEvidence) -> float:
    """How much the declared home is believed, 0..1 (SPEC §16); callers use 0 when no home is set."""
    geo = min(1.0, evidence.geo_days / GEO_DAYS_FOR_FULL)
    tenure = min(1.0, max(evidence.tenure_days, 0.0) / TENURE_DAYS_FOR_FULL)
    local = min(1.0, evidence.local_votes / LOCAL_VOTES_FOR_FULL) * evidence.local_agreement
    score = (
        BASE_CONFIDENCE
        + GEO_WEIGHT * geo
        + TENURE_WEIGHT * tenure
        + LOCAL_WEIGHT * local
        - ELSEWHERE_PENALTY * evidence.elsewhere_share
    )
    return max(0.0, min(1.0, score))
