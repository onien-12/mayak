"""The demo quest (SPEC §27): six riddles around the historic centre, given to every database once.

Each stage leads to a seeded sight and is passed by arriving there. Riddles and stories retell only
what the sight's own description and tips in the database say — no plaque inscriptions or shop
codes that nobody here has checked. The points are the sights' coordinates as stored, so the quest
follows the places wherever the seed put them.
"""

import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import RouteVisibility
from app.domain.quests import QuestCondition, QuestZone
from app.models import AppliedSnapshot, Route, User
from app.schemas.quest import QuestInput, StageInput
from app.seed.lookup import place_key, seed_objects
from app.services.quests import authoring

logger = logging.getLogger(__name__)

SNAPSHOT_NAME = "demo_quest"
VERSION = "1"
AUTHOR = "nina"
START_PLACE = "ploshad_bortsov"


@dataclass(frozen=True, slots=True)
class DemoStage:
    place: str
    """Seed key of the sight the riddle leads to."""
    riddle: str
    reward: str
    hint: str = ""
    radius_m: int = 40
    zone_radius_m: int | None = None
    """None: the riddle alone; otherwise a search circle of this radius."""


TITLE = "Тайны старого центра"
DESCRIPTION = (
    "Шесть загадок по историческому центру Владивостока — от конца Транссиба до дворов Миллионки и "
    "триумфальной арки. Пешком около полутора часов. Этап засчитывается, когда вы оказываетесь на "
    "месте, поэтому разрешите телефону геолокацию. Можно играть одному или командой: в команде "
    "загадка каждого этапа приходит только одному игроку."
)
START_TITLE = "Площадь Борцов Революции, у монумента"
DURATION_MIN = 90

STAGES: tuple[DemoStage, ...] = (
    DemoStage(
        place="vokzal",
        riddle=(
            "Отсюда до Москвы — девять тысяч двести восемьдесят восемь километров. Найдите здание "
            "в русском стиле, у которого заканчивается самая длинная железная дорога страны."
        ),
        reward=(
            "Это железнодорожный вокзал — конечная станция Транссиба в здании начала XX века. На "
            "перроне стоит столб с отметкой 9288 км и паровоз-памятник. Загляните в зал ожидания и "
            "поднимите голову: потолки там расписаны."
        ),
        hint="Ищите паровоз-памятник на перроне.",
        radius_m=70,
    ),
    DemoStage(
        place="arseniev_museum",
        riddle=(
            "Теперь — по улице, на которой стоит вокзал, до Светланской. Старинный особняк на углу "
            "хранит залы о чжурчжэнях, о первых годах города и о путешествиях человека, чьё имя он "
            "носит."
        ),
        reward=(
            "Музей истории Дальнего Востока имени Арсеньева — главный музей Приморья, в старинном "
            "особняке на углу Светланской и Алеутской. Внутри залы о чжурчжэнях, первых годах "
            "Владивостока и путешествиях Арсеньева. Закладывайте на него не меньше полутора часов — "
            "но уже в другой раз."
        ),
        hint="Особняк стоит на углу Светланской и Алеутской.",
        zone_radius_m=200,
    ),
    DemoStage(
        place="ulitsa_fokina",
        riddle=(
            "У этой улицы московское прозвище. Машин на ней нет — есть фонтаны, летние веранды, "
            "уличные художники и спуск прямо к морю."
        ),
        reward=(
            "Улица Адмирала Фокина — местный «Арбат»: пешеходная, с фонтанами, верандами и уличными "
            "художниками. Она спускается от Океанского проспекта к морю, а внизу, у Спортивной "
            "гавани, открывается залив."
        ),
        hint="Улица спускается от Океанского проспекта к Спортивной гавани.",
        radius_m=60,
    ),
    DemoStage(
        place="millionka",
        riddle=(
            "Совсем рядом прячется лабиринт дворов-колодцев: галереи, железные лестницы и арки помнят "
            "контрабандистов начала прошлого века. Название бывшего квартала звучит как огромная сумма "
            "денег."
        ),
        reward=(
            "Миллионка — бывший китайский квартал: дворы-колодцы с галереями, железными лестницами и "
            "арками, которые помнят опиумные курильни и контрабандистов начала XX века. Сейчас здесь "
            "бары, кофейни и мастерские. Многие дворы проходные — заходите в арки смело."
        ),
        hint="Начните со стороны Семёновской, 3 и двигайтесь к Арбату.",
        radius_m=70,
        zone_radius_m=250,
    ),
    DemoStage(
        place="gum_dvor",
        riddle=(
            "Вернитесь на Светланскую. За аркой большого старого универмага прячется двор с "
            "краснокирпичными складами торгового дома, названного двумя фамилиями."
        ),
        reward=(
            "Старый дворик ГУМа: краснокирпичные склады бывшего торгового дома «Кунст и Альберс» "
            "превратили в уютный квартал с кофейнями, эклерной и дизайнерскими магазинами. Зимой "
            "здесь ставят ёлку и развешивают гирлянды."
        ),
        hint="Вход во двор — через арку со Светланской.",
    ),
    DemoStage(
        place="arka_tsesarevicha",
        riddle=(
            "Финал — у нарядных ворот в русском стиле. Горожане поставили их к приезду наследника "
            "престола, потом ворота снесли, а через сто с лишним лет восстановили по старым чертежам."
        ),
        reward=(
            "Николаевские триумфальные ворота поставили в 1891 году к приезду цесаревича Николая. В "
            "советские годы их снесли, а в 2003-м восстановили по старым чертежам и фотографиям. По "
            "городской примете под аркой нужно пройти, загадав желание, — самое время. Рядом "
            "Адмиральский сквер и подлодка С-56."
        ),
        hint="Ищите арку рядом с Адмиральским сквером и подводной лодкой.",
        zone_radius_m=200,
    ),
)


