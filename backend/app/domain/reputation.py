"""Reputation rule table (SPEC §4)."""

from dataclasses import dataclass

from app.domain.enums import ReputationReason


@dataclass(frozen=True, slots=True)
class ReputationRule:
    delta: int
    message: str
    daily_cap: int | None = None
    """How many times per 24 hours the reason is rewarded; None means unlimited."""


RULES: dict[ReputationReason, ReputationRule] = {
    ReputationReason.VOTE_CAST: ReputationRule(2, "Участие в проверке точки", daily_cap=10),
    ReputationReason.PLACE_VERIFIED: ReputationRule(10, "Ваша точка подтверждена жителями"),
    ReputationReason.PLACE_PRELIMINARY: ReputationRule(3, "Ваша точка получила первые подтверждения"),
    ReputationReason.ISSUE_RESOLVED: ReputationRule(5, "Проблема, о которой вы сообщили, устранена"),
    ReputationReason.ROUTE_PUBLISHED: ReputationRule(5, "Опубликован авторский маршрут", daily_cap=2),
    ReputationReason.REVIEW_WRITTEN: ReputationRule(1, "Написан отзыв", daily_cap=5),
    ReputationReason.RESPECT_RECEIVED: ReputationRule(3, "Получен респект от другого жителя"),
    ReputationReason.COMPLAINT_UPHELD: ReputationRule(3, "Ваша жалоба подтверждена модератором"),
    ReputationReason.COMPLAINT_DISMISSED: ReputationRule(-1, "Ваша жалоба отклонена модератором"),
    ReputationReason.CONTENT_REJECTED: ReputationRule(-15, "Публикация отклонена или скрыта модератором"),
    ReputationReason.PLACE_HIDDEN_AUTO: ReputationRule(-10, "Точка скрыта: жители сообщают, что её нет"),
    ReputationReason.MODERATION_APPROVED: ReputationRule(4, "Публикация прошла премодерацию"),
}
