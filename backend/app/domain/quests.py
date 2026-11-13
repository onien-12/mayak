"""Rules of quests (SPEC §27): how a stage is passed, the search zone, team turns and the result.

A quest is a chain of stages; a player sees only the stage they are on. Everything here is pure:
the services decide who asks and what is stored, these functions decide what the answer is.
"""

import hashlib
import math
import secrets
import unicodedata
from collections.abc import Sequence
from datetime import datetime, timedelta
from enum import StrEnum

from app.domain import geo


class QuestCondition(StrEnum):
    """How the player proves they found the place of a stage."""

    ARRIVAL = "arrival"
    """The player's position is within the stage radius."""
    CODE = "code"
    """A code learnt on site: from a person, a shop, a sign."""
    ANSWER = "answer"
    """An answer to the author's question about the place."""


class QuestZone(StrEnum):
    """What the player gets besides the riddle."""

    RIDDLE = "riddle"
    """Only the riddle."""
    CIRCLE = "circle"
    """An approximate circle on the map whose centre is moved off the real point."""


MIN_STAGES = 2
MAX_STAGES = 20
ARRIVAL_RADIUS_M = 40
MIN_ARRIVAL_RADIUS_M = 20
MAX_ARRIVAL_RADIUS_M = 200
ZONE_RADIUS_M = 250
MIN_ZONE_RADIUS_M = 150
MAX_ZONE_RADIUS_M = 500
MIN_DURATION_MIN = 10
MAX_DURATION_MIN = 600
MAX_ANSWERS = 10
MAX_TEAM_SIZE = 8

ACCURACY_ALLOWANCE_M = 20
"""The most a poor GPS fix may add to the stage radius: phones in old-town courtyards are often
off by tens of metres, but a generous allowance would let the arrival check be passed from afar."""
MAX_WRONG_TRIES = 5
COOLDOWN = timedelta(minutes=1)
"""After `MAX_WRONG_TRIES` wrong tries on a stage the run waits this long: enough to make guessing
codes or probing coordinates pointless, short enough not to spoil the game."""
HINT_PENALTY_MIN = 5

_METERS_PER_DEGREE_LAT = 111_320.0
_ZONE_SHIFT = (0.3, 0.7)
"""How far from the real point the centre of the search circle moves, as a share of its radius."""
JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
"""No 0/O and 1/I: the code is read aloud and typed on a phone."""
JOIN_CODE_LENGTH = 6
_SPACES = " \t\n\r "
_DASHES = "‐‑‒–—―"


def normalize_answer(text: str) -> str:
    """A code or an answer as compared: case, surrounding and repeated spaces, «ё»/«е», dashes and
    the closing full stop do not matter."""
    folded = unicodedata.normalize("NFKC", text).casefold().replace("ё", "е")
    for dash in _DASHES:
        folded = folded.replace(dash, "-")
    words = folded.translate({ord(space): " " for space in _SPACES}).split()
    return " ".join(words).rstrip(".!")


def answer_matches(given: str, accepted: Sequence[str]) -> bool:
    expected = {normalize_answer(answer) for answer in accepted}
    expected.discard("")
    return normalize_answer(given) in expected


def is_on_site(
    lat: float, lng: float, accuracy_m: float | None, stage_lat: float, stage_lng: float, radius_m: int
) -> bool:
    """Within the stage radius, with a little of the reported inaccuracy forgiven."""
    allowance = min(max(accuracy_m or 0.0, 0.0), ACCURACY_ALLOWANCE_M)
    return geo.haversine_m(lat, lng, stage_lat, stage_lng) <= radius_m + allowance


def zone_center(seed: str, lat: float, lng: float, radius_m: int) -> tuple[float, float]:
    """Centre of the search circle: moved off the real point in a direction and by a distance that
    depend only on `seed`, so the circle is the same on every request and the point is always
    inside it, but the centre does not give the place away."""
    digest = hashlib.sha256(seed.encode()).digest()
    bearing = int.from_bytes(digest[:4], "big") / 2**32 * 2 * math.pi
    low, high = _ZONE_SHIFT
    share = low + (high - low) * int.from_bytes(digest[4:8], "big") / 2**32
    shift = radius_m * share
    dlat = shift * math.cos(bearing) / _METERS_PER_DEGREE_LAT
    dlng = shift * math.sin(bearing) / (_METERS_PER_DEGREE_LAT * math.cos(math.radians(lat)))
    return round(lat + dlat, 6), round(lng + dlng, 6)


def new_join_code() -> str:
    return "".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(JOIN_CODE_LENGTH))


def normalize_join_code(code: str) -> str:
    return "".join(code.split()).upper()


def next_lead(members: Sequence[int], current: int | None) -> int | None:
    """The member who holds the next riddle: the one after `current` in the order they joined."""
    if not members:
        return None
    if current not in members:
        return members[0]
    return members[(members.index(current) + 1) % len(members)]


def locked_until(wrong_tries: int, now: datetime) -> datetime | None:
    """When the run may try again after a wrong try; None while tries are left."""
    return now + COOLDOWN if wrong_tries >= MAX_WRONG_TRIES else None


def tries_left(wrong_tries: int) -> int:
    return max(MAX_WRONG_TRIES - wrong_tries, 0)


def result_seconds(started_at: datetime, finished_at: datetime, hints: int) -> int:
    """Time on the results board: from the start to the last stage plus the hint penalty."""
    elapsed = max(int((finished_at - started_at).total_seconds()), 0)
    return elapsed + hints * HINT_PENALTY_MIN * 60
