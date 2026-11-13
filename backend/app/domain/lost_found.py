"""«Потеряшки» — lost and found things (SPEC §26): the kinds, the lifetime of a post and the matcher.

A lost post and a found post are compared by four things: the category, how far the found point
is from where the thing was lost (against how sure the owner is about the place), the dates (a
thing cannot be found long before it was lost) and the words of the title and the description.
This is the deterministic first step: it picks the shortlist and orders it. The second step, a
model's judgement of shortlisted pairs, only moves a pair up or down (services/lost_found). The
score itself is never shown — people read the order and a plain reason line.
"""

import re
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from enum import StrEnum

from app.domain import geo


class LostKind(StrEnum):
    LOST = "lost"
    FOUND = "found"


class LostCategory(StrEnum):
    DOCUMENTS = "documents"
    KEYS = "keys"
    PHONE = "phone"
    WALLET = "wallet"
    BAG = "bag"
    CLOTHES = "clothes"
    JEWELRY = "jewelry"
    PET = "pet"
    OTHER = "other"


CATEGORY_LABELS: dict[LostCategory, str] = {
    LostCategory.DOCUMENTS: "документы",
    LostCategory.KEYS: "ключи",
    LostCategory.PHONE: "телефон и техника",
    LostCategory.WALLET: "кошелёк и карты",
    LostCategory.BAG: "сумка или рюкзак",
    LostCategory.CLOTHES: "одежда",
    LostCategory.JEWELRY: "украшения и часы",
    LostCategory.PET: "животное",
    LostCategory.OTHER: "другое",
}


class LostState(StrEnum):
    ACTIVE = "active"
    RETURNED = "returned"
    """«Вернули хозяину»: closed by the author."""
    EXPIRED = "expired"


