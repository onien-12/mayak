"""The deterministic matcher of «Потеряшки» (SPEC §26) and the lifetime of a post."""

from datetime import UTC, date, datetime, timedelta

import pytest

from app.domain import lost_found as rules
from app.domain.lost_found import LostCategory, LostKind, LostState, MatchVerdict, Post
from app.seed.lost_found import ITEMS, SeedLostItem

DAY = date(2026, 11, 10)
SQUARE = (43.1153, 131.8855)
"""Центральная площадь."""


def _lost(title: str, category: LostCategory = LostCategory.WALLET, **extra: object) -> Post:
    values: dict[str, object] = {"point": SQUARE, "radius_m": 1000, "happened_on": DAY, **extra}
    return Post(title=title, category=category, **values)  # type: ignore[arg-type]


def _found(title: str, category: LostCategory = LostCategory.WALLET, **extra: object) -> Post:
    values: dict[str, object] = {
        "point": (43.1170, 131.8855),
        "happened_on": DAY + timedelta(days=1),
        **extra,
    }
    return Post(title=title, category=category, **values)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("first", "second"),
    [
        ("кошелёк чёрный", "Чёрный кошелек"),
        ("черного кошелька", "чёрный кошелёк"),
        ("Ключи", "связка ключей"),
        ("брелок", "с брелоком"),
        ("рыжая кошка", "рыжий"),
    ],
)
def test_word_forms_meet(first: str, second: str) -> None:
    assert rules.keys(first) & rules.keys(second)


def test_service_words_and_short_words_do_not_count() -> None:
    assert rules.keys("Потеряла вчера на остановке у ТЦ") == rules.keys("остановке")
    assert rules.keys("iPhone 13") == frozenset({"iphon", "13"})


def test_the_same_thing_in_other_words_order_is_a_strong_match() -> None:
    fit = rules.fit(_lost("кошелёк чёрный"), _found("Чёрный кошелек"))
    assert fit is not None
    assert (fit.same_category, fit.similar_text, fit.days_after) == (True, True, 1)
    assert fit.distance_m == pytest.approx(189, abs=5)
    assert rules.is_strong(fit, None)
    assert rules.reason(fit, None) == "Та же категория, 200 м от места, на следующий день, похожее описание"


def test_synonyms_are_shortlisted_for_the_model_but_not_announced_on_the_rules_word() -> None:
    fit = rules.fit(_lost("Чёрный кошелёк"), _found("Портмоне тёмное"))
    assert fit is not None
    assert rules.shortlisted(fit)
    assert not fit.similar_text
    assert not rules.is_strong(fit, None)
    assert rules.is_strong(fit, MatchVerdict.LIKELY)
    assert rules.rank(fit, MatchVerdict.LIKELY) > rules.rank(fit, None)
    assert rules.reason(fit, MatchVerdict.LIKELY) == (
        "Та же категория, 200 м от места, на следующий день, похоже по описанию"
    )
    assert not rules.shown(fit, MatchVerdict.UNLIKELY)


def test_colour_alone_does_not_make_a_pair_across_categories() -> None:
    assert rules.fit(_lost("Чёрный кошелёк"), _found("Чёрная сумка", LostCategory.BAG)) is None
    across = rules.fit(_lost("Кошелёк в сумке", LostCategory.BAG), _found("Кошелёк"))
    assert across is not None
    assert not across.same_category


def test_other_needs_shared_words() -> None:
    assert rules.fit(_lost("Синий зонт", LostCategory.OTHER), _found("Варежка", LostCategory.CLOTHES)) is None
    umbrella = rules.fit(_lost("Синий зонт", LostCategory.OTHER), _found("Зонт", LostCategory.OTHER))
    assert umbrella is not None


def test_distance_is_judged_against_how_sure_the_owner_is() -> None:
    far = {"point": (43.1290, 131.8855)}  # ≈ 1.5 km north of the square
    assert rules.fit(_lost("Кошелёк", radius_m=300), _found("Кошелёк", **far)) is None
    within_two_radii = rules.fit(_lost("Кошелёк", radius_m=1000), _found("Кошелёк", **far))
    near = rules.fit(_lost("Кошелёк", radius_m=1000), _found("Кошелёк"))
    assert within_two_radii is not None
    assert near is not None
    assert near.score > within_two_radii.score
    anywhere = rules.fit(_lost("Кошелёк", radius_m=None), _found("Кошелёк", point=(43.02, 131.89)))
    assert anywhere is not None
    assert anywhere.distance_m is None
    assert "от места" not in rules.reason(anywhere, None)


