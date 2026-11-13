"""Address normalisation for the «проверить адрес» search over outage houses."""

import re

_TOKEN_RE = re.compile(r"[0-9a-zа-я]+(?:/[0-9a-zа-я]+)?")
_HOUSE_RE = re.compile(r"\s+\d[\w/-]*(?:\s*(?:к|корп|стр)\.?\s*\d+)?\s*$", re.IGNORECASE)
NOISE_TOKENS = frozenset(
    {
        "ул",
        "улица",
        "д",
        "дом",
        "г",
        "город",
        "владивосток",
        "пр",
        "т",
        "просп",
        "проспект",
        "пер",
        "переулок",
    }
)


def address_tokens(text: str) -> list[str]:
    """Lower-cased meaningful tokens: «ул. Тухачевского, д. 24» → ["тухачевского", "24"]."""
    normalised = text.casefold().replace("ё", "е")
    return [token for token in _TOKEN_RE.findall(normalised) if token not in NOISE_TOKENS]


def address_key(address: str) -> str:
    """Tokens joined and padded with spaces, so that SQL `LIKE '% token%'` matches whole-token prefixes."""
    return f" {' '.join(address_tokens(address))} "


def token_pattern(token: str) -> str:
    """LIKE pattern for a query token: house numbers match exactly, words match by prefix."""
    return f"% {token} %" if token[0].isdigit() else f"% {token}%"


def street_of(address: str) -> str:
    """The address without its house number: «Сельская ул. 8» → «Сельская ул.»."""
    return _HOUSE_RE.sub("", address).strip() or address.strip()
