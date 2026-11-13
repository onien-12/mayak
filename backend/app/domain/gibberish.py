"""Keyboard mashing detector (SPEC §24.1): deterministic, no model.

A run is a stretch of letters typed by sliding along one row of the Russian (ЙЦУКЕН) or Latin
(QWERTY) keyboard in one direction: «цук», «фыва», «asdf». Real words contain short runs
(«про», «ить», «цук» in «цукини»), mashing is made of them. A word is mashed when runs cover
nearly all of it, when it holds a long stretch made only of runs (a real name with a typed-over
tail: «слободацукйцук»), or when a long word has no vowel at all. A text is gibberish when mashed
words make up most of its letters, so one odd word in a sentence does not count.
"""

import re

KEYBOARD_ROWS = (
    "йцукенгшщзхъ",
    "фывапролджэ",
    "ячсмитьбю",
    "qwertyuiop",
    "asdfghjkl",
    "zxcvbnm",
)
MIN_RUN = 3
"""Shorter slides are everywhere in ordinary words."""
MIN_WORD = 4
"""Three-letter runs are real words and abbreviations too («про», «СМИ», «ЛОР»)."""
WORD_COVERAGE = 0.8
"""Share of a word's letters inside runs that makes the whole word mashed."""
MASHED_STRETCH = 6
"""Letters in a row made only of runs: no ordinary word has such a stretch."""
VOWELLESS_LENGTH = 5
"""A word this long without a single vowel is not a word («ДВФУ», «ВДНХ» are shorter)."""
TEXT_SHARE = 0.5
"""Share of a text's letters in mashed words that makes the text gibberish."""

VOWELS = frozenset("аеёиоуыэюяaeiouy")
_KEY_POSITIONS: dict[str, tuple[int, int]] = {
    letter: (row, column) for row, keys in enumerate(KEYBOARD_ROWS) for column, letter in enumerate(keys)
}
_WORD_RE = re.compile(r"[a-zа-яё]+", re.IGNORECASE)


def _step(previous: str, current: str) -> int:
    """+1 / −1 when `current` is the next / previous key on the row of `previous`, else 0."""
    first, second = _KEY_POSITIONS.get(previous), _KEY_POSITIONS.get(current)
    if first is None or second is None or first[0] != second[0]:
        return 0
    difference = second[1] - first[1]
    return difference if difference in (1, -1) else 0


def _run_mask(word: str) -> list[bool]:
    """Which letters belong to runs of at least `MIN_RUN` keys."""
    covered = [False] * len(word)
    start, direction = 0, 0
    for index in range(1, len(word) + 1):
        step = _step(word[index - 1], word[index]) if index < len(word) else 0
        if step != 0 and direction in (0, step):
            direction = step
            continue
        if index - start >= MIN_RUN:
            covered[start:index] = [True] * (index - start)
        start = index - 1 if step != 0 else index
        direction = step
    return covered


def _longest_stretch(covered: list[bool]) -> int:
    longest = current = 0
    for flag in covered:
        current = current + 1 if flag else 0
        longest = max(longest, current)
    return longest


def is_mashed_word(word: str) -> bool:
    word = word.lower()
    if len(word) < MIN_WORD:
        return False
    if len(word) >= VOWELLESS_LENGTH and not VOWELS.intersection(word):
        return True
    covered = _run_mask(word)
    return sum(covered) >= WORD_COVERAGE * len(word) or _longest_stretch(covered) >= MASHED_STRETCH


def _letters(text: str) -> tuple[int, int]:
    """`(letters in mashed words, all letters)`."""
    words = _WORD_RE.findall(text)
    return sum(len(word) for word in words if is_mashed_word(word)), sum(len(word) for word in words)


def is_gibberish(text: str | None) -> bool:
    """Mashed words make up most of the letters of the text."""
    if not text:
        return False
    mashed, total = _letters(text)
    return total > 0 and mashed >= TEXT_SHARE * total


def address_is_mashed(address: str | None) -> bool:
    """An address is refused as soon as one of its words is mashed (a typed-over tail is enough)."""
    return bool(address) and any(is_mashed_word(word) for word in _WORD_RE.findall(address))
