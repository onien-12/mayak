"""Rules for texts from free sources and the travel guide's trust baseline."""

import pytest

from app.domain import free_text, trust
from app.domain.enums import ExternalSourceId, PlaceStatus
from app.domain.trust import VoteTotals


@pytest.mark.parametrize(
    ("current", "credited", "written_by_import", "replaces_imports", "allowed"),
    [
        ("", False, False, False, True),
        ("   ", False, False, False, True),
        ("Текст жителя", False, False, True, False),
        ("арка", False, True, True, True),
        ("арка", False, True, False, False),
        ("", True, False, True, False),
    ],
)
def test_who_may_fill_a_description(
    current: str, credited: bool, written_by_import: bool, replaces_imports: bool, allowed: bool
) -> None:
    assert (
        free_text.may_fill_description(
            current, credited=credited, written_by_import=written_by_import, replaces_imports=replaces_imports
        )
        is allowed
    )


def test_clip_at_sentence() -> None:
    assert free_text.clip_at_sentence("Коротко.", 100) == "Коротко."
    assert free_text.clip_at_sentence("Первое. Второе предложение длиннее.", 20) == "Первое."
    assert (
        free_text.clip_at_sentence("Г. Владивосток основан в 1860 г. Дальше.", 36)
        == "Г. Владивосток основан в 1860 г."
    )
    clipped = free_text.clip_at_sentence("одно очень длинное предложение без точки " * 5, 30)
    assert clipped.endswith("…")
    assert len(clipped) <= 30


def test_single_line() -> None:
    assert free_text.single_line("А Б\t\n В\u0007") == "А Б В"


def test_a_travel_guide_starts_preliminary_and_weighs_more_than_a_map() -> None:
    guide = trust.with_external_baseline(VoteTotals(), ExternalSourceId.WIKIVOYAGE)
    osm = trust.with_external_baseline(VoteTotals(), ExternalSourceId.OSM)
    assert osm.present < guide.present < trust.VERIFIED_PRESENT
    assert trust.imported_status(ExternalSourceId.WIKIVOYAGE, 0.25) is PlaceStatus.PRELIMINARY
