from datetime import date, timedelta

import pytest

from app.domain import locality
from app.domain.enums import IssueStage, Layer, PlaceStatus, VoteKind
from app.domain.locality import HomeEvidence, Outcome, VoteFact

DAY = date(2026, 11, 1)


def _vote(
    distance_m: float,
    *,
    geo: bool = True,
    day: int = 0,
    kind: VoteKind = VoteKind.PRESENT,
    outcome: Outcome = Outcome.PRESENT,
) -> VoteFact:
    return VoteFact(kind, geo, DAY + timedelta(days=day), distance_m, outcome)


@pytest.mark.parametrize(
    ("layer", "category", "expected"),
    [
        (Layer.ISSUE, "utilities", 1.0),
        (Layer.ISSUE, "roads", 0.6),
        (Layer.ISSUE, "hazard", 0.6),
        (Layer.INFRASTRUCTURE, "toilet", 0.4),
        (Layer.TOURISM, "viewpoint", 0.0),
        (Layer.EVENT, "culture", 0.0),
    ],
)
def test_sensitivity_by_content(layer: Layer, category: str, expected: float) -> None:
    assert locality.sensitivity(layer, category) == expected


def test_proximity_curve() -> None:
    assert locality.proximity(0) == 1.0
    assert locality.proximity(500) == 1.0
    assert locality.proximity(1500) == pytest.approx(0.513, abs=0.01)
    assert locality.proximity(4000) == pytest.approx(0.097, abs=0.01)
    distances = [0, 400, 600, 1000, 2000, 5000, 20_000]
    values = [locality.proximity(distance) for distance in distances]
    assert values == sorted(values, reverse=True)


def test_factor_without_a_home() -> None:
    assert locality.local_factor(1.0, 0.0, None) == pytest.approx(0.6)
    assert locality.local_factor(0.6, 0.0, None) == pytest.approx(0.76)
    assert locality.local_factor(0.4, 0.0, None) == pytest.approx(0.84)
    assert locality.local_factor(0.0, 0.0, None) == 1.0


def test_confirmed_resident_nearby_and_far_away() -> None:
    assert locality.local_factor(1.0, 1.0, 200) == pytest.approx(1.5)
    assert locality.local_factor(0.4, 1.0, 200) == pytest.approx(1.2)
    assert locality.local_factor(1.0, 1.0, 50_000) == pytest.approx(0.6, abs=1e-6)
    assert locality.local_factor(0.0, 1.0, 200) == 1.0


def test_factor_is_monotonic_in_distance_and_confidence() -> None:
    by_distance = [locality.local_factor(1.0, 0.8, distance) for distance in (0, 600, 1500, 4000, 10_000)]
    assert by_distance == sorted(by_distance, reverse=True)
    by_confidence = [locality.local_factor(1.0, confidence, 300) for confidence in (0.0, 0.2, 0.5, 1.0)]
    assert by_confidence == sorted(by_confidence)


@pytest.mark.parametrize("sensitivity", [0.0, 0.4, 0.6, 1.0])
@pytest.mark.parametrize("confidence", [0.0, 0.2, 0.7, 1.0])
@pytest.mark.parametrize("distance", [0.0, 800.0, 3000.0, 40_000.0])
def test_declaring_a_home_never_lowers_the_weight(
    sensitivity: float, confidence: float, distance: float
) -> None:
    undeclared = locality.local_factor(sensitivity, 0.0, None)
    assert locality.local_factor(sensitivity, confidence, distance) >= undeclared


def test_fresh_home_is_worth_little() -> None:
    evidence = locality.gather_evidence([], tenure_days=0)
    assert evidence == HomeEvidence(0, 0, 0, 0.0, 0.0)
    assert locality.home_confidence(evidence) == pytest.approx(0.2)


def test_confidence_grows_with_located_accurate_activity_and_time() -> None:
    votes = [_vote(300, day=index) for index in range(4)] + [_vote(1200, geo=False) for _ in range(4)]
    evidence = locality.gather_evidence(votes, tenure_days=45)
    assert (evidence.geo_days, evidence.local_votes, evidence.local_agreement) == (4, 8, 1.0)
    assert locality.home_confidence(evidence) == pytest.approx(1.0)

    half = locality.gather_evidence(votes[:2], tenure_days=15)
    assert locality.home_confidence(half) == pytest.approx(0.2 + 0.3 * 0.5 + 0.2 * 0.5 + 0.3 * 0.25)


def test_geo_days_are_distinct_days_within_one_kilometre() -> None:
    votes = [
        _vote(300, day=0),
        _vote(400, day=0),
        _vote(900, day=1),
        _vote(1100, day=2),
        _vote(300, geo=False, day=3),
    ]
    assert locality.gather_evidence(votes, 0).geo_days == 2


def test_local_agreement_follows_the_community_outcome() -> None:
    votes = [
        _vote(100, kind=VoteKind.PRESENT, outcome=Outcome.PRESENT),
        _vote(100, kind=VoteKind.ABSENT, outcome=Outcome.PRESENT),
        _vote(100, kind=VoteKind.ABSENT, outcome=Outcome.ABSENT),
        _vote(100, kind=VoteKind.PRESENT, outcome=Outcome.UNDECIDED),
        _vote(100, kind=VoteKind.UNCLEAR, outcome=Outcome.PRESENT),
        _vote(1600, kind=VoteKind.ABSENT, outcome=Outcome.PRESENT),
    ]
    evidence = locality.gather_evidence(votes, 0)
    assert evidence.local_votes == 5
    assert evidence.local_agreement == pytest.approx((1 + 0 + 1 + 0.5 + 0.5) / 5)


def test_being_seen_only_elsewhere_costs_confidence() -> None:
    far = [_vote(8000, day=index) for index in range(5)]
    evidence = locality.gather_evidence(far, tenure_days=30)
    assert evidence.elsewhere_share == 1.0
    assert locality.home_confidence(evidence) == pytest.approx(0.2 + 0.2 - 0.3)
    assert locality.gather_evidence(far[:4], 30).elsewhere_share == 0.0
    mixed = locality.gather_evidence([*far, *(_vote(300, day=10 + index) for index in range(5))], 30)
    assert mixed.elsewhere_share == 0.5


def test_confidence_is_clamped() -> None:
    assert locality.home_confidence(HomeEvidence(0, 0, 0, 0.0, 1.0)) == 0.0
    assert locality.home_confidence(HomeEvidence(100, 1000, 100, 1.0, 0.0)) == 1.0


@pytest.mark.parametrize(
    ("status", "stage", "outcome"),
    [
        (PlaceStatus.VERIFIED, None, Outcome.PRESENT),
        (PlaceStatus.PRELIMINARY, IssueStage.CONFIRMED, Outcome.PRESENT),
        (PlaceStatus.HIDDEN, None, Outcome.ABSENT),
        (PlaceStatus.ARCHIVED, None, Outcome.ABSENT),
        (PlaceStatus.VERIFIED, IssueStage.RESOLVED, Outcome.ABSENT),
        (PlaceStatus.UNVERIFIED, None, Outcome.UNDECIDED),
        (PlaceStatus.NEEDS_REVIEW, None, Outcome.UNDECIDED),
        (PlaceStatus.PENDING, None, Outcome.UNDECIDED),
    ],
)
def test_community_outcome(status: PlaceStatus, stage: IssueStage | None, outcome: Outcome) -> None:
    assert locality.outcome_of(status, stage) is outcome
