"""Interests: topics of objects, a person's interest profile and how the two match (SPEC §23).

Pure rules: the topic catalogue, rule tags (category, area kind, keyword lexicon), the weight of a
topic for a person, match, the personal interest of an area, the recommendation score with its
diversity rule and the affinity changes of every signal. Nothing here touches the database.
"""

import hashlib
import math
import re
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum

from app.domain.enums import AreaKind


class Topic(StrEnum):
    SEA = "sea"
    VIEWS = "views"
    HISTORY = "history"
    ARCHITECTURE = "architecture"
    NATURE = "nature"
    ART = "art"
    MUSIC = "music"
    FOOD = "food"
    SPORT = "sport"
    FAMILY = "family"
    LEARNING = "learning"
    FUN = "fun"
    UNUSUAL = "unusual"


class InterestTarget(StrEnum):
    PLACE = "place"
    AREA = "area"


class TagMethod(StrEnum):
    RULE = "rule"
    LLM = "llm"


class TagBasis(StrEnum):
    """Where a tag came from; the merged weight of a topic is the maximum over them."""

    CATEGORY = "category"
    """The category of a place or the kind of an area."""
    KEYWORD = "keyword"
    """The lexicon over title, tags and description; replaced by LLM tags once there are any."""
    INSIDE = "inside"
    """Inherited by an area from the public places inside it."""
    LLM = "llm"


BASIS_METHOD: dict[TagBasis, TagMethod] = {
    TagBasis.CATEGORY: TagMethod.RULE,
    TagBasis.KEYWORD: TagMethod.RULE,
    TagBasis.INSIDE: TagMethod.RULE,
    TagBasis.LLM: TagMethod.LLM,
}


@dataclass(frozen=True, slots=True)
class TopicInfo:
    slug: Topic
    label: str
    description: str


CATALOGUE: tuple[TopicInfo, ...] = (
    TopicInfo(Topic.SEA, "Море и берег", "набережные, пляжи, бухты, маяки, острова, яхты"),
    TopicInfo(Topic.VIEWS, "Виды и панорамы", "смотровые, сопки, закаты, мосты"),
    TopicInfo(Topic.HISTORY, "История", "форты, батареи, памятники, старый город"),
    TopicInfo(Topic.ARCHITECTURE, "Архитектура", "здания, кварталы, мосты как сооружения"),
    TopicInfo(Topic.NATURE, "Природа и тропы", "парки, леса, тропы, ботаника"),
    TopicInfo(Topic.ART, "Искусство и культура", "музеи, театры, галереи, выставки"),
    TopicInfo(Topic.MUSIC, "Музыка", "концерты, фестивали, джаз, клубные вечера"),
    TopicInfo(Topic.FOOD, "Еда и кофе", "кафе, рынки, гастрономия"),
    TopicInfo(Topic.SPORT, "Спорт и движение", "площадки, пробежки, игры, йога"),
    TopicInfo(Topic.FAMILY, "С детьми", "детские площадки, мастер-классы и спектакли для детей"),
    TopicInfo(Topic.LEARNING, "Лекции и мастерские", "лекции, мастер-классы, библиотеки, экскурсии"),
    TopicInfo(Topic.FUN, "Развлечения", "шоу, квизы, вечеринки, аттракционы"),
    TopicInfo(Topic.UNUSUAL, "Необычное", "нишевые, странные, «для своих» места"),
)
TOPIC_ORDER: dict[Topic, int] = {info.slug: index for index, info in enumerate(CATALOGUE)}

# --- Topics of an object (§23.2) ----------------------------------------------------------------

CATEGORY_WEIGHT = 0.8
KEYWORD_WEIGHT = 0.6
INSIDE_BASE = 0.3
INSIDE_MAX = 0.8
LLM_MAX_TOPICS = 4
SHOWN_TOPICS = 4
SHOWN_MIN_WEIGHT = 0.3
"""Weaker tags still count in matching but are not listed as what an object is about."""
RULES_VERSION = 1
"""Bump when the maps or the lexicon change: rule tags are then recomputed at start-up."""

