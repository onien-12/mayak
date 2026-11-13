"""Interest rules (SPEC §23): catalogue, rule tags, profile weight, match, personal interest, score."""

import math

import pytest

from app.domain import interests as rules
from app.domain.enums import AreaKind
from app.domain.interests import Topic


def test_catalogue_order_and_labels() -> None:
    assert [info.slug.value for info in rules.CATALOGUE] == [
        "sea",
        "views",
        "history",
        "architecture",
        "nature",
        "art",
        "music",
        "food",
        "sport",
        "family",
        "learning",
        "fun",
        "unusual",
    ]
    labels = {info.slug: info.label for info in rules.CATALOGUE}
    assert labels[Topic.SEA] == "Море и берег"
    assert labels[Topic.LEARNING] == "Лекции и мастерские"
    assert labels[Topic.UNUSUAL] == "Необычное"
    assert set(rules.LEXICON) == set(Topic)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Маяк на Токаревской кошке", {Topic.SEA}),
        ("Бухта Шамора", {Topic.SEA}),
        ("Форт №7", {Topic.HISTORY}),
        ("Джаз-вечер", {Topic.MUSIC}),
        ("Мастер-класс для детей", {Topic.LEARNING, Topic.FAMILY}),
        ("Лекция об истории флота", {Topic.LEARNING, Topic.HISTORY, Topic.SEA}),
        ("Смотровая площадка на сопке", {Topic.VIEWS}),
        ("Кафе «Чан Ли»", {Topic.FOOD}),
        ("Квиз в баре", {Topic.FUN, Topic.FOOD}),
        ("Заброшенное бомбоубежище", {Topic.UNUSUAL, Topic.HISTORY}),
        ("Ёлка в Ботаническом саду", {Topic.NATURE}),
    ],
)
def test_keyword_lexicon_finds_topics(text: str, expected: set[Topic]) -> None:
    assert rules.keyword_topics(text) == expected


@pytest.mark.parametrize(
    "text",
    ["Фортепианный вечер", "Парковка у ТЦ", "Сквер Чайка", "Сквер Курсантский", "йогурт", "Лестница"],
)
def test_keyword_lexicon_does_not_trip_on_lookalikes(text: str) -> None:
    found = rules.keyword_topics(text)
    assert Topic.HISTORY not in found
    assert Topic.NATURE not in found
    assert Topic.FOOD not in found
    assert Topic.LEARNING not in found
    assert Topic.SPORT not in found


def test_rule_tags_weigh_categories_above_keywords() -> None:
    assert rules.category_tags(rules.place_category_topics("historic")) == {Topic.HISTORY: 0.8}
    assert rules.category_tags(rules.place_category_topics("toilet")) == {}
    assert rules.area_kind_topics(AreaKind.BEACH) == (Topic.SEA,)
    assert rules.area_kind_topics(AreaKind.ISLAND) == (Topic.SEA, Topic.NATURE)
    assert rules.keyword_tags("Форт у моря", None, "") == {Topic.HISTORY: 0.6, Topic.SEA: 0.6}
    merged = rules.merge({Topic.HISTORY: 0.8}, {Topic.HISTORY: 0.6, Topic.SEA: 0.6})
    assert merged == {Topic.HISTORY: 0.8, Topic.SEA: 0.6}


def test_area_inherits_from_the_places_inside() -> None:
    members = [{Topic.FAMILY}, {Topic.FAMILY}, {Topic.VIEWS}, set()]
    assert rules.inside_tags(members) == {Topic.FAMILY: 0.8, Topic.VIEWS: 0.55}
    assert rules.inside_tags([]) == {}
    assert rules.inside_tags([{Topic.SEA}] * 10) == {Topic.SEA: 0.8}


def test_strongest_topics_are_shown_with_a_floor() -> None:
    tags = {
        Topic.ART: 0.5,
        Topic.SEA: 0.9,
        Topic.FUN: 0.2,
        Topic.HISTORY: 0.5,
        Topic.FOOD: 0.3,
        Topic.VIEWS: 0.4,
    }
    assert rules.strongest(tags) == [Topic.SEA, Topic.HISTORY, Topic.ART, Topic.VIEWS]
    assert rules.strongest({Topic.FUN: 0.29}) == []


