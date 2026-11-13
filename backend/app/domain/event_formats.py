"""Formats residents arrange themselves on top of an ordinary event (SPEC §3.4): a giveaway or swap,
a request for help, and a venue to hold them at. They are categories, so they need no columns of
their own; the rules that make them different live here."""

SWAP = "swap"
"""«Раздача и барахолка»: someone gives things away, those who sign up may bring their own."""
HELP = "help"
"""«Нужна помощь»: a small request a neighbour responds to."""
VENUE = "venue"
"""«Площадка для встреч» (infrastructure): premises whose owner offers them for meetups."""

_ALWAYS_MEETUP = frozenset({SWAP, HELP})
"""The author's contact is for those who signed up or responded only — never public."""
_ALWAYS_FREE = frozenset({SWAP, HELP})
"""Nothing is sold at a giveaway and a good deed is not paid for."""

BRING_PREFIX = "Принесу: "
"""What a participant of a swap brings is a comment in its discussion starting with this, so it is
screened and moderated like any comment; the card lists those of current participants."""
NOTE_MAX_LENGTH = 300

NOTE_NOT_ACCEPTED = "К этому событию нельзя добавить, что вы принесёте."
NOTHING_TO_BRING = "Организатор просит ничего с собой не приносить."
_HELP_REFUSALS = {
    "Свободных мест не осталось.": "Помощников уже достаточно — спасибо!",
    "Регистрация на событие закрыта.": "Автор просьбы закрыл отклики.",
    "Событие уже завершилось.": "Просьба уже неактуальна.",
    "Событие отменено.": "Автор отменил просьбу.",
}


def is_meetup(slug: str, requested: bool) -> bool:
    return requested or slug in _ALWAYS_MEETUP


def price(slug: str, requested: int | None) -> int | None:
    return 0 if slug in _ALWAYS_FREE else requested


def note_refusal(slug: str, attributes: dict[str, object]) -> str | None:
    """Why a participant cannot say what they bring, or None when they can."""
    if slug != SWAP:
        return NOTE_NOT_ACCEPTED
    if attributes.get("bring_own") is False:
        return NOTHING_TO_BRING
    return None


def bring_comment(note: str) -> str:
    return f"{BRING_PREFIX}{note.strip()}"


def brought(text: str) -> str | None:
    """What a comment says the participant brings, or None when it is an ordinary comment."""
    head, separator, rest = text.partition(":")
    if not separator or head.strip().casefold() != BRING_PREFIX.rstrip(": ").casefold():
        return None
    return rest.strip() or None


def join_refusal(slug: str, refusal: str) -> str:
    """The generic refusal in the words of the format: one does not «register» for a request."""
    return _HELP_REFUSALS.get(refusal, refusal) if slug == HELP else refusal