CATEGORY_TOPICS: dict[str, tuple[Topic, ...]] = {
    # tourism
    "historic": (Topic.HISTORY,),
    "architecture": (Topic.ARCHITECTURE,),
    "food": (Topic.FOOD,),
    "nature": (Topic.NATURE,),
    "viewpoint": (Topic.VIEWS,),
    "unusual": (Topic.UNUSUAL,),
    "culture_space": (Topic.ART,),
    # events
    "culture": (Topic.ART,),
    "city": (Topic.FUN,),
    "sport": (Topic.SPORT,),
    "education": (Topic.LEARNING,),
    "entertainment": (Topic.FUN,),
    # infrastructure: feeds the topics of its area, never recommended itself
    "playground": (Topic.FAMILY,),
    "baby_room": (Topic.FAMILY,),
    "library": (Topic.LEARNING,),
    "sports_ground": (Topic.SPORT,),
    "basketball": (Topic.SPORT,),
    "football": (Topic.SPORT,),
    "skatepark": (Topic.SPORT,),
    "workout": (Topic.SPORT,),
    "table_tennis": (Topic.SPORT,),
}

AREA_KIND_TOPICS: dict[AreaKind, tuple[Topic, ...]] = {
    AreaKind.BEACH: (Topic.SEA,),
    AreaKind.EMBANKMENT: (Topic.SEA,),
    AreaKind.ISLAND: (Topic.SEA, Topic.NATURE),
    AreaKind.VIEWPOINT: (Topic.VIEWS,),
    AreaKind.PARK: (Topic.NATURE,),
    AreaKind.QUARTER: (Topic.ARCHITECTURE,),
    AreaKind.CAMPUS: (Topic.LEARNING,),
}

