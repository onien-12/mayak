"""Area rules (SPEC §17, §18) that have no geometry in them."""

from app.domain import areas as rules


def test_small_imported_territory_with_nothing_by_residents_is_background() -> None:
    assert rules.is_bare_background(True, 0, 0, 0)
    assert rules.is_bare_background(True, rules.BACKGROUND_MAX_PLACES, 0, 0)
    # Bigger, or with anything residents made inside, or not imported at all: an ordinary location.
    assert not rules.is_bare_background(True, rules.BACKGROUND_MAX_PLACES + 1, 0, 0)
    assert not rules.is_bare_background(True, 1, 1, 0)
    assert not rules.is_bare_background(True, 0, 0, 1)
    assert not rules.is_bare_background(False, 0, 0, 0)
