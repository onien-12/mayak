"""Pure decisions about Wikivoyage listings (SPEC §21): which category, whether a listing may
become a place of its own or may only enrich a place we already have.
"""

from collections.abc import Sequence
from dataclasses import dataclass, replace
from enum import StrEnum
from urllib.parse import quote

from app.domain import free_text, geo, names
from app.domain.attributes import AttributeValue
from app.domain.enums import ExternalSourceId
from app.domain.geo import BBox
from app.services.wikivoyage.parser import Listing

ARTICLE_URL = "https://ru.wikivoyage.org/wiki/{title}"
MIN_DESCRIPTION_LENGTH = 80
"""Shorter texts («Приморский Океанариум ДВО РАН») say nothing a title does not; such listings
may still enrich an existing place, but do not become places of their own."""
MAX_TITLE_LENGTH = 120
MAX_ADDRESS_LENGTH = 200
CLOSED_MARKERS = ("на реконструкции", "закрыт", "не работает", "снесён", "снесен")
SIGHT_KINDS = frozenset({"see", "do"})
FOOD_KINDS = frozenset({"eat", "drink"})
FOOD_CATEGORY = "food"
FALLBACK_CATEGORY = "unusual"
SEE_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("culture_space", ("музе", "театр", "галере", "филармон", "библиотек", "океанариум")),
    ("viewpoint", ("смотров", "видов")),
    (
        "historic",
        (
            "памятник",
            "монумент",
            "мемориал",
            "крепост",
            "батаре",
            "форт",
            "маяк",
            "обелиск",
            "кладбищ",
            "арка",
        ),
    ),
    (
        "architecture",
        ("церк", "собор", "храм", "мост", "вокзал", "здани", "дом", "особняк", "университет", "площад"),
    ),
    ("nature", ("бухт", "остров", "мыс", "пляж", "сопк", "залив", "парк", "водопад", "озер", "полуостров")),
)
"""See listings: the first rule with a word of the name starting with one of its stems wins."""
DO_CULTURE_STEMS = ("музе", "театр", "галере", "филармон", "океанариум")
"""Do listings: museums and theatres by name or description; else nature by name; else unusual."""
VIEW_HINTS = ("вид на", "видом на", "панорам")
MERGE_RADIUS_M = 80.0
"""A similarly named tourism place of a compatible category this close is the same object."""
SAME_NAME_RADIUS_M = 500.0
"""The same name reaches farther: guides and maps put hills and capes at different points."""
AREA_MARGIN_M = 150.0
"""A similarly named area is the same object when the listing lies inside it or this close to it."""
DUPLICATE_LISTING_M = 1000.0
"""Two articles describing one sight: the later listing only enriches."""
CATEGORY_GROUPS: tuple[frozenset[str], ...] = (
    frozenset({"historic", "architecture", "unusual"}),
    frozenset({"nature", "viewpoint"}),
    frozenset({"culture_space"}),
    frozenset({"food"}),
)
"""Keyword-derived categories are rough: a listing may merge within its group (a museum never
merges into the monument next door unless they share the very name)."""


class Role(StrEnum):
    CREATE = "create"
    """Described well enough, inside the service area: may become a place of its own."""
    ENRICH = "enrich"
    """May only add to a place or area we already have."""


@dataclass(frozen=True, slots=True)
class ListingDraft:
    external_id: str
    url: str
    category: str
    title: str
    alt: str
    description: str
    lat: float
    lng: float
    address: str | None
    attributes: dict[str, AttributeValue]
    role: Role
    wikidata: str | None
    image: str | None


def external_id(listing: Listing) -> str:
    return f"{ExternalSourceId.WIKIVOYAGE.value}:{listing.listing_id}"


def article_url(article: str) -> str:
    return ARTICLE_URL.format(title=quote(article.replace(" ", "_")))


def _words(text: str) -> list[str]:
    return text.casefold().replace("ё", "е").replace("«", " ").replace("»", " ").split()


def _has_stem(text: str, stems: tuple[str, ...]) -> bool:
    return any(word.startswith(stems) for word in _words(text))