# Stems match at the start of a word; a trailing "$" means the whole word. Text is case-folded,
# «ё» becomes «е» and hyphens become spaces, so «мастер-класс» is written «мастер класс».
LEXICON: dict[Topic, tuple[str, ...]] = {
    Topic.SEA: (
        "море$", "моря$", "морю$", "морем$", "морск", "моряк", "набережн", "пляж", "бухт", "маяк",
        "остров", "яхт", "залив", "побережь", "берег", "гаван", "причал", "пирс", "океан", "мыс$",
        "мыса$", "мысе$", "мысу$", "корабл", "катер$", "катера$", "катере$", "парус", "прибой",
        "серф", "акватор", "босфор", "золотой рог", "подводн лодк", "субмарин", "ледокол",
        "крейсер", "флот",
    ),
    Topic.VIEWS: (
        "смотров", "видова", "видово", "видовы", "видову", "панорам", "закат", "рассвет", "сопк",
        "вершин", "обзорн площадк", "вид на", "виды на", "мост", "фуникулер", "колесо обозрения",
        "скала$", "скалы$", "утес", "обрыв", "орлиное гнездо",
    ),
    Topic.HISTORY: (
        "форт$", "форта$", "форту$", "форты$", "фортов$", "фортом$", "фортификац", "батаре",
        "памятн", "памятник", "монумент", "мемориал", "обелиск", "крепост", "истори", "старин",
        "старый город", "старого города", "дот$", "капонир", "редут", "укреплен", "бомбоубежищ",
        "военн", "войн", "ветеран", "героям", "героев", "революц", "дореволюц", "советск",
        "имперск", "царск", "купеческ", "легион", "орудие", "орудия", "захоронен", "кладбищ",
        "некропол", "миллионк", "краевед", "археолог",
    ),
    Topic.ARCHITECTURE: (
        "архитект", "здани", "особняк", "усадьб", "дворец", "дворц", "квартал", "собор", "храм",
        "церк", "костел", "кирх", "синагог", "мечет", "вокзал", "мост", "башн", "модерн",
        "конструктив", "ампир", "фасад", "доходный дом", "доходного дома", "арка$", "арки$",
        "арку$", "триумфальн", "колонн", "купол", "зодч", "небоскреб", "высотк",
    ),
    Topic.NATURE: (
        "парк$", "парка$", "парке$", "парку$", "парком$", "парки$", "лесопарк", "лес$", "леса$",
        "лесу$", "лесн", "лесом$", "троп", "экотроп", "ботаническ", "ботаник", "сад$", "сада$",
        "саду$", "сады$", "природ", "заповедн", "заказник", "водопад", "озер", "пруд", "рощ",
        "ущель", "кедр", "сосн", "дубрав", "тайг", "птиц", "эколог", "цветени", "сакур", "поход",
        "треккинг", "полуостров",
    ),
    Topic.ART: (
        "музе", "театр", "галере", "выставк", "экспозиц", "искусств", "художеств", "художник",
        "спектакл", "балет", "опера$", "оперы$", "опере$", "оперу$", "оперн", "оперетт", "мюзикл",
        "картин$", "картина", "картины", "картину", "картинн", "живопис", "скульпт", "кино",
        "фильм", "литератур", "поэз", "поэт", "стихи$", "драм", "арт$", "art$", "стрит арт",
        "граффити", "перформанс", "инсталляц", "фотовыставк", "фотограф", "мариинск", "культурн",
    ),
    Topic.MUSIC: (
        "концерт", "музык", "джаз", "рок$", "рока$", "рок н ролл", "блюз", "фестивал", "оркестр",
        "хор$", "хора$", "хоров", "вокал", "песн", "песен", "диджей", "dj$", "квартирник",
        "фортепиан", "скрипк", "виолончел", "симфони", "филармон", "рэп", "хип хоп", "опера$",
        "мюзикл", "орган$", "органн", "гитар", "саксофон", "кавер", "трибьют", "акустич", "бард",
    ),
    Topic.FOOD: (
        "кафе", "ресторан", "кофе", "кофейн", "бар$", "бара$", "баре$", "бару$", "бары$", "баров$",
        "паб$", "пабы$",
        "рынок", "рынк", "гастроном", "гастробар", "гастрофест", "гастропаб", "еда$", "еды$",
        "кухн", "ужин", "завтрак", "обед", "чай$", "чая$", "чаем$", "чайн", "чаевн", "чайхан",
        "пекарн", "булочн", "морепродукт", "дегустац", "пицц", "суши", "вино$", "вина$", "винн",
        "пиво", "пивн", "крафт", "фуд", "столов", "кулинар", "блюд", "бистро", "кондитер",
        "десерт", "мороженое", "устриц", "краб", "гребешк",
    ),
    Topic.SPORT: (
        "спорт", "стадион", "пробежк", "бег$", "бегом$", "бегов", "забег", "марафон", "йога",
        "йоги$", "йогу$", "йогой$", "йог$", "фитнес", "трениров", "турник", "воркаут",
        "баскетбол", "футбол", "волейбол", "теннис", "хоккей", "каток", "катк", "лыж", "велосипед",
        "вело", "скейт", "самокат", "плаван", "бассейн", "сап$", "сапборд", "серфинг",
        "скалодром", "зарядк", "турнир", "атлет", "кроссфит", "борьб", "бокс", "единоборств",
        "гимнаст", "зумба", "пилатес", "стретчинг",
    ),
    Topic.FAMILY: (
        "детск", "для детей", "дети$", "детей$", "детям$", "ребен", "ребят", "малыш", "семейн",
        "семья$", "семьи$", "семьей$", "семьям$", "карусел", "зоопарк", "кукольн", "сказк",
        "мультфильм", "мультик", "аниматор", "школьник", "юных$", "юные$", "юным$", "подростк",
        "родител", "дошкольн", "утренник",
    ),
    Topic.LEARNING: (
        "лекци", "лектори", "мастер класс", "мастерск", "библиотек", "экскурс", "семинар",
        "курс$", "курса$", "курсы$", "курсов$", "урок", "занятие", "занятия", "занятий",
        "обучен", "научн", "наук", "лаборатор", "университет", "двфу", "тренинг", "воркшоп",
        "презентац", "день открытых дверей", "кружок", "кружк", "образоват", "просветит",
        "краевед", "чтени", "книг",
    ),
    Topic.FUN: (
        "шоу", "квиз", "вечеринк", "аттракцион", "развлеч", "праздник", "дискотек", "стендап",
        "стенд ап", "stand up", "юмор", "комеди", "цирк", "колесо обозрения", "квест", "караоке",
        "викторин", "пикник", "ярмарк", "маркет", "фейерверк", "салют", "карнавал", "танц",
        "игра$", "игры$", "игру$", "игрой$", "игр$", "игров", "настольн", "боулинг", "бильярд",
        "картинг", "батут", "лазертаг", "пейнтбол",
    ),
    Topic.UNUSUAL: (
        "необычн", "заброш", "странн", "секретн", "тайн", "мистич", "загадоч", "подземн", "скрыт",
        "андеграунд", "для своих", "нишев", "лофт", "арт объект",
    ),
}  # fmt: skip

