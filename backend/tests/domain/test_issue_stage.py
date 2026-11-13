import pytest

from app.domain import issue_stage
from app.domain.enums import IssueStage


def _next(stage: IssueStage, present_total: float = 0, absent: float = 0, present: float = 0) -> IssueStage:
    return issue_stage.stage_after_votes(
        stage, present_total=present_total, absent_since_change=absent, present_since_change=present
    )


def test_detected_is_confirmed_by_enough_present_weight() -> None:
    assert _next(IssueStage.DETECTED, present_total=1.9) is IssueStage.DETECTED
    assert _next(IssueStage.DETECTED, present_total=2.0) is IssueStage.CONFIRMED


def test_confirmation_only_applies_to_detected() -> None:
    assert _next(IssueStage.FORWARDED, present_total=10) is IssueStage.FORWARDED
    assert _next(IssueStage.IN_PROGRESS, present_total=10) is IssueStage.IN_PROGRESS


@pytest.mark.parametrize(
    "stage", [IssueStage.DETECTED, IssueStage.CONFIRMED, IssueStage.FORWARDED, IssueStage.IN_PROGRESS]
)
def test_any_open_stage_is_resolved_by_absent_votes(stage: IssueStage) -> None:
    assert _next(stage, absent=3.0) is IssueStage.RESOLVED


def test_resolution_needs_enough_weight_and_majority_since_last_change() -> None:
    assert _next(IssueStage.CONFIRMED, absent=2.9) is IssueStage.CONFIRMED
    assert _next(IssueStage.CONFIRMED, absent=3.0, present=3.0) is IssueStage.CONFIRMED
    assert _next(IssueStage.CONFIRMED, absent=3.5, present=3.0) is IssueStage.RESOLVED


def test_resolution_wins_over_confirmation() -> None:
    assert _next(IssueStage.DETECTED, present_total=2.5, absent=4.0, present=2.5) is IssueStage.RESOLVED


def test_resolved_is_terminal_for_votes() -> None:
    assert _next(IssueStage.RESOLVED, present_total=50, present=50) is IssueStage.RESOLVED
    assert not issue_stage.is_open(IssueStage.RESOLVED)
    assert issue_stage.is_open(IssueStage.IN_PROGRESS)


def test_every_stage_has_a_russian_label() -> None:
    assert set(issue_stage.STAGE_LABELS) == set(IssueStage)
