"""User levels derived from reputation and the privileges attached to them (SPEC §2)."""

from dataclasses import dataclass
from datetime import timedelta

from app.domain.enums import PlaceStatus, UserLevel, UserRole


@dataclass(frozen=True, slots=True)
class LevelRule:
    level: UserLevel
    min_reputation: int | None
    vote_weight: float
    daily_places: int
    initial_status: PlaceStatus


LEVEL_RULES: tuple[LevelRule, ...] = (
    LevelRule(UserLevel.NEWCOMER, None, 0.5, 3, PlaceStatus.PENDING),
    LevelRule(UserLevel.RESIDENT, 10, 1.0, 10, PlaceStatus.UNVERIFIED),
    LevelRule(UserLevel.TRUSTED, 50, 1.5, 30, PlaceStatus.UNVERIFIED),
    LevelRule(UserLevel.EXPERT, 150, 2.0, 100, PlaceStatus.PRELIMINARY),
)
"""Ordered from the lowest level to the highest."""

STAFF_VOTE_WEIGHT = 3.0
FRESH_ACCOUNT_AGE = timedelta(hours=24)
FRESH_ACCOUNT_FACTOR = 0.5
AUTHOR_PRIOR_FACTOR = 0.5

_RULE_BY_LEVEL = {rule.level: rule for rule in LEVEL_RULES}
_RANK_BY_LEVEL = {rule.level: rank for rank, rule in enumerate(LEVEL_RULES)}


def level_for(reputation: int) -> UserLevel:
    """Highest level whose reputation threshold is reached."""
    level = LEVEL_RULES[0].level
    for rule in LEVEL_RULES[1:]:
        if rule.min_reputation is not None and reputation >= rule.min_reputation:
            level = rule.level
    return level


def level_rank(level: UserLevel) -> int:
    return _RANK_BY_LEVEL[level]


def is_staff(role: UserRole) -> bool:
    return role in (UserRole.MODERATOR, UserRole.ADMIN)


def _privilege_rule(level: UserLevel, role: UserRole) -> LevelRule:
    """Staff publish and are limited like experts regardless of their reputation."""
    return _RULE_BY_LEVEL[UserLevel.EXPERT] if is_staff(role) else _RULE_BY_LEVEL[level]


def level_weight(level: UserLevel, role: UserRole) -> float:
    return STAFF_VOTE_WEIGHT if is_staff(role) else _RULE_BY_LEVEL[level].vote_weight


def vote_weight(level: UserLevel, role: UserRole, account_age: timedelta) -> float:
    """Level weight, halved for accounts younger than 24 hours."""
    weight = level_weight(level, role)
    if account_age < FRESH_ACCOUNT_AGE and not is_staff(role):
        weight *= FRESH_ACCOUNT_FACTOR
    return weight


def author_prior(level: UserLevel, role: UserRole) -> float:
    """Weight of the author's own word about a place, frozen at creation."""
    return level_weight(level, role) * AUTHOR_PRIOR_FACTOR


def initial_status(level: UserLevel, role: UserRole) -> PlaceStatus:
    return _privilege_rule(level, role).initial_status


def daily_place_limit(level: UserLevel, role: UserRole) -> int:
    return _privilege_rule(level, role).daily_places


def publishes_directly(level: UserLevel, role: UserRole) -> bool:
    """False for cold mode, where every publication is pre-moderated."""
    return initial_status(level, role) is not PlaceStatus.PENDING


def can_send_respect(level: UserLevel, role: UserRole) -> bool:
    return is_staff(role) or level_rank(level) >= level_rank(UserLevel.RESIDENT)


def next_level(reputation: int) -> tuple[UserLevel, int] | None:
    """The next level and the reputation it requires; None at the top level."""
    for rule in LEVEL_RULES[1:]:
        if rule.min_reputation is not None and reputation < rule.min_reputation:
            return rule.level, rule.min_reputation
    return None
