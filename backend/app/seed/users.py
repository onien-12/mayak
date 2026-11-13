"""Demo accounts (SPEC §10) and the supporting cast that makes votes independent.

`reputation` is what an account earned before the seeded year (backed by early reputation
events); the seeded activity adds to it. It is chosen so that the six demo accounts end up at
the levels the specification asks for.
"""

from app.domain.enums import UserRole
from app.domain.interests import Topic
from app.seed.specs import SeedUser

DEMO_PASSWORD = "mayak2026"

USERS: tuple[SeedUser, ...] = (
    SeedUser(
        "admin",
        "admin@mayak-vl.ru",
        "Администратор",
        30,
        420,
        UserRole.ADMIN,
        "Слежу за тем, чтобы «Маяк» светил.",
    ),
    SeedUser(
        "marina",
        "moderator@mayak-vl.ru",
        "Марина Модератор",
        60,
        400,
        UserRole.MODERATOR,
        "Модератор «Маяка». Проверяю спорные точки и отвечаю на апелляции.",
    ),
    SeedUser(
        "oleg",
        "expert@mayak-vl.ru",
        "Олег Сопкин",
        150,
        390,
        bio="Вожу экскурсии по сопкам и фортам. Знаю, где лучший закат в городе.",
        home=(43.1170, 131.8900, "Центр"),
    ),
    SeedUser(
        "anya",
        "demo@mayak-vl.ru",
        "Аня Приморская",
        10,
        300,
        bio="Живу на Эгершельде, бегаю по набережным и отмечаю на карте всё полезное.",
        home=(43.1360, 131.9030, "Первая Речка"),
    ),
    SeedUser(
        "dima",
        "resident@mayak-vl.ru",
        "Дима Чуркин",
        10,
        120,
        bio="Чуркин — лучший район. Спорт, дворы, виды.",
        home=(43.0920, 131.9170, "Чуркин"),
    ),
    SeedUser("novichok", "newcomer@mayak-vl.ru", "Новичок", 0, 3),
    SeedUser(
        "nina",
        "nina@mayak-vl.ru",
        "Нина Диомид",
        150,
        410,
        bio="Гид-переводчик. Показываю город тем, кто приехал на один день.",
    ),
    SeedUser(
        "vera",
        "vera@mayak-vl.ru",
        "Вера Маячная",
        150,
        370,
        bio="Краевед-любитель. Остров Русский исходила вдоль и поперёк.",
        home=(43.0300, 131.8930, "Остров Русский"),
    ),
    SeedUser(
        "kostya",
        "kostya@mayak-vl.ru",
        "Костя Эгершельд",
        50,
        330,
        bio="Велосипед, маяки и кофе с видом на море.",
        home=(43.0950, 131.8620, "Эгершельд"),
    ),
    SeedUser(
        "lena",
        "lena@mayak-vl.ru",
        "Лена Русская",
        50,
        260,
        bio="Мама двоих детей: знаю все пандусы и пеленальные столики.",
        home=(43.1220, 131.9050, "Некрасовская"),
    ),
    SeedUser(
        "roma", "roma@mayak-vl.ru", "Рома Седанкин", 50, 395, bio="Катаюсь на велосипеде в любую погоду."
    ),
    SeedUser(
        "yulia", "yulia@mayak-vl.ru", "Юля Амурская", 50, 385, bio="Урбанистка. Собираю удобные места города."
    ),
    SeedUser(
        "igor",
        "igor@mayak-vl.ru",
        "Игорь Речной",
        12,
        210,
        bio="Вторая Речка. Играю в стритбол, слежу за дворами.",
        home=(43.1630, 131.9120, "Вторая Речка"),
    ),
    SeedUser(
        "gleb",
        "gleb@mayak-vl.ru",
        "Глеб Окатов",
        12,
        380,
        bio="Чуркин, турники и хорошие виды.",
        home=(43.0890, 131.9120, "Чуркин"),
    ),
    SeedUser(
        "sveta",
        "sveta@mayak-vl.ru",
        "Света Патрокл",
        12,
        160,
        bio="Фотографирую город на плёнку.",
        home=(43.0750, 131.9450, "Патрокл"),
    ),
    SeedUser("pasha", "pasha@mayak-vl.ru", "Паша Тихий", 10, 90),
    SeedUser(
        "tim",
        "tim@mayak-vl.ru",
        "Тимур Снеговой",
        0,
        21,
        bio="Недавно переехал во Владивосток, изучаю город.",
    ),
    SeedUser("promo_vl", "promo@mayak-vl.ru", "Выгодные Туры", 0, 9),
)

DEMO_INTERESTS: dict[str, tuple[Topic, ...]] = {
    "admin": (Topic.ARCHITECTURE, Topic.ART, Topic.FOOD),
    "marina": (Topic.MUSIC, Topic.ART, Topic.LEARNING),
    "oleg": (Topic.HISTORY, Topic.NATURE, Topic.VIEWS),
    "anya": (Topic.SEA, Topic.VIEWS, Topic.HISTORY),
    "dima": (Topic.SPORT, Topic.VIEWS, Topic.UNUSUAL),
}
"""Topics the demo accounts picked after registration (SPEC §23.3), so «Для вас» shows at once.
The newcomer has not answered the picker yet."""