def test_fingerprint_follows_the_text() -> None:
    assert rules.fingerprint("historic", "Форт", "") == rules.fingerprint("historic", "Форт", None)
    assert rules.fingerprint("historic", "Форт", "") != rules.fingerprint("historic", "Форт №7", "")


def test_user_weight() -> None:
    assert rules.user_weight(True, 0.0) == pytest.approx(0.6)
    assert rules.user_weight(False, 0.0) == 0.0
    assert rules.user_weight(False, 100.0) == pytest.approx(0.4)
    assert rules.user_weight(True, 6.0) == pytest.approx(0.6 + 0.4 * math.tanh(2))
    assert rules.user_weight(False, -3.0) == 0.0
    assert rules.user_weight(True, -3.0) == pytest.approx(0.6 - 0.4 * math.tanh(1))
    assert rules.profile_of([(Topic.SEA, True, 0.0), (Topic.ART, False, -1.0)]) == {
        Topic.SEA: pytest.approx(0.6)
    }
    assert rules.profile_from_topics([Topic.SEA]) == {Topic.SEA: pytest.approx(0.6)}


def test_noticed_needs_a_learned_weight_of_0_15_without_a_choice() -> None:
    assert not rules.is_noticed(False, 0.8)
    assert rules.is_noticed(False, 1.6)
    assert not rules.is_noticed(True, 6.0)


def test_affinity_changes_and_clamp() -> None:
    assert rules.affinity_changes({Topic.SEA: 0.8, Topic.VIEWS: 0.6}, 1.0) == {
        Topic.SEA: 0.8,
        Topic.VIEWS: 0.6,
    }
    assert rules.affinity_changes({Topic.SEA: 0.8}, 0.0) == {}
    assert rules.clamp_affinity(7.5) == 6.0
    assert rules.clamp_affinity(-4.0) == -3.0
    assert rules.review_delta(5, None) == 1.0
    assert rules.review_delta(3, None) == 0.0
    assert rules.review_delta(1, 5) == pytest.approx(-1.6)
    assert rules.review_delta(4, 4) == 0.0


def test_match_and_reasons() -> None:
    profile = {Topic.HISTORY: 0.6, Topic.SEA: 0.3}
    assert rules.match({}, {Topic.HISTORY: 0.8}) == 0.0
    assert rules.match(profile, {}) == 0.0
    tags = {Topic.HISTORY: 0.8, Topic.SEA: 0.6, Topic.FOOD: 1.0}
    assert rules.match(profile, tags) == pytest.approx(1 - (1 - 0.48) * (1 - 0.18))
    assert rules.reasons(profile, tags) == [Topic.HISTORY, Topic.SEA]
    assert rules.reasons(profile, {Topic.FOOD: 1.0}) == []


def test_personal_interest_matches_the_spec_examples() -> None:
    assert rules.personal_interest(80, 0.0) == 72  # «Спортивная набережная» for a lecture lover
    assert rules.personal_interest(40, 1.0) == 70  # a modest location that fits
    assert rules.personal_interest(0, 0.0) == 0
    assert rules.personal_interest(100, 1.0) == 100
    # A location that fits (match ≥ 0.25) is never shown lower than it is for everyone.
    assert rules.personal_interest(60, 0.5) == round(60 + 0.5 * 0.5 * 40)
    assert rules.personal_interest(99, 0.3) == 99
    assert rules.personal_interest(80, 0.125) == round(80 + 0.125 * 0.5 * 20 - 0.5 * 0.1 * 80)
    assert not rules.fits(0.2)
    assert rules.fits(0.25)


def test_quality_and_score() -> None:
    assert rules.area_quality(75) == 0.75
    assert rules.place_quality(80, None) == pytest.approx(0.8)
    assert rules.place_quality(80, 5.0) == pytest.approx(0.9)
    assert rules.place_quality(40, 1.0) == pytest.approx(0.2)
    assert rules.event_quality(trusted_source=True, verified=False) == 1.0
    assert rules.event_quality(trusted_source=False, verified=True) == 1.0
    assert rules.event_quality(trusted_source=False, verified=False) == 0.7
    assert rules.score(0.5, 1.0) == pytest.approx(0.5)
    assert rules.score(0.5, 0.0) == pytest.approx(0.3)
    # A niche courtyard that fits beats a famous square that fits less.
    assert rules.score(0.6, 0.2) > rules.score(0.3, 1.0)


