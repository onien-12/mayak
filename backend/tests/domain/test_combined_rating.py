import math

import pytest

from app.domain.combined_rating import RatingPart, combine, weight

OURS = RatingPart("mayak", 3.0, 1)


def test_weight_grows_with_the_log_of_the_count_and_ours_counts_double() -> None:
    assert weight(RatingPart("yandex", 5.0, 9)) == pytest.approx(1.0)
    assert weight(RatingPart("yandex", 5.0, 999)) == pytest.approx(3.0)
    assert weight(RatingPart("google", 4.0, None)) == 1.0
    assert weight(RatingPart("mayak", 4.0, 9)) == pytest.approx(2.0)
    assert weight(RatingPart("2gis", 4.0, 0)) == 0


def test_blend_of_ours_and_the_sources() -> None:
    yandex = RatingPart("yandex", 5.0, 37615)
    blended = combine(OURS, [yandex, RatingPart("google", 4.0, None)])
    own_w, yandex_w = 2 * math.log10(2), math.log10(37616)
    expected = (3.0 * own_w + 5.0 * yandex_w + 4.0) / (own_w + yandex_w + 1.0)
    assert blended.value == round(expected, 1) == 4.6
    assert blended.count == 37616, "unknown counts add nothing"
    assert [part.source for part in blended.parts] == ["mayak", "yandex", "google"]


def test_ours_alone_or_nothing_is_no_blend() -> None:
    assert combine(OURS, []) is None
    assert combine(None, []) is None
    assert combine(OURS, [RatingPart("2gis", 4.0, 0)]) is None, "a part without ratings weighs nothing"


def test_sources_without_ours_and_the_range() -> None:
    blended = combine(None, [RatingPart("2gis", 4.86, 1496)])
    assert (blended.value, blended.count, len(blended.parts)) == (4.9, 1496, 1)
    assert combine(None, [RatingPart("google", 0.4, 3)]).value == 1.0