_LETTER = "0-9a-zа-я"
_SPACES = re.compile(r"[\s\-‐-―]+")


def normalize(text: str) -> str:
    """Case-folded, «ё» → «е», hyphens and runs of whitespace → one space."""
    return _SPACES.sub(" ", text.casefold().replace("ё", "е")).strip()


def _pattern(stems: Iterable[str]) -> re.Pattern[str]:
    parts = []
    for stem in stems:
        body = re.escape(normalize(stem.removesuffix("$")))
        parts.append(f"{body}(?![{_LETTER}])" if stem.endswith("$") else body)
    return re.compile(f"(?<![{_LETTER}])(?:{'|'.join(parts)})")


_PATTERNS: dict[Topic, re.Pattern[str]] = {topic: _pattern(stems) for topic, stems in LEXICON.items()}


def keyword_topics(text: str) -> set[Topic]:
    """Topics whose lexicon occurs in the text."""
    normalized = normalize(text)
    return {topic for topic, pattern in _PATTERNS.items() if pattern.search(normalized)}


def category_tags(topics: Iterable[Topic]) -> dict[Topic, float]:
    return dict.fromkeys(topics, CATEGORY_WEIGHT)


def keyword_tags(*texts: str | None) -> dict[Topic, float]:
    return dict.fromkeys(keyword_topics(" \n ".join(text for text in texts if text)), KEYWORD_WEIGHT)


def place_category_topics(category_slug: str) -> tuple[Topic, ...]:
    return CATEGORY_TOPICS.get(category_slug, ())


def area_kind_topics(kind: AreaKind) -> tuple[Topic, ...]:
    return AREA_KIND_TOPICS.get(kind, ())


def inside_tags(members: Sequence[Iterable[Topic]]) -> dict[Topic, float]:
    """Inherited by an area: a topic carried by share `s` of its public places weighs min(0.8, 0.3 + s)."""
    if not members:
        return {}
    counts: dict[Topic, int] = {}
    for topics in members:
        for topic in set(topics):
            counts[topic] = counts.get(topic, 0) + 1
    return {
        topic: round(min(INSIDE_MAX, INSIDE_BASE + count / len(members)), 4)
        for topic, count in counts.items()
    }


def merge(*tag_sets: Mapping[Topic, float]) -> dict[Topic, float]:
    """The maximum weight of every topic wins."""
    merged: dict[Topic, float] = {}
    for tags in tag_sets:
        for topic, weight in tags.items():
            merged[topic] = max(weight, merged.get(topic, 0.0))
    return merged


def strongest(tags: Mapping[Topic, float], limit: int = SHOWN_TOPICS) -> list[Topic]:
    """What an object is about, strongest first (catalogue order breaks ties)."""
    shown = [topic for topic, weight in tags.items() if weight >= SHOWN_MIN_WEIGHT]
    return sorted(shown, key=lambda topic: (-tags[topic], TOPIC_ORDER[topic]))[:limit]


def clamp_weight(value: float) -> float:
    return min(max(value, 0.0), 1.0)


def fingerprint(*parts: object) -> str:
    """Digest of the text that was classified: an edited object is classified again."""
    joined = "\x1f".join("" if part is None else str(part) for part in parts)
    return hashlib.sha1(joined.encode("utf-8"), usedforsecurity=False).hexdigest()


# --- Interest profile (§23.3) -------------------------------------------------------------------

CHOSEN_SHARE = 0.6
LEARNED_SHARE = 0.4
AFFINITY_SCALE = 3.0
AFFINITY_MIN = -3.0
AFFINITY_MAX = 6.0
NOTICED_MIN_WEIGHT = 0.15

