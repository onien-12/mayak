"""Demo posts of «Потеряшки» (SPEC §26), added once to any database — a fresh or an existing one.

Dates are relative to the day of start-up, so the posts are never born expired. Three pairs should
meet: keys in Покровский парк (the words agree), a «чёрный кошелёк» and a «тёмное портмоне» (only
the model can tell), a ginger cat on Первая Речка. Two near-misses should not: white earphones lost
on the campus and found on the embankment, 12 km away; a blue umbrella found five days before the
same one was lost on the same square.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.lost_found import LostCategory, LostKind
from app.models import AppliedSnapshot, LostItem, User

SNAPSHOT_NAME = "lost_found_demo"
VERSION = "1"
LOCAL_OFFSET = timedelta(hours=10)
"""Vladivostok is UTC+10: the date people say is the local one."""


@dataclass(frozen=True, slots=True)
class SeedLostItem:
    author: str
    kind: LostKind
    category: LostCategory
    title: str
    description: str
    lat: float
    lng: float
    days_ago: int
    radius_m: int | None = None
    control_question: str | None = None


LOST = LostKind.LOST
FOUND = LostKind.FOUND

ITEMS: tuple[SeedLostItem, ...] = (
    # Pair: the words agree.
    SeedLostItem(
        "nina", LOST, LostCategory.KEYS, "Ключи с брелоком-маяком",
        "Три ключа на кольце, брелок — маленький жёлтый маяк. Гуляла с собакой по Покровскому парку.",
        43.1236, 131.8979, 3, radius_m=300,
    ),
    SeedLostItem(
        "roma", FOUND, LostCategory.KEYS, "Связка ключей с брелоком",
        "Лежали в траве у входа в парк со стороны Океанского проспекта. Отдам хозяину.",
        43.1245, 131.8967, 3, control_question="Что за брелок на кольце?",
    ),
    # Pair: different words, the same thing — the model's part.
    SeedLostItem(
        "dima", LOST, LostCategory.WALLET, "Чёрный кошелёк",
        "Кожаный, на кнопке. Внутри скидочные карты и проездной. Шёл от вокзала к набережной.",
        43.1112, 131.8813, 2, radius_m=1000,
    ),
    SeedLostItem(
        "anya", FOUND, LostCategory.WALLET, "Портмоне тёмное",
        "Нашла на лавочке на Корабельной набережной. Денег нет, какие-то карты. Отдам владельцу.",
        43.1130, 131.8888, 1, control_question="Какие карты внутри?",
    ),
    # Pair: a pet.
    SeedLostItem(
        "vera", LOST, LostCategory.PET, "Рыжий кот Персик",
        "Выскочил из подъезда на Первой Речке. Пугливый, на имя не идёт. Без ошейника.",
        43.1326, 131.9036, 4, radius_m=1000,
    ),
    SeedLostItem(
        "kostya", FOUND, LostCategory.PET, "Рыжий кот без ошейника",
        "Сидит у остановки «Первая Речка», домашний, ласковый. Забрал к себе, накормил.",
        43.1350, 131.9078, 2,
    ),
    # Near-miss: the same kind of thing, but 12 km apart.
    SeedLostItem(
        "yulia", LOST, LostCategory.PHONE, "Белые наушники в кейсе",
        "Беспроводные, кейс с царапиной. Потеряла между корпусами кампуса ДВФУ.",
        43.0245, 131.8923, 2, radius_m=1000,
    ),
    SeedLostItem(
        "gleb", FOUND, LostCategory.PHONE, "Белые наушники",
        "Беспроводные наушники в кейсе, лежали у фонтана на Спортивной набережной.",
        43.1186, 131.8782, 1, control_question="Что нарисовано на кейсе?",
    ),
    # Near-miss: the same umbrella in words and place, but found five days before it was lost.
    SeedLostItem(
        "sveta", LOST, LostCategory.OTHER, "Синий зонт",
        "Складной, ручка с ремешком. Забыла на скамейке на центральной площади.",
        43.1153, 131.8855, 1, radius_m=300,
    ),
    SeedLostItem(
        "igor", FOUND, LostCategory.OTHER, "Синий зонт",
        "Складной зонт на скамейке у памятника на центральной площади.",
        43.1157, 131.8850, 6,
    ),
    # Found things nobody is looking for yet.
    SeedLostItem(
        "marina", FOUND, LostCategory.DOCUMENTS, "Паспорт на имя Ивана С.",
        "Лежал на остановке «Вторая Речка» у кассы. Номер не пишу — пусть хозяин назовёт, что в обложке.",
        43.1640, 131.9300, 1, control_question="Что лежит в обложке?",
    ),
    SeedLostItem(
        "pasha", FOUND, LostCategory.CLOTHES, "Детская варежка",
        "Красная, со снежинкой. Повесил на перила у спуска к воде на набережной Цесаревича.",
        43.1088, 131.8920, 0,
    ),
    SeedLostItem(
        "tim", FOUND, LostCategory.JEWELRY, "Серебряное кольцо",
        "Тонкое, с маленьким камнем. Нашёл на Корабельной набережной у причала.",
        43.1127, 131.8901, 3, control_question="Что выгравировано внутри?",
    ),
)  # fmt: skip


async def apply_lost_found(session: AsyncSession, now: datetime) -> int | None:
    """Add the demo posts once per database; None when already done or the demo users are missing.
    Commits nothing."""
    marker = await session.scalar(select(AppliedSnapshot).where(AppliedSnapshot.name == SNAPSHOT_NAME))
    if marker is not None and marker.version == VERSION:
        return None
    users = {
        user.username: user
        for user in await session.scalars(
            select(User).where(User.username.in_({spec.author for spec in ITEMS}))
        )
    }
    if len(users) < len({spec.author for spec in ITEMS}):
        return None
    today: date = (now + LOCAL_OFFSET).date()
    for index, spec in enumerate(ITEMS):
        session.add(
            LostItem(
                author_id=users[spec.author].id,
                kind=spec.kind,
                category=spec.category,
                title=spec.title,
                description=spec.description,
                lat=spec.lat,
                lng=spec.lng,
                radius_m=spec.radius_m if spec.kind is LostKind.LOST else None,
                happened_on=today - timedelta(days=spec.days_ago),
                control_question=spec.control_question,
                created_at=now - timedelta(days=spec.days_ago, hours=2, minutes=index),
            )
        )
    if marker is None:
        marker = AppliedSnapshot(name=SNAPSHOT_NAME)
        session.add(marker)
    marker.version, marker.applied_at = VERSION, now
    await session.flush()
    return len(ITEMS)
