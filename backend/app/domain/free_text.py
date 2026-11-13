"""Rules for texts taken from free sources (Wikivoyage, Wikipedia) — SPEC §19, §21.

Resident-written text is never overwritten. A free text may fill an empty description, and a
travel guide may also replace a description an import generated (an untouched OSM `description`
tag). The first credited free text wins: sources never overwrite each other.
"""

import re

TEXT_LICENSE = "CC BY-SA 4.0"
"""Text licence of Wikivoyage and Wikipedia; their texts are shown with it and a link."""
MAX_DESCRIPTION_LENGTH = 1200
MAX_SUMMARY_LENGTH = 600
"""An encyclopaedia's first paragraph, shortened: enough to say what the place is."""
_SENTENCE_END = re.compile(r"(?<=[.!?…])\s+(?=[«\"(A-ZА-ЯЁ0-9])")


def _visible(char: str) -> str:
    if char.isspace():
        return " "
    return char if char.isprintable() else ""


def single_line(text: str) -> str:
    """Visible text on one line: control characters dropped, any kind of space (a no-break one
    too) turned into a plain space, runs of spaces collapsed."""
    return " ".join("".join(map(_visible, text)).split())


def clip_at_sentence(text: str, limit: int) -> str:
    """At most `limit` characters, cut after the last whole sentence that fits; a single long
    sentence is cut at a word boundary with «…»."""
    text = text.strip()
    if len(text) <= limit:
        return text
    head = text[:limit]
    ends = [match.start() for match in _SENTENCE_END.finditer(text) if match.start() <= limit]
    if ends:
        return text[: ends[-1]].rstrip()
    return head[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,;:-—") + "…"


def may_fill_description(
    current: str, *, credited: bool, written_by_import: bool, replaces_imports: bool
) -> bool:
    """`written_by_import`: the text came from an import and nobody edited it since;
    `replaces_imports`: the incoming source is allowed to replace such text (a travel guide is)."""
    if credited:
        return False
    if not current.strip():
        return True
    return replaces_imports and written_by_import