FAVORITE_DELTA = 1.0
COLLECTION_DELTA = 1.0
EVENT_DELTA = 0.8
SEARCH_DELTA = 0.3
SEARCH_MIN_LENGTH = 3
REVIEW_DELTAS: dict[int, float] = {5: 1.0, 4: 0.6, 3: 0.0, 2: -0.4, 1: -0.6}

Profile = dict[Topic, float]
"""Weight `u` of every topic that matters to a person (only u > 0 is kept)."""


def user_weight(chosen: bool, affinity: float) -> float:
    """u = clamp(0.6·chosen + 0.4·tanh(affinity / 3), 0, 1)."""
    value = CHOSEN_SHARE * (1.0 if chosen else 0.0) + LEARNED_SHARE * math.tanh(affinity / AFFINITY_SCALE)
    return clamp_weight(value)


def profile_of(rows: Iterable[tuple[Topic, bool, float]]) -> Profile:
    """`(topic, chosen, affinity)` rows → the profile."""
    profile: Profile = {}
    for topic, chosen, affinity in rows:
        weight = user_weight(chosen, affinity)
        if weight > 0:
            profile[topic] = weight
    return profile


def profile_from_topics(topics: Iterable[Topic]) -> Profile:
    """A visitor without an account: the topics they picked count as chosen."""
    return {topic: user_weight(True, 0.0) for topic in topics}


def is_noticed(chosen: bool, affinity: float) -> bool:
    """Learned from behaviour and not chosen («мы заметили»)."""
    return not chosen and user_weight(False, affinity) >= NOTICED_MIN_WEIGHT


def clamp_affinity(value: float) -> float:
    return min(max(value, AFFINITY_MIN), AFFINITY_MAX)


def affinity_changes(tags: Mapping[Topic, float], delta: float) -> dict[Topic, float]:
    """A signal on an object moves every topic of it by `delta`, weighted by the object's tag."""
    if delta == 0:
        return {}
    return {topic: delta * weight for topic, weight in tags.items() if weight > 0}


def review_delta(new_rating: int, old_rating: int | None) -> float:
    """A replaced review only moves the difference."""
    old = REVIEW_DELTAS[old_rating] if old_rating is not None else 0.0
    return REVIEW_DELTAS[new_rating] - old


# --- Match and personal interest (§23.4) --------------------------------------------------------

REASON_TOPICS = 2
PERSONAL_UP = 0.5
PERSONAL_DOWN = 0.1
PERSONAL_FIT = 0.25
"""From this match on a location fits the person: nothing is taken off and the reasons are shown."""


def match(profile: Mapping[Topic, float], tags: Mapping[Topic, float]) -> float:
    """1 − Π (1 − u_t · w_t) over the object's topics; 0 without a profile or topics."""
    miss = 1.0
    for topic, weight in tags.items():
        miss *= 1.0 - profile.get(topic, 0.0) * clamp_weight(weight)
    return 1.0 - miss


def reasons(profile: Mapping[Topic, float], tags: Mapping[Topic, float]) -> list[Topic]:
    """The one or two topics with the largest u_t · w_t, strongest first."""
    scored = [(profile.get(topic, 0.0) * weight, topic) for topic, weight in tags.items()]
    scored = [(score, topic) for score, topic in scored if score > 0]
    scored.sort(key=lambda item: (-item[0], TOPIC_ORDER[item[1]]))
    return [topic for _, topic in scored[:REASON_TOPICS]]


def fits(match_value: float) -> bool:
    """Enough of a match to say «для вас» and name the reasons."""
    return match_value >= PERSONAL_FIT


def personal_interest(interest: int, match_value: float) -> int:
    """interest + match · 0.5 · (100 − interest) − unfit · 0.1 · interest, rounded, 0..100.

    `unfit` falls from 1 at no match to 0 at `PERSONAL_FIT`: a location that fits the person is
    never shown lower than it is for everyone, however high its interest already is.
    """
    unfit = max(0.0, 1.0 - match_value / PERSONAL_FIT)
    value = interest + match_value * PERSONAL_UP * (100 - interest) - unfit * PERSONAL_DOWN * interest
    return min(max(round(value), 0), 100)


# --- Recommendations (§23.5) --------------------------------------------------------------------

