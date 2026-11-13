"""Is a freely licensed archive photo of the object itself? (SPEC §19). Pure rules.

A photo found only because it was taken nearby shows whatever stood in front of the camera — a
car, a bird, the building next door. It belongs to a place or area only when something ties it to
that object: the object's own source names the file, it is the image of the object's Wikidata
item or the lead image of its article, it lies in the object's own Commons category — or its
title, description or categories name the object. Not merely the street, an address or the city:
every distinctive word of the object's name must be there, outside an address. None is better
than a wrong one.
"""

import re
from collections.abc import Iterable
from enum import StrEnum

from app.domain import names
from app.domain.enums import PUBLIC_STATUSES, PlaceStatus


class Tie(StrEnum):
    """How a photo was found for an object."""

    NAMED = "named"
    """The object's own source names the file (an OSM `wikimedia_commons` tag, the guide's image)."""
    ITEM = "item"
    """The image (P18) of the object's Wikidata item."""
    ARTICLE = "article"
    """The free lead image of the Wikipedia article matched to the object."""
    CATEGORY = "category"
    """A file of the object's own Commons category."""
    NEARBY = "nearby"
    """Geotagged near the object, and nothing more."""


OWN_TIES = frozenset({Tie.NAMED, Tie.ITEM, Tie.ARTICLE, Tie.CATEGORY})
GENERIC_STEMS = frozenset({"vladi", "primo", "rossi", "russi", "gorod", "krai", "kray", "ulits", "stree"})
"""Words that name the city, the region or a street in general — never the object (as Latin stems)."""
_LATIN = str.maketrans(
    {
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z",
        "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
        "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh",
        "щ": "shch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    }
)  # fmt: skip


_ADDRESS = re.compile(
    r"(?:\b(?:ул|улица|пр|проспект|пер|переулок|street|st|ulitsa)\b\.?\s*[\w-]+)"
    r"|(?:[\w-]+\s+(?:ул|улица|street|st|ulitsa)\b\.?)"
    r"|(?:[а-яё-]+,\s*\d+[а-я]?\b)",
    re.IGNORECASE,
)
"""An address — «ул. Мордовцева», «Семеновская улица», «Мордовцева, 8»: a street named after a
person is not that person's monument, and a house there is not the café inside. A word with a
bare number after it is left alone: on Commons that is as often the file's own count
(«Остров Скрыплёва 1.jpg») as a house number."""
KIND_WORDS = ("батаре", "остров", "гора", "океанар", "лодк", "подводн", "кирх", "крепост", "форт")
"""Words that say what the object is rather than which one; Commons titles often give them in
another language («Novosiltsevskaya battery»), so they are not required while a proper name is."""


def _latin_stems(words: Iterable[str]) -> set[str]:
    """Commons titles are as often in Latin letters as in Cyrillic: compare both as Latin stems
    («c» read as «k», so «Oceanarium» meets «океанариум»)."""
    return {word.translate(_LATIN).replace("c", "k")[: names.STEM_LENGTH] for word in words}


def _object_stems(title: str) -> set[str]:
    """The proper name's stems; the kind words only when the name has nothing else."""
    distinctive = [word for word in names.words(title) if names.is_distinctive(word)]
    proper = [word for word in distinctive if not word.startswith(KIND_WORDS)]
    return (_latin_stems(proper) - GENERIC_STEMS) or (_latin_stems(distinctive) - GENERIC_STEMS)


def names_the_object(title: str, texts: Iterable[str]) -> bool:
    """Every distinctive word of the object's name (city and street words aside) occurs in the
    photo's title, description or categories — in Cyrillic or in Latin letters."""
    wanted = _object_stems(title)
    if not wanted:
        return False
    found = _latin_stems(word for text in texts for word in names.words(_ADDRESS.sub(" ", text)))
    return wanted <= found


def is_of_the_object(tie: Tie | None, title: str, texts: Iterable[str]) -> bool:
    """A photo the object's own identity leads to, or one that names the object. A photo whose
    way of being found is unknown (an older snapshot) has to name the object, like a nearby one."""
    return tie in OWN_TIES or names_the_object(title, texts)


def may_receive(status: PlaceStatus, title: str, category_name: str, unnamed_titles: Iterable[str]) -> bool:
    """Archive photos and texts go only to public places with a name of their own — not to an
    archived or held one, not to «Детская площадка» named after its category."""
    folded = title.strip().casefold()
    unnamed = {item.casefold() for item in unnamed_titles} | {category_name.casefold()}
    return status in PUBLIC_STATUSES and folded not in unnamed
