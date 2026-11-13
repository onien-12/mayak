from datetime import UTC, datetime, timedelta

import pytest

from app.domain import trust
from app.domain.enums import ModerationTrigger, PlaceStatus, VoteKind
from app.domain.trust import VoteSample, VoteTotals

NOW = datetime(2026, 11, 11, tzinfo=UTC)


def _vote(kind: VoteKind, weight: float, days_ago: float = 0) -> VoteSample:
    return VoteSample(kind, weight, NOW - timedelta(days=days_ago))


def _derive(totals: VoteTotals, **overrides: object) -> trust.StatusDecision:
    params: dict[str, object] = {
        "totals": totals,
        "author_prior": 0.5,
        "complaints_weight": 0.0,
        "disputing_absent": totals.absent,
    }
    params.update(overrides)
    return trust.derive_status(**params)  # type: ignore[arg-type]


def test_proximity_bonus() -> None:
    assert trust.cast_weight(2.0, is_near=True) == 2.5
    assert trust.cast_weight(2.0, is_near=False) == 2.0


def test_vote_weight_halves_every_180_days() -> None:
    assert trust.decayed_weight(2.0, NOW, NOW) == 2.0
    assert trust.decayed_weight(2.0, NOW - timedelta(days=180), NOW) == pytest.approx(1.0)
    assert trust.decayed_weight(2.0, NOW - timedelta(days=360), NOW) == pytest.approx(0.5)


def test_aggregate_sums_decayed_weights_per_kind() -> None:
    totals = trust.aggregate(
        [
            _vote(VoteKind.PRESENT, 2.0),
            _vote(VoteKind.PRESENT, 1.0, days_ago=180),
            _vote(VoteKind.ABSENT, 1.5),
            _vote(VoteKind.UNCLEAR, 0.5),
        ],
        NOW,
    )
    assert totals.present == pytest.approx(2.5)
    assert totals.absent == 1.5
    assert totals.unclear == 0.5
    assert totals.present_voters == 2
    assert totals.last_present_at == NOW


def test_aggregate_of_no_votes() -> None:
    assert trust.aggregate([], NOW) == VoteTotals()


def test_confidence_formula() -> None:
    totals = VoteTotals(present=3.0, absent=1.0, unclear=2.0)
    # (a + P) / (a + P + 1.5 A + 0.5 U + 1) = 4 / (4 + 1.5 + 1 + 1)
    assert trust.confidence(1.0, totals) == pytest.approx(4 / 7.5)


def test_freshness_decays_from_one_towards_floor() -> None:
    assert trust.freshness(NOW, NOW) == pytest.approx(1.0)
    assert trust.freshness(NOW - timedelta(days=365), NOW) == pytest.approx(0.8)
    assert trust.freshness(NOW - timedelta(days=365 * 30), NOW) == pytest.approx(0.6, abs=1e-6)


def test_trust_score_of_a_fresh_place_depends_on_author_prior_only() -> None:
    assert trust.trust_score(0.25, VoteTotals(), NOW, NOW) == 20
    assert trust.trust_score(1.0, VoteTotals(), NOW, NOW) == 50


def test_trust_score_combines_confidence_and_freshness() -> None:
    totals = VoteTotals(present=4.0, present_voters=3)
    fresh = trust.trust_score(1.0, totals, NOW, NOW)
    old = trust.trust_score(1.0, totals, NOW - timedelta(days=365), NOW)
    assert fresh == round(100 * 5 / 6)
    assert old == round(100 * 5 / 6 * 0.8)


def test_trust_score_stays_in_bounds() -> None:
    assert trust.trust_score(0.0, VoteTotals(absent=100.0), NOW, NOW) == 0
    assert trust.trust_score(1.0, VoteTotals(present=10_000.0), NOW, NOW) <= 100


def test_stale_after_180_days_without_confirmation() -> None:
    assert not trust.is_stale(NOW - timedelta(days=180), NOW)
    assert trust.is_stale(NOW - timedelta(days=181), NOW)


def test_no_votes_is_unverified() -> None:
    assert _derive(VoteTotals()) == trust.StatusDecision(PlaceStatus.UNVERIFIED)


def test_expert_prior_counts_as_first_confirmation() -> None:
    assert _derive(VoteTotals(), author_prior=1.0).status is PlaceStatus.PRELIMINARY


def test_preliminary_from_first_confirmations() -> None:
    assert _derive(VoteTotals(present=0.99, present_voters=1)).status is PlaceStatus.UNVERIFIED
    assert _derive(VoteTotals(present=1.0, present_voters=1)).status is PlaceStatus.PRELIMINARY


def test_verified_needs_weight_and_three_distinct_voters() -> None:
    assert _derive(VoteTotals(present=4.0, present_voters=3)).status is PlaceStatus.VERIFIED
    assert _derive(VoteTotals(present=6.0, present_voters=2)).status is PlaceStatus.PRELIMINARY
    assert _derive(VoteTotals(present=3.9, present_voters=5)).status is PlaceStatus.PRELIMINARY


def test_verified_needs_present_to_outweigh_absent_twice() -> None:
    assert _derive(VoteTotals(present=5.0, absent=2.5, present_voters=4)).status is PlaceStatus.PRELIMINARY
    assert _derive(VoteTotals(present=5.0, absent=2.4, present_voters=4)).status is PlaceStatus.VERIFIED


def test_absent_votes_send_to_review_and_open_a_case() -> None:
    decision = _derive(VoteTotals(present=2.0, absent=3.0, present_voters=2))
    assert decision == trust.StatusDecision(PlaceStatus.NEEDS_REVIEW, ModerationTrigger.ABSENT_VOTES)
    assert _derive(VoteTotals(present=3.0, absent=3.0, present_voters=2)).status is PlaceStatus.PRELIMINARY
    assert _derive(VoteTotals(absent=2.9)).status is PlaceStatus.UNVERIFIED


def test_strong_absent_signal_hides() -> None:
    decision = _derive(VoteTotals(present=3.0, absent=6.0, present_voters=2))
    assert decision == trust.StatusDecision(PlaceStatus.HIDDEN, ModerationTrigger.ABSENT_VOTES)
    assert _derive(VoteTotals(present=3.1, absent=6.0, present_voters=2)).status is PlaceStatus.NEEDS_REVIEW


def test_complaints_send_to_review_before_verification_rules() -> None:
    decision = _derive(VoteTotals(present=10.0, present_voters=5), complaints_weight=3.0)
    assert decision == trust.StatusDecision(PlaceStatus.NEEDS_REVIEW, ModerationTrigger.COMPLAINTS)
    assert (
        _derive(VoteTotals(present=10.0, present_voters=5), complaints_weight=2.9).status
        is PlaceStatus.VERIFIED
    )


def test_absent_rules_take_precedence_over_complaints() -> None:
    decision = _derive(VoteTotals(absent=7.0), complaints_weight=5.0)
    assert decision.status is PlaceStatus.HIDDEN


def test_issues_are_never_hidden_or_reviewed_by_absent_votes() -> None:
    totals = VoteTotals(present=2.0, absent=9.0, present_voters=2)
    assert _derive(totals, absent_rules_apply=False).status is PlaceStatus.PRELIMINARY


def test_absent_votes_before_moderator_review_do_not_dispute_again() -> None:
    totals = VoteTotals(present=1.0, absent=7.0, present_voters=1)
    assert _derive(totals, disputing_absent=0.0).status is PlaceStatus.PRELIMINARY
