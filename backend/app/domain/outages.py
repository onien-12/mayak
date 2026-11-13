"""Presentation rules for utility outages imported from VL.ru (SPEC §15)."""

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

from app.domain import geo
from app.domain.addresses import street_of
from app.domain.enums import InfoSource, IssueSeverity, IssueStage, OutageResource

MIN_RADIUS_M = 60
MAX_RADIUS_M = 3000
HIGH_SEVERITY_HOUSES = 50
MEDIUM_SEVERITY_HOUSES = 10
TITLE_STREETS = 2
MAX_TITLE_LENGTH = 120

RESOURCE_TITLES: dict[OutageResource, str] = {
    OutageResource.COLD_WATER: "Нет холодной воды",
    OutageResource.HOT_WATER: "Нет горячей воды",
    OutageResource.HEAT: "Нет отопления",
    OutageResource.ELECTRICITY: "Нет электричества",
}


@dataclass(frozen=True, slots=True)
class House:
    address: str
    lat: float
    lng: float


def streets_by_house_count(houses: Sequence[House]) -> list[str]:
    """Distinct streets, the ones with most affected houses first."""
    counts = Counter(street_of(house.address) for house in houses)
    return [street for street, _ in counts.most_common()]


def _plural(count: int, one: str, few: str, many: str) -> str:
    if count % 10 == 1 and count % 100 != 11:
        return one
    if count % 10 in (2, 3, 4) and count % 100 not in (12, 13, 14):
        return few
    return many


def street_summary(houses: Sequence[House], shown: int = TITLE_STREETS) -> str:
    """«Тухачевского ул., Сельская ул. и ещё 3 улицы»."""
    streets = streets_by_house_count(houses)
    summary = ", ".join(streets[:shown])
    rest = len(streets) - shown
    if rest > 0:
        summary += f" и ещё {rest} {_plural(rest, 'улица', 'улицы', 'улиц')}"
    return summary


def outage_title(resource: OutageResource, houses: Sequence[House]) -> str:
    return f"{RESOURCE_TITLES[resource]}: {street_summary(houses)}"[:MAX_TITLE_LENGTH]


def anchor_house(houses: Sequence[House]) -> House:
    """The affected house closest to the centroid: the outage marker sits on a real building."""
    lat = sum(house.lat for house in houses) / len(houses)
    lng = sum(house.lng for house in houses) / len(houses)
    return min(houses, key=lambda house: geo.haversine_m(lat, lng, house.lat, house.lng))


def affected_radius_m(anchor: House, houses: Sequence[House]) -> int:
    farthest = max(geo.haversine_m(anchor.lat, anchor.lng, house.lat, house.lng) for house in houses)
    return max(MIN_RADIUS_M, min(MAX_RADIUS_M, round(farthest)))


def severity_for(houses_count: int) -> IssueSeverity:
    if houses_count >= HIGH_SEVERITY_HOUSES:
        return IssueSeverity.HIGH
    if houses_count >= MEDIUM_SEVERITY_HOUSES:
        return IssueSeverity.MEDIUM
    return IssueSeverity.LOW


def source_and_stage(initiator: str | None) -> tuple[InfoSource, IssueStage]:
    """A named organisation makes the outage official and in progress; otherwise it is built
    from residents' complaints and merely confirmed."""
    if initiator:
        return InfoSource.OFFICIAL, IssueStage.IN_PROGRESS
    return InfoSource.USER, IssueStage.CONFIRMED
