"""Catalogue matching: one unambiguous object under our name, else abstain instead of guessing."""

import re
from collections.abc import Sequence
from dataclasses import dataclass

from app.domain import geo, names
from app.services.experimental.external_reviews.parser import Organization

CANDIDATES = 5
JUDGED_CANDIDATES = 20
"""At most this many entries within the sanity bound are put before the judge."""
AUTO_MATCH_TOLERANCE_M = 50.0
AMBIGUITY_RADIUS_M = 400.0
PLACE_TOLERANCE_M = 400.0
LONG_OBJECT_TOLERANCE_M = 1500.0
LONG_OBJECT_KINDS = frozenset({"мост", "набережн", "улиц"})
AREA_MARGIN_M = 300.0
BUSINESS_WORDS = frozenset({"бар", "паб"})
BUSINESS_PREFIXES: tuple[str, ...] = (
    "кафе",
    "ресторан",
    "кофейн",
    "столов",
    "буфет",
    "отел",
    "гостиниц",
    "хостел",
    "апартамент",
    "магазин",
    "сувенир",
    "касс",
    "парковк",
    "служб",
)
"""A business or a department that merely carries the object's name («Миллионка, ресторан»)."""
_WORD = re.compile(r"[^\W_]+")


@dataclass(frozen=True, slots=True)
class Subject:
    title: str
    lat: float
    lng: float
    area_radius_m: int | None = None
    parent_title: str | None = None
    kind: str | None = None
    """What our object is (a category, an area kind): context for the judge, not identity."""


def name_key(title: str) -> tuple[str, ...]:
    """Only case, ё, punctuation and word order vary; no stemming or dropped qualifiers."""
    return tuple(sorted(_WORD.findall(title.casefold().replace("ё", "е"))))


def tolerance_m(subject: Subject) -> float:
    """Geographic sanity check for an explicit ID, never a search acceptance threshold."""
    if subject.area_radius_m is not None:
        return subject.area_radius_m + AREA_MARGIN_M
    if names.kinds(subject.title) & LONG_OBJECT_KINDS:
        return LONG_OBJECT_TOLERANCE_M
    return PLACE_TOLERANCE_M


def acceptance_radius_m(subject: Subject, *, exact: bool) -> float:
    """How far the catalogue's pin may be from ours for a search result to be accepted.

    A territory or a long object is pinned anywhere along it, so its exact name is accepted
    within the sanity tolerance and a longer name within the territory itself. An ordinary
    place has branches and namesakes down the street: 50 m either way.
    """
    if subject.area_radius_m is not None:
        return tolerance_m(subject) if exact else max(AUTO_MATCH_TOLERANCE_M, subject.area_radius_m)
    if exact and names.kinds(subject.title) & LONG_OBJECT_KINDS:
        return LONG_OBJECT_TOLERANCE_M
    return AUTO_MATCH_TOLERANCE_M


def _is_business(word: str) -> bool:
    return word in BUSINESS_WORDS or word.startswith(BUSINESS_PREFIXES)


def extends_name(ours: str, theirs: str) -> bool:
    """Their name is ours with a fuller wording or a rubric after a comma: «Приморский
    океанариум, экспозиционный корпус», «Мемориальная подводная лодка С-56, музей».

    Every word of ours must occur before the comma, unstemmed. A different kind before the
    comma («Сквер Победы» for «Парк Победы») or a business word anywhere («…, касса»,
    «Кафе …») means another object that only shares the name.
    """
    our_words = set(name_key(ours))
    head = theirs.split(",", 1)[0]
    return (
        our_words <= set(name_key(head))
        and names.kinds(head) <= names.kinds(ours)
        and not any(_is_business(word) for word in set(name_key(theirs)) - our_words)
    )


def method(subject: Subject, found: Organization) -> str:
    """How a search result was accepted, for the stored evidence."""
    return "exact_name_nearby" if name_key(found.title) == name_key(subject.title) else "extended_name_nearby"


def _is_parents(subject: Subject, organization: Organization) -> bool:
    parent = subject.parent_title
    return (
        parent is not None
        and names.similar_names(parent, organization.title)
        and name_key(subject.title) != name_key(parent)
    )


def is_parent(subject: Subject, organization: Organization) -> bool:
    """The entry is the area our place lies in, under that area's very name. Narrower than the
    rules' veto: «Смотровая площадка Нагорного парка» only resembles the park «Нагорный парк»."""
    parent = subject.parent_title
    return (
        parent is not None
        and names.same_name(parent, organization.title)
        and name_key(subject.title) != name_key(parent)
    )


def within_tolerance(subject: Subject, item: Organization) -> bool:
    return geo.haversine_m(subject.lat, subject.lng, item.lat, item.lng) <= tolerance_m(subject)


def judgeable(subject: Subject, results: Sequence[Organization]) -> list[Organization]:
    """What the judge may choose from when the rules abstain: entries within the sanity bound,
    each ID once and in source order. An ID with conflicting records is left out entirely, and a
    name without a distinctive word gives the judge nothing to compare."""
    if not names.distinctive_stems(subject.title):
        return []
    records: dict[str, set[Organization]] = {}
    for item in results:
        records.setdefault(item.org_id, set()).add(item)
    unique = [next(iter(found)) for found in records.values() if len(found) == 1]
    return [item for item in unique if within_tolerance(subject, item)][:JUDGED_CANDIDATES]


def may_accept_judgement(subject: Subject, organization: Organization) -> bool:
    """The judge's choice must still lie within the sanity bound and must not be our parent."""
    return within_tolerance(subject, organization) and not is_parent(subject, organization)


def linked(subject: Subject, results: Sequence[Organization], identifier: str) -> Organization | None:
    """An explicit provider ID is authoritative, unless its position contradicts our object."""
    candidates = [item for item in results if item.org_id == identifier]
    if len(candidates) != 1:
        return None
    item = candidates[0]
    return item if within_tolerance(subject, item) else None


def match(subject: Subject, results: Sequence[Organization]) -> Organization | None:
    """Accept one distinctive name — exact, or ours extended (`extends_name`) — close enough
    (`acceptance_radius_m`), with no plausible nearby competitor.

    Similar names only veto a match; they can never establish one. A generic name, a business
    carrying the name, a nearby branch, or insufficient search window yields no match. Distance
    and source ranking never break an identity tie. Explicit IDs use `linked` instead.
    """
    if not names.distinctive_stems(subject.title):
        return None
    key = name_key(subject.title)
    # Examine every supplied result for ambiguity, even outside the acceptance top five.
    nearby = [
        item
        for item in results
        if geo.haversine_m(subject.lat, subject.lng, item.lat, item.lng)
        <= max(AMBIGUITY_RADIUS_M, tolerance_m(subject))
        and (name_key(item.title) == key or names.similar_names(subject.title, item.title))
    ]
    identifiers = {item.org_id for item in nearby}
    if len(identifiers) != 1:
        return None
    accepted = [
        item
        for item in results[:CANDIDATES]
        if item.org_id in identifiers
        and (name_key(item.title) == key or extends_name(subject.title, item.title))
        and not _is_parents(subject, item)
        and geo.haversine_m(subject.lat, subject.lng, item.lat, item.lng)
        <= acceptance_radius_m(subject, exact=name_key(item.title) == key)
    ]
    # Conflicting duplicate records for one ID are insufficient evidence too.
    if not accepted or any(item != accepted[0] for item in nearby):
        return None
    return accepted[0]