async def _applied(session: AsyncSession) -> AppliedSnapshot | None:
    return await session.scalar(select(AppliedSnapshot).where(AppliedSnapshot.name == SNAPSHOT_NAME))


async def apply_demo_quest(session: AsyncSession, now: datetime) -> int | None:
    """Add the demo quest once per database; returns its id, None when there was nothing to do.

    A database without the seed's places or its author (a test database, a fresh one before the
    seed) is left alone and asked again at the next start-up. Commits nothing."""
    if (await _applied(session)) is not None:
        return None
    author = await session.scalar(select(User).where(User.username == AUTHOR))
    keyed = await seed_objects(session)
    places = [keyed.places.get(place_key(stage.place)) for stage in STAGES]
    start = keyed.places.get(place_key(START_PLACE))
    if author is None or start is None or any(place is None for place in places):
        return None
    existing = await session.scalar(
        select(Route.id).where(Route.author_id == author.id, Route.title == TITLE)
    )
    quest_id = existing
    if existing is None:
        payload = QuestInput(
            title=TITLE,
            description=DESCRIPTION,
            start_title=START_TITLE,
            start_lat=start.lat,
            start_lng=start.lng,
            duration_min=DURATION_MIN,
            visibility=RouteVisibility.PUBLIC,
            stages=[
                StageInput(
                    title=place.title,
                    lat=place.lat,
                    lng=place.lng,
                    place_id=place.id,
                    riddle=stage.riddle,
                    condition=QuestCondition.ARRIVAL,
                    radius_m=stage.radius_m,
                    hint=stage.hint,
                    reward=stage.reward,
                    zone=QuestZone.CIRCLE if stage.zone_radius_m else QuestZone.RIDDLE,
                    zone_radius_m=stage.zone_radius_m,
                )
                for stage, place in zip(STAGES, places, strict=True)
                if place is not None
            ],
        )
        quest = await authoring.publish_quest(session, author, payload, now, screen=False)
        quest_id = quest.route_id
    session.add(AppliedSnapshot(name=SNAPSHOT_NAME, version=VERSION, applied_at=now))
    await session.flush()
    return quest_id
