"""Do two names denote the same object? Pure helpers shared by every matcher that links our
places to other catalogues (Wikivoyage, Wikipedia, external reviews).

A name is split into *kind words* («парк», «мост», «смотровая», «музей» …) and *distinctive
words* («Нагорный», «Токаревский»). Distinctive words decide the match; kind words only veto
it when both names state different kinds («Парк Победы» is not «Сквер Победы»).
"""

import re

STEM_LENGTH = 5
"""Distinctive words are compared by their first letters so that «парка» matches «парк»."""
MIN_SHARED_SHARE = 0.5
KIND_PREFIXES: tuple[str, ...] = (
    "парк",
    "сквер",
    "набережн",
    "мост",
    "площад",
    "смотров",
    "видов",
    "пляж",
    "остров",
    "бухт",
    "сопк",
    "собор",
    "церк",
    "храм",
    "музе",
    "театр",
    "памятник",
    "монумент",
    "ресторан",
    "галере",
    "вокзал",
    "стадион",
    "библиотек",
    "улиц",
    "маяк",
)
"""Words that say what kind of object it is, by prefix: they carry no identity of their own."""
KIND_WORDS = frozenset({"сад", "мыс", "кафе", "бар"})
"""Short kind words matched exactly (as prefixes they would swallow unrelated words)."""
NOISE_WORDS = frozenset(
    {"им", "имени", "г", "ул", "и", "в", "на", "у", "через", "до", "от", "за", "для", "the", "of"}
)
_WORD = re.compile(r"[0-9a-zа-я]+")
_QUALIFIER = re.compile(r"\([^()]*\)\s*$")
"""A trailing disambiguator such as «(Владивосток)» in encyclopaedia titles."""


def _words(name: str) -> list[str]:
    name = _QUALIFIER.sub("", name)
    return _WORD.findall(name.casefold().replace("ё", "е"))


def _kind(word: str) -> str | None:
    if word in KIND_WORDS:
        return word
    return next((prefix for prefix in KIND_PREFIXES if word.startswith(prefix)), None)


def _is_distinctive(word: str) -> bool:
    """Not a kind word, not noise and not an initial («В. И. Ленину» → «ленину»)."""
    return word not in NOISE_WORDS and _kind(word) is None and (len(word) > 1 or word.isdigit())


def words(name: str) -> list[str]:
    """The name's words, folded (ё → е), without a trailing «(…)» qualifier."""
    return _words(name)


def is_distinctive(word: str) -> bool:
    """A folded word that carries identity — not a kind word, noise or an initial."""
    return _is_distinctive(word)


def distinctive_stems(name: str) -> set[str]:
    return {word[:STEM_LENGTH] for word in _words(name) if _is_distinctive(word)}


def kinds(name: str) -> set[str]:
    return {kind for kind in map(_kind, _words(name)) if kind is not None}


def _compatible_kinds(ours: str, theirs: str) -> bool:
    """Different stated kinds rule a match out; a name without a kind word fits any kind."""
    our_kinds, their_kinds = kinds(ours), kinds(theirs)
    return not our_kinds or not their_kinds or bool(our_kinds & their_kinds)


def similar_names(ours: str, theirs: str) -> bool:
    """Similar when every distinctive word of the shorter name occurs in the longer one
    («Нагорный парк» ~ «Нагорный парк культуры»), or when they share more than half of the
    longer name's distinctive words — and the kinds, if both names state one, agree."""
    shorter, longer = sorted((distinctive_stems(ours), distinctive_stems(theirs)), key=len)
    if not shorter or not _compatible_kinds(ours, theirs):
        return False
    return shorter <= longer or len(shorter & longer) / len(longer) > MIN_SHARED_SHARE


def same_name(ours: str, theirs: str) -> bool:
    """The same distinctive words and the same kinds («Приморский океанариум» in any spelling)."""
    return distinctive_stems(ours) == distinctive_stems(theirs) and kinds(ours) == kinds(theirs)


def names_the_whole(whole: str, name: str) -> bool:
    """`name` denotes the object called `whole` itself, in any spelling or a longer form, rather
    than a part of it: similar names, and no kind the whole's name does not state. «Нагорный парк
    культуры» names the park; «Смотровая площадка Нагорного парка» names a part of it."""
    return similar_names(whole, name) and kinds(name) <= kinds(whole)


def same_kind_only(ours: str, theirs: str) -> bool:
    """A weaker signal for names that are nothing but a kind («Смотровая площадка»): one of the
    names has no distinctive words and both state a common kind. Callers accept it only at
    close range."""
    if distinctive_stems(ours) and distinctive_stems(theirs):
        return False
    return bool(kinds(ours) & kinds(theirs))
