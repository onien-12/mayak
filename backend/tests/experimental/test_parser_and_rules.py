"""External reviews experiment: pure parts on saved (anonymised) page fixtures."""

import json
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.domain.enums import Layer
from app.services.experimental.external_reviews import client, matcher, parser, rules
from app.services.experimental.external_reviews.matcher import Subject
from app.services.experimental.external_reviews.parser import Organization, UnexpectedPageError

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "yandex"
NOW = datetime(2026, 11, 11, 3, 0, tzinfo=UTC)
OCEANARIUM = (43.01421, 131.9302)
REVIEWER_DATA = (
    "Иван Тестовый",
    "Мария Пример",
    "test-public-id",
    "get-yapic",
    "Знаток города",
    "avatarUrl",
    "professionLevel",
)


def page(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def organization(
    title: str = "Приморский океанариум", lat: float = 43.014277, lng: float = 131.930319
) -> Organization:
    return Organization("1", title, lat, lng, 5.0, 10, 5, ())


def test_search_page_gives_ranked_unique_organisations() -> None:
    found = parser.parse_search(page("search.html"))
    assert [item.org_id for item in found] == ["211680110089", "1066540287"]
    ocean, cafe = found
    assert (ocean.title, ocean.lat, ocean.lng) == ("Приморский океанариум", 43.014277, 131.930319)
    assert (ocean.rating, ocean.ratings_count, ocean.reviews_count) == (5.0, 37615, 13577)
    assert ocean.photos == (
        "https://avatars.mds.yandex.net/get-altay/918124/2a00000a/L",
        "https://avatars.mds.yandex.net/get-altay/14079384/2a00000b/L",
    ), "only https images of the source's own host, deduplicated"
    assert cafe.title == "Кафе Нерпа", "markup is reduced to plain text"


def test_reviews_keep_rating_text_and_date_only() -> None:
    reviews = parser.parse_reviews(page("reviews.html"))
    assert [review.rating for review in reviews] == [5, 4, None]
    first = reviews[0]
    assert first.text == "Отличное место!\nБелухи прекрасны."
    assert first.published_at == datetime(2026, 9, 5, 11, 12, 17, 244000, tzinfo=UTC)
    assert len(reviews[1].text) == parser.MAX_TEXT_LENGTH
    assert reviews[1].text.endswith("…")
    assert reviews[2].published_at is None
    assert set(asdict(first)) == {"rating", "text", "published_at"}
    dumped = repr(reviews)
    assert not any(marker in dumped for marker in REVIEWER_DATA)


def test_captcha_and_foreign_pages_are_unexpected() -> None:
    with pytest.raises(UnexpectedPageError, match="checkcaptcha"):
        parser.parse_search(page("captcha.html"))
    with pytest.raises(UnexpectedPageError):
        parser.parse_reviews("<html><body>Страница не найдена</body></html>")
    broken = '<script type="application/json" class="state-view">{not json</script>'
    with pytest.raises(UnexpectedPageError, match="broken state"):
        parser.parse_search(broken)


def subject(title: str = "Приморский океанариум", **options: object) -> Subject:
    return Subject(title, *OCEANARIUM, **options)


def test_unique_exact_near_result_among_the_top_five_matches() -> None:
    assert matcher.match(subject(), [organization()]) is not None
    assert matcher.match(subject(), []) is None
    others = [organization(f"Кафе {index}") for index in range(4)]
    assert matcher.match(subject(), [*others, organization()]) is not None, "fifth result"
    assert matcher.match(subject(), [*others, organization("Кафе 5"), organization()]) is None, "sixth"
    far = organization(lat=OCEANARIUM[0] + 0.005)
    assert matcher.match(subject(), [far]) is None, "about 550 m away from a place"


def test_tolerance_grows_with_the_size_of_the_object() -> None:
    assert matcher.tolerance_m(subject()) == matcher.PLACE_TOLERANCE_M
    assert matcher.tolerance_m(subject("Золотой мост")) == matcher.LONG_OBJECT_TOLERANCE_M
    assert matcher.tolerance_m(subject("Спортивная набережная")) == matcher.LONG_OBJECT_TOLERANCE_M
    assert matcher.tolerance_m(subject(area_radius_m=230)) == 230 + matcher.AREA_MARGIN_M
    hill = Subject("Сопка Орлиное Гнездо", 43.1179, 131.8996, area_radius_m=230)
    eagle = Organization("194230563980", "Орлиное гнездо", 43.121323, 131.896751, 4.9, 1, 1, ())
    assert matcher.match(hill, [eagle]) is None, "large area is not evidence of identity"
    assert matcher.linked(hill, [eagle], eagle.org_id) == eagle, "explicit ID supports a shifted pin"


def test_a_generic_kind_is_not_evidence_of_identity() -> None:
    lookout = Subject("Смотровая Нагорного парка", 43.1178, 131.9222)
    platform = Organization("2159581001", "Смотровая площадка", 43.116994, 131.923989, 5.0, 1, 1, ())
    assert matcher.match(lookout, [platform]) is None
    distant = Organization("1", "Смотровая площадка", 43.1155, 131.9222, 5.0, 1, 1, ())
    assert matcher.match(lookout, [distant]) is None, "about 260 m"


def test_a_place_never_falls_back_to_the_organisation_of_its_area() -> None:
    park = Organization("18320009280", "Нагорный парк", 43.1180, 131.9224, 5.0, 1, 1, ())
    lookout = Subject("Смотровая Нагорного парка", 43.1178, 131.9222, parent_title="Нагорный парк")
    assert matcher.match(lookout, [park]) is None
    building = subject(parent_title="Приморский океанариум")
    assert matcher.match(building, [organization()]) is not None, "the place carries the area's own name"


def test_eligible_places_are_named() -> None:
    assert rules.is_eligible_place(Layer.TOURISM, "Токаревский маяк", "История")
    assert rules.is_eligible_place(Layer.INFRASTRUCTURE, "Библиотека им. Горького", "Библиотека")
    assert not rules.is_eligible_place(Layer.INFRASTRUCTURE, "Детская площадка", "Детская площадка")
    assert not rules.is_eligible_place(Layer.INFRASTRUCTURE, "Общественный туалет", "Туалет")
    assert not rules.is_eligible_place(Layer.TOURISM, "Видовая точка", "Видовая площадка")
    assert not rules.is_eligible_place(Layer.EVENT, "Концерт в парке", "Культура")


def test_terms_of_the_experiment() -> None:
    assert rules.is_fresh(NOW - timedelta(days=6), NOW)
    assert not rules.is_fresh(NOW - timedelta(days=7), NOW)
    assert not rules.may_retry_failed(NOW - timedelta(minutes=59), NOW)
    assert rules.may_retry_failed(NOW - timedelta(hours=1), NOW)
    assert rules.has_budget(rules.DAILY_REQUEST_CAP - rules.REQUESTS_PER_FETCH)
    assert not rules.has_budget(rules.DAILY_REQUEST_CAP - 1)
    assert rules.has_budget(1, 2, cap=3)
    assert not rules.has_budget(2, 2, cap=3)


def test_search_url_carries_only_the_title_the_city_and_the_point() -> None:
    url = client.search_url("Нагорный парк", 43.1181, 131.9225)
    assert url == (
        "https://yandex.ru/maps/75/vladivostok/search/%D0%9D%D0%B0%D0%B3%D0%BE%D1%80%D0%BD%D1%8B%D0%B9"
        "%20%D0%BF%D0%B0%D1%80%D0%BA%20%D0%92%D0%BB%D0%B0%D0%B4%D0%B8%D0%B2%D0%BE%D1%81%D1%82%D0%BE%D0%BA"
        "/?ll=131.922500%2C43.118100&z=16"
    )
    assert client.search_query("Владивостокская крепость") == "Владивостокская крепость"
    assert client.reviews_url("42") == "https://yandex.ru/maps/org/42/reviews/"


def state_page(state: object) -> str:
    return '<script type="application/json" class="state-view">' + json.dumps(state) + "</script>"


@pytest.mark.parametrize("state", [{}, {"reviewResults": {}}, {"reviewResults": {"reviews": {}}}])
def test_missing_or_changed_reviews_are_not_successfully_empty(state: object) -> None:
    with pytest.raises(UnexpectedPageError):
        parser.parse_reviews(state_page(state))


def test_reviews_are_bound_to_the_requested_organisation() -> None:
    state = [
        {"id": "2", "reviewResults": {"reviews": [{"businessId": "2", "text": "Other place"}]}},
        {"id": "1", "reviewResults": {"reviews": []}},
        {"id": "1", "reviewResults": {"reviews": [{"businessId": "1", "text": "Right place"}]}},
    ]
    assert [r.text for r in parser.parse_reviews(state_page(state), "1")] == ["Right place"]
    with pytest.raises(UnexpectedPageError):
        parser.parse_reviews(state_page(state), "3")
    state[-1]["reviewResults"]["reviews"][0]["businessId"] = "2"
    with pytest.raises(UnexpectedPageError, match="business mismatch"):
        parser.parse_reviews(state_page(state), "1")


def test_truly_empty_reviews_are_different_from_inconsistent_counts() -> None:
    html = state_page({"id": "1", "reviewResults": {"reviews": []}})
    assert parser.parse_reviews(html, "1", expected_count=0) == []
    with pytest.raises(UnexpectedPageError):
        parser.parse_reviews(html, "1", expected_count=10)


def test_duplicate_reviews_and_fractional_ratings() -> None:
    raw = {"reviewId": "1", "text": "Example", "rating": 4.9}
    html = state_page({"reviewResults": {"reviews": [raw, raw]}})
    [review] = parser.parse_reviews(html)
    assert review.rating is None


def test_search_distinguishes_empty_results_from_changed_page() -> None:
    assert parser.parse_search(state_page({"results": {"items": []}})) == []
    with pytest.raises(UnexpectedPageError):
        parser.parse_search(state_page({"different": []}))


def test_changed_review_text_shape_is_not_silently_discarded() -> None:
    html = state_page({"reviewResults": {"reviews": [{"text": {"value": "Changed layout"}}]}})
    with pytest.raises(UnexpectedPageError, match="malformed review text"):
        parser.parse_reviews(html)
