"""Issue lifecycle driven by verification votes (SPEC §3.3)."""

from app.domain.enums import IssueStage

CONFIRM_PRESENT = 2.0
RESOLVE_ABSENT = 3.0

STAGE_LABELS: dict[IssueStage, str] = {
    IssueStage.DETECTED: "Обнаружена",
    IssueStage.CONFIRMED: "Подтверждена жителями",
    IssueStage.FORWARDED: "Передана ответственным службам",
    IssueStage.IN_PROGRESS: "В работе",
    IssueStage.RESOLVED: "Устранена",
}


def is_open(stage: IssueStage) -> bool:
    return stage is not IssueStage.RESOLVED


def stage_after_votes(
    stage: IssueStage,
    *,
    present_total: float,
    absent_since_change: float,
    present_since_change: float,
) -> IssueStage:
    """Stage the community votes move an issue to; returns the same stage when nothing changes.

    Resolution only counts votes cast after the last stage change, so old "still there"
    confirmations do not block residents from closing a fixed problem.
    """
    if stage is IssueStage.RESOLVED:
        return stage
    if absent_since_change >= RESOLVE_ABSENT and absent_since_change > present_since_change:
        return IssueStage.RESOLVED
    if stage is IssueStage.DETECTED and present_total >= CONFIRM_PRESENT:
        return IssueStage.CONFIRMED
    return stage