def test_diversity_keeps_three_per_leading_topic() -> None:
    ranked = [(Topic.HISTORY, index) for index in range(5)] + [(Topic.SEA, 10), (Topic.SEA, 11)]
    taken = rules.diversify(ranked, lambda item: item[0], limit=5)
    assert taken == [
        (Topic.HISTORY, 0),
        (Topic.HISTORY, 1),
        (Topic.HISTORY, 2),
        (Topic.SEA, 10),
        (Topic.SEA, 11),
    ]
    # Room left after the cap: the passed-over ones follow, so one interest still fills the list.
    assert rules.diversify(ranked, lambda item: item[0], limit=10)[5:] == [
        (Topic.HISTORY, 3),
        (Topic.HISTORY, 4),
    ]
    only_history = [(Topic.HISTORY, index) for index in range(8)]
    assert rules.diversify(only_history, lambda item: item[0], limit=6) == only_history[:6]
    assert rules.diversify(ranked, lambda item: item[0], limit=2) == [(Topic.HISTORY, 0), (Topic.HISTORY, 1)]


def test_one_result_per_title() -> None:
    assert rules.title_key("Музей «Владивостокская крепость»") == rules.title_key(
        "музей владивостокская крепость"
    )
    assert rules.title_key("Артём") == rules.title_key("артем")
    ranked = ["Артэтаж", "Видовая точка", "артэтаж", "Видовая  точка!", "Маяк"]
    assert rules.without_repeats(ranked, rules.title_key) == ["Артэтаж", "Видовая точка", "Маяк"]


def test_every_second_result_is_a_discovery() -> None:
    famous = [(Topic.HISTORY, f"famous {index}") for index in range(3)] + [
        (Topic.SEA, f"shore {index}") for index in range(3)
    ]
    niche = [(Topic.HISTORY, "niche a"), (Topic.SEA, "niche b"), (Topic.HISTORY, "niche c")]
    ranked = [*famous, *niche]
    taken = rules.arrange(ranked, lambda item: item[0], niche, limit=6)
    # The first discovery comes second; «famous 1» is the third history result, so the cap sends
    # the next places to the shore and keeps «niche c» waiting.
    assert [name for _, name in taken] == ["famous 0", "niche a", "famous 1", "niche b", "shore 0", "shore 1"]
    # With both topics full the rest follows by rank, and discoveries keep their every second place.
    rest = rules.arrange(ranked, lambda item: item[0], niche, limit=9)[6:]
    assert [name for _, name in rest] == ["famous 2", "niche c", "shore 2"]
    assert rules.arrange(ranked, lambda item: item[0], [], limit=6) == rules.diversify(
        ranked, lambda item: item[0], limit=6
    )


def test_one_interest_still_gets_its_discoveries() -> None:
    famous = [(Topic.SPORT, f"famous {index}") for index in range(5)]
    niche = [(Topic.SPORT, f"niche {index}") for index in range(3)]
    taken = rules.arrange([*famous, *niche], lambda item: item[0], niche, limit=8)
    assert [name for _, name in taken] == [
        "famous 0",
        "niche 0",
        "famous 1",
        "niche 1",
        "famous 2",
        "niche 2",
        "famous 3",
        "famous 4",
    ]


def test_at_most_two_locations_of_a_kind_lead() -> None:
    parks = [(Topic.NATURE, f"park {index}", "park") for index in range(4)]
    others = [
        (Topic.SPORT, "embankment", "embankment"),
        (Topic.SPORT, "court", None),
        (Topic.HISTORY, "fort", None),
    ]
    ranked = [*parks, *others]
    taken = rules.arrange(ranked, lambda item: item[0], [], limit=7, area_kind=lambda item: item[2])
    # A full topic gives way before a full kind: the third and fourth parks come last.
    assert [item[1] for item in taken] == [
        "park 0",
        "park 1",
        "embankment",
        "court",
        "fort",
        "park 2",
        "park 3",
    ]
    nature_only = rules.arrange(parks, lambda item: item[0], [], limit=4, area_kind=lambda item: item[2])
    assert nature_only == parks


