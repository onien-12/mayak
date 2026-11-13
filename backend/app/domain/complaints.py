"""Complaint weights (SPEC §5)."""

from app.domain.enums import ComplaintReason, TargetType

REASON_WEIGHTS: dict[ComplaintReason, float] = {
    ComplaintReason.INACCURATE: 1.0,
    ComplaintReason.OUTDATED: 0.8,
    ComplaintReason.DUPLICATE: 0.6,
    ComplaintReason.SPAM: 1.2,
    ComplaintReason.OFFENSIVE: 1.2,
    ComplaintReason.RULES: 1.0,
    ComplaintReason.FRAUD: 1.5,
    ComplaintReason.IMPASSABLE: 1.0,
}

ROUTE_ONLY_REASONS = frozenset({ComplaintReason.IMPASSABLE})


def complaint_weight(reporter_weight: float, reason: ComplaintReason) -> float:
    return reporter_weight * REASON_WEIGHTS[reason]


def reason_applies(reason: ComplaintReason, target_type: TargetType) -> bool:
    return reason not in ROUTE_ONLY_REASONS or target_type is TargetType.ROUTE
