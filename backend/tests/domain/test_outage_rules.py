"""Address normalisation, outage presentation rules and the external-source trust baseline."""

from datetime import UTC, datetime

import pytest

from app.domain import addresses, outages, trust
from app.domain.enums import (
    ExternalSourceId,
    InfoSource,
    IssueSeverity,
    IssueStage,
    OutageResource,
    PlaceStatus,
)
from app.domain.outages import House
from app.domain.trust import VoteTotals

NOW = datetime(2026, 11, 11, tzinfo=UTC)
HOUSES = (
    House("Тухачевского ул. 24", 43.1575, 131.9307),
    House("Тухачевского ул. 26", 43.1581, 131.9312),
    House("Тухачевского ул. 28", 43.1587, 131.9318),
    House("Сельская ул. 8", 43.1321, 131.9388),
)


@pytest.mark.parametrize(
    ("text", "tokens"),
    [
        ("Тухачевского ул. 24", ["тухачевского", "24"]),
        ("ул. Тухачевского, д. 24", ["тухачевского", "24"]),
        ("Океанский пр-т 100", ["океанский", "100"]),
        ("Адмирала Угрюмова 48/49", ["адмирала", "угрюмова", "48/49"]),
        ("  Зелёный   бульвар 30 ", ["зеленый", "бульвар", "30"]),
        ("", []),
    ],
)
def test_address_tokens(text: str, tokens: list[str]) -> None:
    assert addresses.address_tokens(text) == tokens


def test_address_key_and_patterns() -> None:
    assert addresses.address_key("Сельская ул. 8") == " сельская 8 "
    assert addresses.token_pattern("8") == "% 8 %"
    assert addresses.token_pattern("сельск") == "% сельск%"


@pytest.mark.parametrize(
    ("address", "street"),
    [
        ("Сельская ул. 8", "Сельская ул."),
        ("Русская ул. 46а", "Русская ул."),
        ("Зелёный бульвар", "Зелёный бульвар"),
    ],
)
def test_street_of(address: str, street: str) -> None:
    assert addresses.street_of(address) == street


def test_title_lists_streets_by_house_count() -> None:
    assert (
        outages.outage_title(OutageResource.COLD_WATER, HOUSES)
        == "Нет холодной воды: Тухачевского ул., Сельская ул."
    )
    many = (
        *HOUSES,
        House("Кирова ул. 1", 43.17, 131.91),
        House("Русская ул. 2", 43.16, 131.91),
        House("Нейбута ул. 3", 43.11, 131.96),
    )
    assert outages.street_summary(many).endswith("и ещё 3 улицы")
    assert outages.street_summary(HOUSES[:1]) == "Тухачевского ул."
    assert set(outages.RESOURCE_TITLES) == set(OutageResource)


def test_anchor_is_a_real_house_and_radius_reaches_the_farthest() -> None:
    anchor = outages.anchor_house(HOUSES)
    assert anchor in HOUSES[:3]
    radius = outages.affected_radius_m(anchor, HOUSES)
    assert 2500 < radius <= outages.MAX_RADIUS_M
    assert outages.affected_radius_m(HOUSES[0], HOUSES[:1]) == outages.MIN_RADIUS_M


@pytest.mark.parametrize(
    ("count", "severity"),
    [
        (1, IssueSeverity.LOW),
        (9, IssueSeverity.LOW),
        (10, IssueSeverity.MEDIUM),
        (49, IssueSeverity.MEDIUM),
        (50, IssueSeverity.HIGH),
    ],
)
def test_severity_by_house_count(count: int, severity: IssueSeverity) -> None:
    assert outages.severity_for(count) is severity


def test_named_organisation_makes_the_outage_official() -> None:
    assert outages.source_and_stage("Водоканал") == (InfoSource.OFFICIAL, IssueStage.IN_PROGRESS)
    assert outages.source_and_stage(None) == (InfoSource.USER, IssueStage.CONFIRMED)


def test_external_source_starts_verified_but_can_still_be_disputed() -> None:
    baseline = trust.with_external_baseline(VoteTotals(), ExternalSourceId.VL_RU_OFF)
    assert (baseline.present, baseline.present_voters) == (
        trust.VERIFIED_PRESENT,
        trust.VERIFIED_MIN_VOTERS,
    )

    def status(totals: VoteTotals, **extra: object) -> PlaceStatus:
        params = {
            "totals": totals,
            "author_prior": 0.25,
            "complaints_weight": 0.0,
            "disputing_absent": totals.absent,
        }
        return trust.derive_status(**{**params, **extra}).status  # type: ignore[arg-type]

    assert status(baseline) is PlaceStatus.VERIFIED
    assert trust.trust_score(0.25, baseline, NOW, NOW) > trust.trust_score(0.25, VoteTotals(), NOW, NOW)
    disputed = trust.with_external_baseline(VoteTotals(absent=5.0), ExternalSourceId.VL_RU_OFF)
    assert status(disputed) is PlaceStatus.NEEDS_REVIEW
    assert (
        status(trust.with_external_baseline(VoteTotals(absent=9.0), ExternalSourceId.VL_RU_OFF))
        is PlaceStatus.HIDDEN
    )
    assert status(baseline, complaints_weight=3.0) is PlaceStatus.NEEDS_REVIEW
    assert status(baseline, flagged_by_ai=True) is PlaceStatus.NEEDS_REVIEW