def test_residents_lead_at_comparable_match() -> None:
    community, imported = rules.Provenance.COMMUNITY, rules.Provenance.IMPORTED
    # At equal match a residents' object of the lowest quality beats an imported one of the highest.
    assert rules.score(0.5, 0.0, community) > rules.score(0.5, 1.0, imported)
    # An imported object overtakes it only with at least 1.2× the match …
    assert rules.score(0.5, 0.0, community) > rules.score(0.59, 1.0, imported)
    assert rules.score(0.5, 0.0, community) < rules.score(0.61, 1.0, imported)
    # … about 1.5× at ordinary qualities.
    assert rules.score(0.4, 0.5, community) > rules.score(0.55, 0.5, imported)
    assert rules.score(0.5, 1.0) == rules.score(0.5, 1.0, community)


def test_provenance_of_places_and_locations() -> None:
    def place(
        *,
        community: bool = False,
        described: bool = False,
        pictured: bool = False,
        usefulness: int | None = None,
    ) -> rules.Provenance:
        return rules.place_provenance(
            community=community, described=described, pictured=pictured, usefulness=usefulness
        )

    assert place(community=True) is rules.Provenance.COMMUNITY
    assert place() is rules.Provenance.BARE
    assert place(described=True) is rules.Provenance.IMPORTED
    assert place(pictured=True) is rules.Provenance.IMPORTED
    assert place(usefulness=60) is rules.Provenance.IMPORTED
    assert place(usefulness=30) is rules.Provenance.BARE
    assert rules.area_provenance(0, 0) is rules.Provenance.BARE
    assert rules.area_provenance(1, 0) is rules.Provenance.COMMUNITY
    assert rules.area_provenance(0, 1) is rules.Provenance.COMMUNITY
    # A bare object needs two of the person's topics, or one the model is sure of.
    one_topic = rules.match({Topic.HISTORY: 0.6}, {Topic.HISTORY: 0.8})
    assert one_topic >= rules.min_match(rules.Provenance.IMPORTED)
    assert one_topic < rules.min_match(rules.Provenance.BARE)
    assert rules.match({Topic.HISTORY: 0.6}, {Topic.HISTORY: 1.0}) < rules.min_match(rules.Provenance.BARE)
    two_topics = rules.match({Topic.HISTORY: 0.6, Topic.SEA: 0.6}, {Topic.HISTORY: 0.8, Topic.SEA: 0.6})
    assert two_topics >= rules.min_match(rules.Provenance.BARE)


def test_discoveries_and_events_inside_locations() -> None:
    assert rules.is_discovery(0)
    assert rules.is_discovery(2)
    assert not rules.is_discovery(3)
    community, imported = rules.Provenance.COMMUNITY, rules.Provenance.IMPORTED
    assert sorted(
        [(imported, 0.6), (community, 0.3), (community, 0.5)],
        key=lambda item: rules.discovery_rank(*item),
    ) == [(community, 0.5), (community, 0.3), (imported, 0.6)]
    assert rules.event_leads(rules.MIN_MATCH)
    assert not rules.event_leads(0.1)


def test_an_imported_discovery_never_takes_the_place_of_a_residents_result() -> None:
    pier, yard, museum = (Topic.SEA, "pier", True), (Topic.SEA, "yard", True), (Topic.SEA, "museum", False)
    cape = (Topic.SEA, "cape", False)
    taken = rules.arrange(
        [pier, yard, museum, cape], lambda item: item[0], [cape], limit=4, by_residents=lambda item: item[2]
    )
    assert [item[1] for item in taken] == ["pier", "yard", "museum", "cape"]
    ours = (Topic.SEA, "cape", True)
    taken = rules.arrange(
        [pier, yard, museum, ours], lambda item: item[0], [ours], limit=4, by_residents=lambda item: item[2]
    )
    assert [item[1] for item in taken] == ["pier", "cape", "yard", "museum"]
