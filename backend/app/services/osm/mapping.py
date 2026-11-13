"""The declarative OSM → «Маяк» mapping: which objects become which places and territories.

Every decision about OSM tags lives in these tables; the normaliser only applies them and the
Overpass query is generated from them, so adding a kind of object is one new row.
Rules are tried in order and the first match wins.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field

from app.domain.attributes import AttributeValue
from app.domain.enums import AreaKind


@dataclass(frozen=True, slots=True)
class PlaceRule:
    """OSM objects with `tag` in `values` (any value when empty) become places of `category`.

    `when` narrows the rule by other tags (a value list such as `sport=soccer;basketball` matches
    any of its items), `unless` excludes values, `named_only` skips objects without a name.
    `title` is the Russian title given to unnamed objects; `preset` adds fixed attributes.
    """

    tag: str
    values: tuple[str, ...]
    category: str
    title: str
    named_only: bool = False
    when: Mapping[str, str] = field(default_factory=dict)
    unless: Mapping[str, tuple[str, ...]] = field(default_factory=dict)
    preset: Mapping[str, AttributeValue] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class AreaRule:
    """Named OSM polygons with `tag` in `values` become areas (SPEC §17) of `kind`."""

    tag: str
    values: tuple[str, ...]
    kind: AreaKind


@dataclass(frozen=True, slots=True)
class AttributeRule:
    """`tag` → attribute `key` through `values`; with `verbatim` other values are kept as text."""

    tag: str
    key: str
    values: Mapping[str, AttributeValue] = field(default_factory=dict)
    verbatim: bool = False


_YES_NO: dict[str, AttributeValue] = {"yes": True, "no": False}
_PUBLIC_TRANSPORT = ("public_transport",)

PLACE_RULES: tuple[PlaceRule, ...] = (
    PlaceRule("amenity", ("toilets",), "toilet", "Общественный туалет"),
    PlaceRule("amenity", ("drinking_water",), "drinking_water", "Питьевая вода"),
    PlaceRule(
        "amenity", ("fountain",), "drinking_water", "Питьевой фонтанчик", when={"drinking_water": "yes"}
    ),
    PlaceRule("amenity", ("fountain",), "architecture", "Фонтан"),
    PlaceRule(
        "amenity",
        ("shelter",),
        "rest_place",
        "Навес для отдыха",
        unless={"shelter_type": _PUBLIC_TRANSPORT},
        preset={"shelter": True},
    ),
    PlaceRule("amenity", ("library",), "library", "Библиотека"),
    PlaceRule("amenity", ("charging_station",), "charging", "Зарядная станция", preset={"kind": "ev"}),
    PlaceRule(
        "amenity",
        ("device_charging_station",),
        "charging",
        "Зарядка для гаджетов",
        preset={"kind": "gadgets"},
    ),
    PlaceRule("emergency", ("defibrillator",), "defibrillator", "Дефибриллятор"),
    PlaceRule("emergency", ("first_aid_kit",), "first_aid_kit", "Аптечка"),
    PlaceRule("leisure", ("playground",), "playground", "Детская площадка"),
    PlaceRule("leisure", ("fitness_station",), "workout", "Воркаут-площадка"),
    PlaceRule("leisure", ("pitch",), "basketball", "Баскетбольная площадка", when={"sport": "basketball"}),
    PlaceRule("leisure", ("pitch",), "football", "Футбольное поле", when={"sport": "soccer"}),
    PlaceRule("leisure", ("pitch",), "table_tennis", "Теннисный стол", when={"sport": "table_tennis"}),
    PlaceRule("leisure", ("pitch",), "skatepark", "Скейт-площадка", when={"sport": "skateboard"}),
    PlaceRule("leisure", ("pitch",), "workout", "Воркаут-площадка", when={"sport": "fitness"}),
    PlaceRule("leisure", ("pitch",), "sports_ground", "Спортивная площадка"),
    PlaceRule("tourism", ("viewpoint",), "viewpoint", "Видовая точка"),
    PlaceRule("tourism", ("museum",), "culture_space", "Музей"),
    PlaceRule("tourism", ("gallery",), "culture_space", "Галерея"),
    PlaceRule("tourism", ("attraction",), "unusual", "Достопримечательность", named_only=True),
    PlaceRule("tourism", ("artwork",), "unusual", "Арт-объект", named_only=True),
    PlaceRule("historic", (), "historic", "Исторический объект", named_only=True),
    PlaceRule("natural", ("beach",), "nature", "Пляж", named_only=True),
)
UNNAMED_TITLES = frozenset(rule.title for rule in PLACE_RULES)
"""Titles generated for objects without a name: they say what the object is, not which one."""

AREA_RULES: tuple[AreaRule, ...] = (
    AreaRule("leisure", ("park", "garden"), AreaKind.PARK),
    AreaRule("place", ("square",), AreaKind.SQUARE),
    AreaRule("natural", ("beach",), AreaKind.BEACH),
    AreaRule("place", ("island", "islet"), AreaKind.ISLAND),
)
MIN_AREA_M2 = 3_000.0
"""Smaller named polygons are not territories worth a location card; they stay plain places."""

SURFACES: dict[str, AttributeValue] = {
    "asphalt": "asphalt",
    "concrete": "concrete",
    "paving_stones": "concrete",
    "artificial_turf": "turf",
    "tartan": "rubber",
    "rubber": "rubber",
    "ground": "ground",
    "dirt": "ground",
    "sand": "ground",
    "gravel": "ground",
    "fine_gravel": "ground",
}
SPORTS: dict[str, AttributeValue] = {
    "volleyball": "volleyball",
    "beachvolleyball": "volleyball",
    "tennis": "tennis",
    "ice_hockey": "hockey",
    "hockey": "hockey",
    "multi": "multi",
    "handball": "multi",
    "athletics": "athletics",
    "running": "athletics",
    "badminton": "other",
    "equestrian": "other",
    "golf": "other",
}

ATTRIBUTE_RULES: tuple[AttributeRule, ...] = (
    AttributeRule("fee", "free", {"no": True, "yes": False}),
    AttributeRule("wheelchair", "accessible", _YES_NO),
    AttributeRule("opening_hours", "hours", {"24/7": "круглосуточно"}, verbatim=True),
    AttributeRule("changing_table", "changing_table", _YES_NO),
    AttributeRule("lit", "lighting", _YES_NO),
    AttributeRule("surface", "surface", SURFACES),
    AttributeRule("sport", "sport", SPORTS),
    AttributeRule("seasonal", "seasonal", _YES_NO),
    AttributeRule("defibrillator:location", "access", verbatim=True),
)

SKIPPED_ACCESS = frozenset({"private", "no"})
"""Objects closed to the public (school yards, private courts) are not part of a public map."""

NAME_TAGS = ("name:ru", "name")
EXTRA_TAGS = ("access", "description", "addr:street", "addr:housenumber", "wikidata", "wikimedia_commons")
"""Tags read besides the rule and attribute tags; everything else is dropped from the snapshot."""


def used_tags() -> frozenset[str]:
    """Every tag key the normaliser and the photo job look at."""
    keys = {*NAME_TAGS, *EXTRA_TAGS}
    keys.update(rule.tag for rule in (*PLACE_RULES, *AREA_RULES))
    keys.update(key for rule in PLACE_RULES for key in (*rule.when, *rule.unless))
    keys.update(rule.tag for rule in ATTRIBUTE_RULES)
    return frozenset(keys)
