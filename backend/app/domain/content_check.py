"""Automatic text checks (SPEC §6) and profanity masking (SPEC §24.5).

Checks only produce human-readable flags. Profanity is not a flag: it is masked on display.
"""

import re

MAX_LINKS = 2
SHOUT_MIN_LETTERS = 20
SHOUT_CAPS_RATIO = 0.7
MAX_CHAR_REPEAT = 5
DUPLICATE_RADIUS_M = 50.0
SAME_IMAGE_MAX_PLACES = 3

FLAG_TOO_MANY_LINKS = "Слишком много ссылок в тексте"
FLAG_LINK_SHORTENER = "Ссылка через сервис сокращения"
FLAG_SHOUTING = "Текст набран заглавными буквами"
FLAG_CHAR_REPEAT = "Длинные повторы символов"
FLAG_DUPLICATE_BY_AUTHOR = "Автор уже публиковал точку с таким названием за последние сутки"
FLAG_DUPLICATE_NEARBY = "Рядом уже есть точка с таким же названием"
FLAG_IMAGE_REUSED = "Одно и то же фото прикреплено к нескольким точкам"

LINK_SHORTENERS = (
    "bit.ly",
    "clck.ru",
    "goo.gl",
    "t.co",
    "tinyurl.com",
    "vk.cc",
    "is.gd",
    "cutt.ly",
    "goo.su",
)

_PROFANITY_PREFIXES = (
    "хуй",
    "хуе",
    "хуё",
    "хуя",
    "хуи",
    "нахуй",
    "нахуя",
    "похуй",
    "охуе",
    "охуи",
    "дохуя",
    "нихуя",
    "пизд",
    "спизд",
    "распизд",
    "бляд",
    "блят",
    "еба",
    "ёба",
    "ебу",
    "ебл",
    "заеб",
    "заёб",
    "наеб",
    "наёб",
    "выеб",
    "проеб",
    "проёб",
    "уеб",
    "уёб",
    "долбоеб",
    "долбоёб",
    "мудак",
    "мудил",
    "пидор",
    "пидар",
    "гандон",
    "шлюх",
)
"""Matched at the start of a word only: «застрахуйте» and «употреблять» are innocent."""
_PROFANITY_WORDS = frozenset({"сука", "суки", "суку", "сукой", "сучка", "сучара"})

_LINK_RE = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
_WORD_RE = re.compile(r"[a-zа-яё]+", re.IGNORECASE)
MASK_CHAR = "*"
_REPEAT_RE = re.compile(r"(.)\1{" + str(MAX_CHAR_REPEAT) + r",}")
_SHORTENER_RE = re.compile(
    r"(?<![\w.-])(?:" + "|".join(re.escape(host) for host in LINK_SHORTENERS) + r")(?=/|\s|$)",
    re.IGNORECASE,
)


def _is_profane(word: str) -> bool:
    lowered = word.lower()
    return lowered in _PROFANITY_WORDS or lowered.startswith(_PROFANITY_PREFIXES)


def has_profanity(text: str) -> bool:
    return any(_is_profane(word) for word in _WORD_RE.findall(text))


def _masked_word(match: re.Match[str]) -> str:
    word = match.group()
    if not _is_profane(word) or len(word) < 3:
        return word
    return f"{word[0]}{MASK_CHAR * (len(word) - 2)}{word[-1]}"


def mask_profanity(text: str) -> str:
    """Every word from the list keeps its first and last letter, the rest become `*` («х*й»)."""
    return _WORD_RE.sub(_masked_word, text) if text else text


def _is_shouting(text: str) -> bool:
    letters = [char for char in _LINK_RE.sub("", text) if char.isalpha()]
    if len(letters) < SHOUT_MIN_LETTERS:
        return False
    return sum(1 for char in letters if char.isupper()) / len(letters) > SHOUT_CAPS_RATIO


def text_flags(*texts: str | None) -> list[str]:
    """Flags for the given pieces of user text, without duplicates, in a stable order.

    Links are counted across all pieces. Shouting is judged both per piece and for the whole
    text: a title in capitals is flagged even when the description is calm, and so are several
    short shouted pieces.
    """
    pieces = [piece for piece in texts if piece]
    text = "\n".join(pieces)
    flags: list[str] = []
    if len(_LINK_RE.findall(text)) > MAX_LINKS:
        flags.append(FLAG_TOO_MANY_LINKS)
    if _SHORTENER_RE.search(text):
        flags.append(FLAG_LINK_SHORTENER)
    if any(_is_shouting(candidate) for candidate in (*pieces, text)):
        flags.append(FLAG_SHOUTING)
    if _REPEAT_RE.search(text):
        flags.append(FLAG_CHAR_REPEAT)
    return flags


def normalize_title(title: str) -> str:
    """Canonical form used to detect duplicate titles."""
    return " ".join(title.casefold().split())
