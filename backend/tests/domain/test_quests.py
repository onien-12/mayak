"""Rules of quests (SPEC §27)."""

from datetime import UTC, datetime, timedelta

import pytest

from app.domain import geo
from app.domain import quests as rules

POINT = (43.11830, 131.88220)


@pytest.mark.parametrize(
    ("given", "accepted"),
    [
        ("  ПОЛЫНЬ-17 ", ["Полынь-17"]),
        ("зеленая", ["Зелёная"]),
        ("Зелёная.", ["зеленая"]),
        ("три   купола", ["Три купола"]),
        ("полынь–17", ["полынь-17"]),
    ],
)
def test_answers_match_after_normalisation(given: str, accepted: list[str]) -> None:
    assert rules.answer_matches(given, accepted)


@pytest.mark.parametrize(
    ("given", "accepted"), [("полынь 17", ["полынь-17"]), ("", [""]), ("синяя", ["зелёная"])]
)
def test_different_answers_do_not_match(given: str, accepted: list[str]) -> None:
    assert not rules.answer_matches(given, accepted)


def test_arrival_forgives_a_little_inaccuracy_only() -> None:
    lat, lng = POINT
    near = (lat + 45 / 111_320, lng)  # about 45 m north
    assert not rules.is_on_site(*near, None, lat, lng, 40)
    assert rules.is_on_site(*near, 10, lat, lng, 40)
    far = (lat + 70 / 111_320, lng)
    assert not rules.is_on_site(*far, 500, lat, lng, 40)


def test_zone_centre_is_moved_off_the_point_and_keeps_it_inside() -> None:
    lat, lng = POINT
    for index in range(200):
        radius = 150 + index
        centre = rules.zone_center(f"quest-stage:{index}", lat, lng, radius)
        distance = geo.haversine_m(*centre, lat, lng)
        assert radius * 0.25 < distance < radius * 0.75
    assert rules.zone_center("quest-stage:7", lat, lng, 300) == rules.zone_center(
        "quest-stage:7", lat, lng, 300
    )
    assert rules.zone_center("quest-stage:7", lat, lng, 300) != rules.zone_center(
        "quest-stage:8", lat, lng, 300
    )


def test_the_riddle_goes_round_the_team_in_joining_order() -> None:
    assert rules.next_lead([5, 9, 2], 5) == 9
    assert rules.next_lead([5, 9, 2], 2) == 5
    assert rules.next_lead([5, 9, 2], 7) == 5
    assert rules.next_lead([], 5) is None


def test_wrong_tries_pause_after_the_limit() -> None:
    now = datetime(2026, 11, 13, tzinfo=UTC)
    assert rules.locked_until(rules.MAX_WRONG_TRIES - 1, now) is None
    assert rules.locked_until(rules.MAX_WRONG_TRIES, now) == now + rules.COOLDOWN
    assert rules.tries_left(2) == rules.MAX_WRONG_TRIES - 2


def test_result_adds_five_minutes_per_hint() -> None:
    start = datetime(2026, 11, 13, tzinfo=UTC)
    assert rules.result_seconds(start, start + timedelta(minutes=40), 0) == 40 * 60
    assert rules.result_seconds(start, start + timedelta(minutes=40), 2) == 50 * 60


def test_join_codes_are_easy_to_read_aloud() -> None:
    code = rules.new_join_code()
    assert len(code) == rules.JOIN_CODE_LENGTH
    assert not set(code) & set("01OI")
    assert rules.normalize_join_code(" ab c12 ") == "ABC12"