MIN_MATCH = 0.15
PER_LEADING_TOPIC = 3
DISCOVERY_EVERY = 3
"""Every third result is a discovery: a little-known object that matches, not the best-rated one."""
QUALITY_BASE = 0.6
QUALITY_SHARE = 0.4
TRUSTED_EVENT_QUALITY = 1.0
OTHER_EVENT_QUALITY = 0.7
USEFULNESS_BASE = 0.7
USEFULNESS_SHARE = 0.3


def area_quality(interest: int) -> float:
    return min(max(interest, 0), 100) / 100


def place_quality(trust_score: int, rating_avg: float | None) -> float:
    """0.5·trust/100 + 0.5·(rating − 1)/4; trust alone when unrated."""
    trust = min(max(trust_score, 0), 100) / 100
    if rating_avg is None:
        return trust
    return 0.5 * trust + 0.5 * clamp_weight((rating_avg - 1) / 4)


def event_quality(trusted_source: bool, verified: bool) -> float:
    return TRUSTED_EVENT_QUALITY if trusted_source or verified else OTHER_EVENT_QUALITY


def with_usefulness(quality: float, usefulness: int | None) -> float:
    """§24.3: quality · (0.7 + 0.3 · usefulness / 100) when the hidden usefulness is known."""
    if usefulness is None:
        return quality
    return quality * (USEFULNESS_BASE + USEFULNESS_SHARE * clamp_weight(usefulness / 100))


def score(match_value: float, quality: float) -> float:
    """Quality only nudges: score = match · (0.6 + 0.4 · quality)."""
    return match_value * (QUALITY_BASE + QUALITY_SHARE * clamp_weight(quality))


def diversify[T](ranked: Iterable[T], leading_topic: Callable[[T], Topic], limit: int) -> list[T]:
    """Best first, at most three per leading topic — then, if places are left, the rest by rank.

    The cap keeps the top of the list from being one theme; it must not shorten the list of a
    person with one or two interests.
    """
    taken: list[T] = []
    passed_over: list[T] = []
    per_topic: dict[Topic, int] = {}
    for item in ranked:
        topic = leading_topic(item)
        if per_topic.get(topic, 0) >= PER_LEADING_TOPIC:
            passed_over.append(item)
            continue
        per_topic[topic] = per_topic.get(topic, 0) + 1
        taken.append(item)
        if len(taken) >= limit:
            return taken
    return [*taken, *passed_over[: limit - len(taken)]]


_TITLE_WORD_RE = re.compile(r"[a-zа-я0-9]+")


def title_key(title: str) -> str:
    """Titles that read the same: case, «ё», quotes and punctuation make no difference."""
    return " ".join(_TITLE_WORD_RE.findall(title.casefold().replace("ё", "е")))


def without_repeats[T](ranked: Iterable[T], key: Callable[[T], str]) -> list[T]:
    """The best of every group that shares a key — a recurring event or a twice-mapped museum once."""
    seen: set[str] = set()
    kept: list[T] = []
    for item in ranked:
        item_key = key(item)
        if item_key in seen:
            continue
        seen.add(item_key)
        kept.append(item)
    return kept


def arrange[T](
    ranked: Sequence[T],
    leading_topic: Callable[[T], Topic],
    discoveries: Sequence[T],
    limit: int,
) -> list[T]:
    """`diversify`, with every third place given to the next discovery (those already in order).

    Quality pulls the well-known to the top; the discoveries are how a niche object that fits is
    seen at all. They obey the same cap per leading topic. Without discoveries this is exactly
    `diversify`.
    """
    taken: list[T] = []
    used: set[int] = set()
    per_topic: dict[Topic, int] = {}

    def take(pool: Sequence[T], *, capped: bool) -> bool:
        for item in pool:
            topic = leading_topic(item)
            if id(item) in used or (capped and per_topic.get(topic, 0) >= PER_LEADING_TOPIC):
                continue
            used.add(id(item))
            per_topic[topic] = per_topic.get(topic, 0) + 1
            taken.append(item)
            return True
        return False

    while len(taken) < limit:
        wants_discovery = (len(taken) + 1) % DISCOVERY_EVERY == 0
        if wants_discovery and take(discoveries, capped=True):
            continue
        if not (take(ranked, capped=True) or take(ranked, capped=False)):
            break
    return taken