def category_for(listing: Listing) -> str | None:
    """Our tourism category for a listing; None for kinds the map does not show (sleep, go, buy)."""
    if listing.kind in FOOD_KINDS:
        return FOOD_CATEGORY
    if listing.kind == "do":
        if _has_stem(listing.name, DO_CULTURE_STEMS) or _has_stem(listing.description, DO_CULTURE_STEMS):
            return "culture_space"
        return "nature" if _has_stem(listing.name, SEE_RULES[-1][1]) else FALLBACK_CATEGORY
    if listing.kind != "see":
        return None
    name = f"{listing.name} {listing.alt}"
    found = next((category for category, stems in SEE_RULES if _has_stem(name, stems)), None)
    if found is not None:
        return found
    return (
        "viewpoint"
        if any(hint in listing.description.casefold() for hint in VIEW_HINTS)
        else FALLBACK_CATEGORY
    )


def is_closed(listing: Listing) -> bool:
    text = listing.description.casefold()
    return any(marker in text for marker in CLOSED_MARKERS)


def shared_points(listings: Sequence[Listing]) -> set[tuple[float, float]]:
    """Points given to differently named listings: copy-pasted coordinates (the article puts
    «Русский мост» at the university campus), so neither listing can be placed by them."""
    names: dict[tuple[float, float], set[str]] = {}
    for listing in listings:
        if listing.lat is not None and listing.lng is not None:
            names.setdefault((listing.lat, listing.lng), set()).add(listing.name.casefold())
    return {point for point, named in names.items() if len(named) > 1}


def _names(draft: ListingDraft) -> tuple[str, ...]:
    return tuple(name for name in (draft.title, draft.alt) if name)


def _compatible(ours: str, theirs: str) -> bool:
    return ours == theirs or any(ours in group and theirs in group for group in CATEGORY_GROUPS)


def place_match(draft: ListingDraft, title: str, category: str, distance_m: float) -> int | None:
    """Does the listing describe this place? 0 — by its very name, 1 — by a similar name of a
    compatible category close by; None — it is another place."""
    if distance_m <= SAME_NAME_RADIUS_M and any(names.same_name(name, title) for name in _names(draft)):
        return 0
    similar = any(names.similar_names(name, title) for name in _names(draft))
    if distance_m <= MERGE_RADIUS_M and similar and _compatible(draft.category, category):
        return 1
    return None


def describes_area(draft: ListingDraft, title: str, inside: bool, distance_m: float, radius_m: int) -> bool:
    """A similarly named area the listing lies in or next to."""
    near = inside or distance_m <= radius_m + AREA_MARGIN_M
    return near and any(names.similar_names(name, title) for name in _names(draft))


def _repeats(draft: ListingDraft, earlier: Sequence[ListingDraft]) -> bool:
    return any(
        geo.haversine_m(draft.lat, draft.lng, other.lat, other.lng) <= DUPLICATE_LISTING_M
        and any(
            names.similar_names(name, other_name) for name in _names(draft) for other_name in _names(other)
        )
        for other in earlier
    )


def _description(text: str) -> str:
    """Capitalised (the guide often continues the name: «Миллионка — в прошлом …») and clipped."""
    clipped = free_text.clip_at_sentence(text, free_text.MAX_DESCRIPTION_LENGTH)
    return clipped[:1].upper() + clipped[1:]


def _role(listing: Listing, description: str, bbox: BBox, ambiguous: set[tuple[float, float]]) -> Role:
    lat, lng = listing.lat or 0.0, listing.lng or 0.0
    describes = len(description) >= MIN_DESCRIPTION_LENGTH and not is_closed(listing)
    placed = bbox.contains(lat, lng) and (lat, lng) not in ambiguous
    return Role.CREATE if describes and placed else Role.ENRICH


def normalise(listings: Sequence[Listing], bbox: BBox) -> list[ListingDraft]:
    """Drafts for the listings the map can use: located ones of a shown kind."""
    ambiguous = shared_points(listings)
    drafts: list[ListingDraft] = []
    for listing in listings:
        category = category_for(listing)
        if category is None or listing.lat is None or listing.lng is None:
            continue
        description = _description(listing.description)
        draft = ListingDraft(
            external_id=external_id(listing),
            url=article_url(listing.article),
            category=category,
            title=listing.name[:MAX_TITLE_LENGTH],
            alt=listing.alt,
            description=description,
            lat=listing.lat,
            lng=listing.lng,
            address=listing.address[:MAX_ADDRESS_LENGTH] or None,
            attributes={"hours": listing.hours} if listing.hours else {},
            role=_role(listing, description, bbox, ambiguous),
            wikidata=listing.wikidata,
            image=listing.image,
        )
        if _repeats(draft, drafts):
            draft = replace(draft, role=Role.ENRICH)
        drafts.append(draft)
    return drafts
