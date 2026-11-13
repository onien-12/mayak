"""Attribute coercion, complaint weights, moderation risk and the reputation table."""

import pytest

from app.domain import attributes, complaints, moderation_risk
from app.domain.enums import ComplaintReason, Layer, ReputationReason, TargetType, UserLevel
from app.domain.reputation import RULES

FIELDS = [
    {"key": "free", "label": "Бесплатно", "type": "boolean"},
    {"key": "price", "label": "Цена", "type": "number"},
    {"key": "hours", "label": "Режим", "type": "text"},
    {
        "key": "condition",
        "label": "Состояние",
        "type": "select",
        "options": [{"value": "good", "label": "Хорошее"}, {"value": "bad", "label": "Плохое"}],
    },
]


def test_attributes_are_coerced_and_unknown_keys_dropped() -> None:
    raw = {
        "free": "да",
        "price": "30",
        "hours": " 08:00–21:00 ",
        "condition": "good",
        "unknown": 1,
        "x": None,
    }
    assert attributes.coerce_attributes(FIELDS, raw) == {
        "free": True,
        "price": 30,
        "hours": "08:00–21:00",
        "condition": "good",
    }


def test_empty_values_are_dropped() -> None:
    assert attributes.coerce_attributes(FIELDS, {"hours": "", "price": None}) == {}
    assert attributes.coerce_attributes(FIELDS, None) == {}


@pytest.mark.parametrize(
    ("key", "value"), [("free", "maybe"), ("price", "дорого"), ("price", True), ("condition", "perfect")]
)
def test_wrong_types_are_rejected_with_the_field_key(key: str, value: object) -> None:
    with pytest.raises(attributes.InvalidAttributeError) as error:
        attributes.coerce_attributes(FIELDS, {key: value})
    assert error.value.key == key


def test_attr_filters() -> None:
    filters = attributes.parse_attr_filters("free:true, price:30")
    assert filters == {"free": "true", "price": "30"}
    assert attributes.matches_filters({"free": True, "price": 30.0}, filters)
    assert not attributes.matches_filters({"free": False, "price": 30}, filters)
    assert not attributes.matches_filters({"price": 30}, filters)
    assert attributes.matches_filters({"anything": 1}, {})


def test_malformed_attr_filter() -> None:
    with pytest.raises(ValueError):  # noqa: PT011
        attributes.parse_attr_filters("free")


def test_complaint_weight_is_reporter_weight_times_reason_weight() -> None:
    assert complaints.complaint_weight(2.0, ComplaintReason.FRAUD) == 3.0
    assert complaints.complaint_weight(0.5, ComplaintReason.DUPLICATE) == 0.3
    assert set(complaints.REASON_WEIGHTS) == set(ComplaintReason)


def test_impassable_applies_to_routes_only() -> None:
    assert complaints.reason_applies(ComplaintReason.IMPASSABLE, TargetType.ROUTE)
    assert not complaints.reason_applies(ComplaintReason.IMPASSABLE, TargetType.PLACE)
    assert complaints.reason_applies(ComplaintReason.SPAM, TargetType.PLACE)


def _risk(**overrides: object) -> int:
    params: dict[str, object] = {
        "complaints_weight": 0.0,
        "absent_weight": 0.0,
        "flags_count": 0,
        "author_level": UserLevel.EXPERT,
        "layer": Layer.TOURISM,
    }
    params.update(overrides)
    return moderation_risk.risk_score(**params)  # type: ignore[arg-type]


def test_risk_grows_with_each_signal() -> None:
    assert _risk() == 0
    assert _risk(author_level=UserLevel.NEWCOMER) > _risk(author_level=UserLevel.RESIDENT) > _risk()
    assert _risk(complaints_weight=3.0) > _risk(complaints_weight=1.0)
    assert _risk(absent_weight=4.0) > _risk()
    assert _risk(flags_count=2) > _risk(flags_count=1)
    assert _risk(layer=Layer.ISSUE) == _risk(layer=Layer.EVENT) > _risk(layer=Layer.INFRASTRUCTURE)
    assert _risk(layer=None) == 0


def test_risk_is_clamped_to_100() -> None:
    worst = _risk(
        complaints_weight=1000,
        absent_weight=1000,
        flags_count=50,
        author_level=UserLevel.NEWCOMER,
        layer=Layer.ISSUE,
    )
    assert worst == 100


@pytest.mark.parametrize(
    ("reason", "delta", "cap"),
    [
        (ReputationReason.VOTE_CAST, 2, 10),
        (ReputationReason.PLACE_VERIFIED, 10, None),
        (ReputationReason.PLACE_PRELIMINARY, 3, None),
        (ReputationReason.ISSUE_RESOLVED, 5, None),
        (ReputationReason.ROUTE_PUBLISHED, 5, 2),
        (ReputationReason.REVIEW_WRITTEN, 1, 5),
        (ReputationReason.RESPECT_RECEIVED, 3, None),
        (ReputationReason.COMPLAINT_UPHELD, 3, None),
        (ReputationReason.COMPLAINT_DISMISSED, -1, None),
        (ReputationReason.CONTENT_REJECTED, -15, None),
        (ReputationReason.PLACE_HIDDEN_AUTO, -10, None),
        (ReputationReason.MODERATION_APPROVED, 4, None),
    ],
)
def test_reputation_rule_table_matches_the_specification(
    reason: ReputationReason, delta: int, cap: int | None
) -> None:
    assert (RULES[reason].delta, RULES[reason].daily_cap) == (delta, cap)
    assert RULES[reason].message


def test_every_reason_has_a_rule() -> None:
    assert set(RULES) == set(ReputationReason)
