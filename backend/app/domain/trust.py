"""Collective verification maths: vote weights, trust score and status derivation (SPEC §3)."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime

from app.domain.enums import ExternalSourceId, ModerationTrigger, PlaceStatus, VoteKind

PROXIMITY_RADIUS_M = 300.0
PROXIMITY_BONUS = 1.25
VOTE_HALF_LIFE_DAYS = 180.0

ABSENT_PENALTY = 1.5
UNCLEAR_PENALTY = 0.5
CONFIDENCE_PRIOR = 1.0

FRESHNESS_FLOOR = 0.6
FRESHNESS_SPAN = 0.4
FRESHNESS_HALF_LIFE_DAYS = 365.0
STALE_AFTER_DAYS = 180.0

PRELIMINARY_PRESENT = 1.0
VERIFIED_PRESENT = 4.0
VERIFIED_MIN_VOTERS = 3
VERIFIED_ABSENT_RATIO = 2.0
REVIEW_ABSENT = 3.0
HIDE_ABSENT = 6.0
HIDE_ABSENT_RATIO = 2.0
REVIEW_COMPLAINTS_WEIGHT = 3.0

_SECONDS_PER_DAY = 86_400.0


@dataclass(frozen=True, slots=True)
class VoteSample:
    """One active vote; `weight` is the voter weight at cast time including the proximity bonus."""

    kind: VoteKind
    weight: float
    cast_at: datetime


@dataclass(frozen=True, slots=True)
class VoteTotals:
    present: float = 0.0
    absent: float = 0.0
    unclear: float = 0.0
    present_voters: int = 0
    last_present_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class SourceBaseline:
    """The confirmation an external source gives to everything imported from it."""

    weight: float
    """Added to the present weight `P`."""
    voters: int
    """Counted as distinct present voters."""


EDITORIAL_SOURCE = SourceBaseline(weight=VERIFIED_PRESENT, voters=VERIFIED_MIN_VOTERS)
"""A live editorial source is enough on its own: its content starts `verified`."""
COMMUNITY_MAP_SOURCE = SourceBaseline(weight=PRELIMINARY_PRESENT, voters=1)
"""An open map counts as one first confirmation: `preliminary` until residents confirm it."""
TRAVEL_GUIDE_SOURCE = SourceBaseline(weight=2 * PRELIMINARY_PRESENT, voters=1)
"""A travel guide was written by someone who went there, but long ago and without a date on
every line: more than a map entry, still one voice — `preliminary` until residents confirm it."""
SOURCE_BASELINES: dict[ExternalSourceId, SourceBaseline] = {
    ExternalSourceId.VL_RU: EDITORIAL_SOURCE,
    ExternalSourceId.VL_RU_OFF: EDITORIAL_SOURCE,
    ExternalSourceId.OSM: COMMUNITY_MAP_SOURCE,
    ExternalSourceId.WIKIVOYAGE: TRAVEL_GUIDE_SOURCE,
}


@dataclass(frozen=True, slots=True)
class StatusDecision:
    status: PlaceStatus
    trigger: ModerationTrigger | None = None


def _days_between(earlier: datetime, later: datetime) -> float:
    return max((later - earlier).total_seconds(), 0.0) / _SECONDS_PER_DAY


def cast_weight(voter_weight: float, *, is_near: bool) -> float:
    return voter_weight * (PROXIMITY_BONUS if is_near else 1.0)


def decayed_weight(weight: float, cast_at: datetime, now: datetime) -> float:
    return weight * 0.5 ** (_days_between(cast_at, now) / VOTE_HALF_LIFE_DAYS)


def aggregate(votes: Iterable[VoteSample], now: datetime) -> VoteTotals:
    """Sum time-decayed weights per vote kind."""
    sums = dict.fromkeys(VoteKind, 0.0)
    present_voters = 0
    last_present_at: datetime | None = None
    for vote in votes:
        sums[vote.kind] += decayed_weight(vote.weight, vote.cast_at, now)
        if vote.kind is VoteKind.PRESENT:
            present_voters += 1
            if last_present_at is None or vote.cast_at > last_present_at:
                last_present_at = vote.cast_at
    return VoteTotals(
        present=sums[VoteKind.PRESENT],
        absent=sums[VoteKind.ABSENT],
        unclear=sums[VoteKind.UNCLEAR],
        present_voters=present_voters,
        last_present_at=last_present_at,
    )


def with_external_baseline(totals: VoteTotals, source: ExternalSourceId) -> VoteTotals:
    """Totals of an imported place: the source adds its own baseline confirmation."""
    baseline = SOURCE_BASELINES[source]
    return VoteTotals(
        present=totals.present + baseline.weight,
        absent=totals.absent,
        unclear=totals.unclear,
        present_voters=totals.present_voters + baseline.voters,
        last_present_at=totals.last_present_at,
    )


def confidence(author_prior: float, totals: VoteTotals) -> float:
    support = author_prior + totals.present
    doubt = ABSENT_PENALTY * totals.absent + UNCLEAR_PENALTY * totals.unclear
    return support / (support + doubt + CONFIDENCE_PRIOR)


def freshness(last_confirmation: datetime, now: datetime) -> float:
    age_days = _days_between(last_confirmation, now)
    return FRESHNESS_FLOOR + FRESHNESS_SPAN * 0.5 ** (age_days / FRESHNESS_HALF_LIFE_DAYS)


def trust_score(author_prior: float, totals: VoteTotals, last_confirmation: datetime, now: datetime) -> int:
    """0..100; `last_confirmation` is the last present vote, else the creation time."""
    score = 100 * confidence(author_prior, totals) * freshness(last_confirmation, now)
    return max(0, min(100, round(score)))


def is_stale(last_confirmation: datetime, now: datetime) -> bool:
    return _days_between(last_confirmation, now) > STALE_AFTER_DAYS


def is_verified(totals: VoteTotals) -> bool:
    return (
        totals.present >= VERIFIED_PRESENT
        and totals.present_voters >= VERIFIED_MIN_VOTERS
        and totals.present > VERIFIED_ABSENT_RATIO * totals.absent
    )


def _confirmation_status(totals: VoteTotals, author_prior: float) -> PlaceStatus:
    if is_verified(totals):
        return PlaceStatus.VERIFIED
    if totals.present >= PRELIMINARY_PRESENT or author_prior >= PRELIMINARY_PRESENT:
        return PlaceStatus.PRELIMINARY
    return PlaceStatus.UNVERIFIED


def derive_status(
    *,
    totals: VoteTotals,
    author_prior: float,
    complaints_weight: float,
    disputing_absent: float,
    absent_rules_apply: bool = True,
    flagged_by_ai: bool = False,
) -> StatusDecision:
    """Automatic status for a publication that is not locked (SPEC §3.2, rules 1-6).

    `flagged_by_ai` keeps the place in `needs_review` while a case opened by the LLM
    pre-screening awaits a moderator (SPEC §14); the case already exists, so no trigger.

    `disputing_absent` is the absent weight that may trigger rules 1-2: votes cast after the
    last moderator review, so an approved place is not sent back to review by the same votes.
    Issues pass `absent_rules_apply=False` because absent votes resolve them instead.
    An author prior of at least `PRELIMINARY_PRESENT` counts as the first confirmation, which
    is why experts and staff publish straight to `preliminary`.
    """
    if absent_rules_apply:
        if disputing_absent >= HIDE_ABSENT and disputing_absent >= HIDE_ABSENT_RATIO * totals.present:
            return StatusDecision(PlaceStatus.HIDDEN, ModerationTrigger.ABSENT_VOTES)
        if disputing_absent >= REVIEW_ABSENT and disputing_absent > totals.present:
            return StatusDecision(PlaceStatus.NEEDS_REVIEW, ModerationTrigger.ABSENT_VOTES)
    if complaints_weight >= REVIEW_COMPLAINTS_WEIGHT:
        return StatusDecision(PlaceStatus.NEEDS_REVIEW, ModerationTrigger.COMPLAINTS)
    if flagged_by_ai:
        return StatusDecision(PlaceStatus.NEEDS_REVIEW)
    return StatusDecision(_confirmation_status(totals, author_prior))


def imported_status(source: ExternalSourceId, author_prior: float) -> PlaceStatus:
    """The status content from a source starts with, before anyone has voted on it."""
    return _confirmation_status(with_external_baseline(VoteTotals(), source), author_prior)


MIN_CLARIFICATION_LENGTH = 5
"""An «unclear» vote must say what is unclear: without words nobody can act on it."""