class ResponseState(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class MatchVerdict(StrEnum):
    """The model's opinion of a shortlisted pair."""

    LIKELY = "likely"
    POSSIBLE = "possible"
    UNLIKELY = "unlikely"


RADII_M: tuple[int, ...] = (300, 1000, 3000)
"""How sure the owner is about the place; no radius means «не знаю где» (the whole city)."""
SEARCH_RADIUS_M = 1000
"""A search with a point but no radius."""
LIFETIME = timedelta(days=30)
MAX_PHOTOS = 3
POSTS_PER_DAY = 5
RESPONSES_PER_DAY = 10
REPORTS_TO_HIDE = 3
MAX_DAYS_BACK = 90
"""The oldest date a post may say the thing was lost or found."""

SHORTLIST_SCORE = 0.45
STRONG_SCORE = 0.8
"""Without the model's judgement, a pair this good is worth telling the other author about."""
_WEIGHTS = {"category": 0.3, "distance": 0.25, "date": 0.15, "text": 0.3}
_RANK_BOOST = {MatchVerdict.LIKELY: 0.25, MatchVerdict.POSSIBLE: 0.0, MatchVerdict.UNLIKELY: -0.3}
_UNKNOWN_DISTANCE = 0.5
_UNKNOWN_DATE = 0.6
_UNKNOWN_CATEGORY = 0.5
_OTHER_CATEGORY = 0.5
_SIMILAR_TEXT = 0.5
_SAME_SPOT_M = 50


def expires_at(created_at: datetime) -> datetime:
    return created_at + LIFETIME


def state(created_at: datetime, closed_at: datetime | None, now: datetime) -> LostState:
    """Computed on read: no job closes old posts."""
    if closed_at is not None:
        return LostState.RETURNED
    return LostState.EXPIRED if now >= expires_at(created_at) else LostState.ACTIVE


# ── Words ─────────────────────────────────────────────────────────────────────────────────

_WORD = re.compile(r"[0-9a-zа-я]+")
_ENDINGS = tuple(
    sorted(
        (
            "ыми", "ими", "ого", "его", "ому", "ему", "ая", "яя", "ое", "ее", "ые", "ие", "ый", "ий",
            "ой", "ую", "юю", "ах", "ях", "ам", "ям", "ом", "ем", "ов", "ев", "ей", "ью", "ия", "ла",
            "ли", "ло", "а", "я", "о", "е", "ы", "и", "у", "ю", "ь", "й",
        ),
        key=len,
        reverse=True,
    )
)  # fmt: skip
_MIN_STEM = 3
_KEY_LENGTH = 5
_STOP_TEXT = (
    "и в во на с со у к ко по за из от до о об не ни я мы мой моя мое мои наш это этот эта где "
    "около возле рядом был была было были потерял потеряла потеряли потерялся потерялась нашел "
    "нашла нашли найден найдена найдено найдены вещь очень там тут его ее их или а но что как при "
    "для без под над кто то же уже еще просьба помогите пожалуйста кто-то сегодня вчера"
)
_STOP_WORDS = frozenset(_STOP_TEXT.split())
COLOUR_KEYS = frozenset(
    {"черн", "бел", "красн", "син", "зелен", "сер", "корич", "желт", "розов", "голуб", "темн",
     "светл", "оранж", "фиоле", "бежев", "золот", "сереб", "рыж"}
)  # fmt: skip
"""Colours count, but only as a hint: «чёрная сумка» is not «чёрный кошелёк»."""


def normalize(text: str) -> str:
    return text.casefold().replace("ё", "е")


def stem(word: str) -> str:
    """A crude Russian stem: the longest known ending is cut while three letters remain, and only
    the first five letters are kept — «кошелёк» and «кошелька», «чёрный» and «чёрного» meet."""
    if not word.isalpha():
        return word
    for ending in _ENDINGS:
        if word.endswith(ending) and len(word) - len(ending) >= _MIN_STEM:
            word = word[: -len(ending)]
            break
    return word[:_KEY_LENGTH]


def keys(text: str) -> frozenset[str]:
    """The words of a text that can meet the words of another one."""
    words = _WORD.findall(normalize(text))
    return frozenset(
        stem(word) for word in words if word not in _STOP_WORDS and (len(word) >= _MIN_STEM or word.isdigit())
    )


@dataclass(frozen=True, slots=True)
class Likeness:
    things: float
    """Share of the shorter side's non-colour words found on the other side, 0..1."""
    colour: float
    """1 — a shared colour, 0 — both say a colour and they differ, 0.5 — unknown."""

    @property
    def score(self) -> float:
        return 0.8 * self.things + 0.2 * self.colour


def likeness(first: str, second: str) -> Likeness:
    first_keys, second_keys = keys(first), keys(second)
    first_things, second_things = first_keys - COLOUR_KEYS, second_keys - COLOUR_KEYS
    shorter = min(len(first_things), len(second_things))
    things = len(first_things & second_things) / shorter if shorter else 0.0
    first_colours, second_colours = first_keys & COLOUR_KEYS, second_keys & COLOUR_KEYS
    both_say = bool(first_colours and second_colours)
    colour = (1.0 if first_colours & second_colours else 0.0) if both_say else 0.5
    return Likeness(things=things, colour=colour)


# ── Matching ──────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class Post:
    """What the matcher reads of a post — or of a search, where anything may be unknown."""

    title: str
    description: str = ""
    category: LostCategory | None = None
    point: tuple[float, float] | None = None
    radius_m: int | None = None
    """Lost side only: None — «не знаю где»."""
    happened_on: date | None = None

    @property
    def text(self) -> str:
        return f"{self.title} {self.description}"


@dataclass(frozen=True, slots=True)
class Fit:
    """How well a found post fits a lost one. `score` is internal and never shown."""

    score: float
    same_category: bool
    distance_m: float | None
    """Only when the owner knows the place."""
    days_after: int | None
    """Days from the loss to the find; -1 is allowed (people get the date wrong by a day)."""
    similar_text: bool


def _category_factor(lost: LostCategory | None, found: LostCategory | None) -> float | None:
    """None: the categories exclude each other."""
    if lost is None or found is None:
        return _UNKNOWN_CATEGORY
    if lost is found:
        return 1.0
    if LostCategory.OTHER in (lost, found):
        return _OTHER_CATEGORY
    return None


def _distance_factor(distance_m: float, radius_m: int) -> float | None:
    if distance_m <= radius_m:
        return 1.0 - 0.5 * distance_m / radius_m
    if distance_m <= 2 * radius_m:
        return 0.5 - 0.4 * (distance_m - radius_m) / radius_m
    return None


def _date_factor(days_after: int) -> float | None:
    if days_after < -1:
        return None
    if days_after <= 1:
        return 1.0
    return max(0.4, 1.0 - 0.6 * (days_after - 1) / 29)


def _text_likeness(lost: Post, found: Post) -> Likeness:
    """The best of: each title against the other post's whole text, and the two texts — a long
    description must not drown a title that names the same thing."""
    options = (
        likeness(lost.title, found.text),
        likeness(lost.text, found.title),
        likeness(lost.text, found.text),
    )
    return max(options, key=lambda option: (option.things, option.score))


def fit(lost: Post, found: Post) -> Fit | None:
    """None when the found thing cannot be the lost one: another category (unless the words say
    otherwise), found too far from where it was lost, or found before it was lost."""
    text = _text_likeness(lost, found)
    category = _category_factor(lost.category, found.category)
    if category is None:
        # Another category: only when the words clearly name the same thing («ключи в кошельке»).
        if text.things < _SIMILAR_TEXT:
            return None
        category = 0.0
    either_other = LostCategory.OTHER in (lost.category, found.category)
    if either_other and lost.category is not found.category and text.things == 0:
        return None
    distance_m = None
    distance = _UNKNOWN_DISTANCE
    if lost.point is not None and found.point is not None:
        measured = geo.haversine_m(*lost.point, *found.point)
        if lost.radius_m is not None:
            factor = _distance_factor(measured, lost.radius_m)
            if factor is None:
                return None
            distance, distance_m = factor, measured
    days_after = None
    when = _UNKNOWN_DATE
    if lost.happened_on is not None and found.happened_on is not None:
        days_after = (found.happened_on - lost.happened_on).days
        factor = _date_factor(days_after)
        if factor is None:
            return None
        when = factor
    score = (
        _WEIGHTS["category"] * category
        + _WEIGHTS["distance"] * distance
        + _WEIGHTS["date"] * when
        + _WEIGHTS["text"] * text.score
    )
    return Fit(
        score=round(score, 4),
        same_category=lost.category is not None and lost.category is found.category,
        distance_m=distance_m,
        days_after=days_after,
        similar_text=text.things >= _SIMILAR_TEXT,
    )


def shortlisted(found: Fit | None) -> bool:
    return found is not None and found.score >= SHORTLIST_SCORE


_CATEGORY_WORDS: dict[LostCategory, str] = {
    LostCategory.DOCUMENTS: "паспорт документы права снилс полис студенческий пропуск удостоверение "
    "загранпаспорт свидетельство",
    LostCategory.KEYS: "ключи ключ брелок домофон",
    LostCategory.PHONE: "телефон смартфон айфон iphone наушники airpods планшет ноутбук зарядка плеер "
    "фотоаппарат",
    LostCategory.WALLET: "кошелёк портмоне бумажник карта картхолдер визитница",
    LostCategory.BAG: "сумка рюкзак пакет чемодан барсетка портфель",
    LostCategory.CLOTHES: "куртка шапка шарф перчатки варежка кофта пальто ботинки кроссовки",
    LostCategory.JEWELRY: "кольцо серьги серёжка цепочка браслет кулон часы",
    LostCategory.PET: "кот кошка котёнок собака пёс щенок попугай хомяк",
}
_CATEGORY_KEYS: dict[LostCategory, frozenset[str]] = {
    category: keys(words) for category, words in _CATEGORY_WORDS.items()
}


def guess_category(text: str) -> LostCategory | None:
    """The category a search names by its words («кошелёк» — кошелёк и карты), when only one fits."""
    said = keys(text)
    named = [category for category, words in _CATEGORY_KEYS.items() if said & words]
    return named[0] if len(named) == 1 else None


def search_fit(query: Post, found: Post) -> Fit | None:
    """A search before anything is published. Without a chosen category the words name one
    («потерял кошелёк» finds «портмоне»); when they name none, the words themselves must meet."""
    if query.category is None and (guessed := guess_category(query.text)) is not None:
        return fit(replace(query, category=guessed), found)
    result = fit(query, found)
    if result is None:
        return None
    if query.category is None and keys(query.text) and likeness(query.text, found.text).things == 0:
        return None
    return result


def rank(found: Fit, verdict: MatchVerdict | None) -> float:
    return found.score + (_RANK_BOOST[verdict] if verdict is not None else 0.0)


def shown(found: Fit, verdict: MatchVerdict | None) -> bool:
    """A pair the model calls different stays only when the rules alone make it a good one."""
    return rank(found, verdict) >= SHORTLIST_SCORE


def is_strong(found: Fit, verdict: MatchVerdict | None) -> bool:
    """Worth a notification: the model says it is likely the same thing, or — when there is no
    judgement — the rules alone are sure."""
    if verdict is not None:
        return verdict is MatchVerdict.LIKELY and found.score >= SHORTLIST_SCORE
    return found.score >= STRONG_SCORE


def _distance_phrase(distance_m: float) -> str:
    if distance_m < _SAME_SPOT_M:
        return "на том же месте"
    if distance_m < 1000:
        return f"{round(distance_m / 50) * 50} м от места"
    return f"{distance_m / 1000:.1f} км от места".replace(".", ",")


def _days_phrase(days: int) -> str:
    if days <= 0:
        return "в тот же день"
    if days == 1:
        return "на следующий день"
    tail = days % 100
    if 11 <= tail <= 14 or days % 10 in (0, 5, 6, 7, 8, 9):
        word = "дней"
    else:
        word = "день" if days % 10 == 1 else "дня"
    return f"через {days} {word}"


def reason(found: Fit, verdict: MatchVerdict | None) -> str:
    """«Та же категория, 200 м от места, на следующий день» — what makes the pair a pair."""
    parts: list[str] = []
    if found.same_category:
        parts.append("та же категория")
    if found.distance_m is not None:
        parts.append(_distance_phrase(found.distance_m))
    if found.days_after is not None:
        parts.append(_days_phrase(found.days_after))
    if verdict is MatchVerdict.LIKELY:
        parts.append("похоже по описанию")
    elif found.similar_text:
        parts.append("похожее описание")
    line = ", ".join(parts) or "может подойти"
    return line[0].upper() + line[1:]