def test_a_thing_is_not_found_before_it_is_lost() -> None:
    assert rules.fit(_lost("Кошелёк"), _found("Кошелёк", happened_on=DAY - timedelta(days=2))) is None
    day_before = rules.fit(_lost("Кошелёк"), _found("Кошелёк", happened_on=DAY - timedelta(days=1)))
    assert day_before is not None
    assert rules.reason(day_before, None).endswith("в тот же день, похожее описание")
    later = rules.fit(_lost("Кошелёк"), _found("Кошелёк", happened_on=DAY + timedelta(days=5)))
    assert later is not None
    assert "через 5 дней" in rules.reason(later, None)


def test_search_without_category_needs_shared_words() -> None:
    query = Post(title="зонтик с уточками")
    assert rules.search_fit(query, _found("Зонтик", LostCategory.OTHER)) is not None
    assert rules.search_fit(query, _found("Связка ключей", LostCategory.KEYS)) is None


def test_search_words_name_a_category() -> None:
    assert rules.guess_category("потерял чёрный кошелёк") is LostCategory.WALLET
    assert rules.guess_category("Рыжая кошка") is LostCategory.PET
    assert rules.guess_category("ключи и кошелёк") is None
    assert rules.guess_category("что-то синее") is None
    query = Post(title="чёрный кошелек")
    synonym = rules.search_fit(query, _found("Портмоне тёмное"))
    assert synonym is not None
    assert synonym.same_category
    assert rules.search_fit(query, _found("Связка ключей", LostCategory.KEYS)) is None
    by_category = Post(title="кошелёк", category=LostCategory.WALLET)
    assert rules.search_fit(by_category, _found("Портмоне")) is not None
    assert rules.search_fit(Post(title=""), _found("Связка ключей", LostCategory.KEYS)) is not None


def test_state_is_computed_from_dates() -> None:
    created = datetime(2026, 11, 1, tzinfo=UTC)
    assert rules.state(created, None, created + timedelta(days=29)) is LostState.ACTIVE
    assert rules.state(created, None, created + timedelta(days=30)) is LostState.EXPIRED
    assert (
        rules.state(created, created + timedelta(days=1), created + timedelta(days=2)) is LostState.RETURNED
    )
    assert rules.expires_at(created) == created + timedelta(days=30)


def _post(spec: SeedLostItem) -> Post:
    today = date(2026, 11, 13)
    return Post(
        title=spec.title,
        description=spec.description,
        category=spec.category,
        point=(spec.lat, spec.lng),
        radius_m=spec.radius_m if spec.kind is LostKind.LOST else None,
        happened_on=today - timedelta(days=spec.days_ago),
    )


def _demo(title: str, kind: LostKind) -> Post:
    return _post(next(spec for spec in ITEMS if spec.title == title and spec.kind is kind))


def test_demo_pairs_meet_and_near_misses_do_not() -> None:
    lost, found = LostKind.LOST, LostKind.FOUND
    keys = rules.fit(_demo("Ключи с брелоком-маяком", lost), _demo("Связка ключей с брелоком", found))
    cat = rules.fit(_demo("Рыжий кот Персик", lost), _demo("Рыжий кот без ошейника", found))
    wallet = rules.fit(_demo("Чёрный кошелёк", lost), _demo("Портмоне тёмное", found))
    assert keys is not None
    assert cat is not None
    assert wallet is not None
    assert rules.is_strong(keys, None)
    assert rules.is_strong(cat, None)
    assert rules.shortlisted(wallet)
    assert not rules.is_strong(wallet, None)
    assert rules.is_strong(wallet, MatchVerdict.LIKELY)
    assert rules.fit(_demo("Белые наушники в кейсе", lost), _demo("Белые наушники", found)) is None
    assert rules.fit(_demo("Синий зонт", lost), _demo("Синий зонт", found)) is None

    # No other demo pair is strong: nobody gets a notification about a stranger's thing.
    strong = {
        (lost_spec.title, found_spec.title)
        for lost_spec in ITEMS
        if lost_spec.kind is lost
        for found_spec in ITEMS
        if found_spec.kind is found
        and (fit := rules.fit(_post(lost_spec), _post(found_spec))) is not None
        and rules.is_strong(fit, None)
    }
    assert strong == {
        ("Ключи с брелоком-маяком", "Связка ключей с брелоком"),
        ("Рыжий кот Персик", "Рыжий кот без ошейника"),
    }
