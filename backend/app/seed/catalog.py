"""Category catalog (SPEC §9): slug, layer, group, name, icon and the form fields."""

from typing import Any

from app.domain.enums import Layer

Field = dict[str, Any]


def _boolean(key: str, label: str) -> Field:
    return {"key": key, "label": label, "type": "boolean"}


def _text(key: str, label: str) -> Field:
    return {"key": key, "label": label, "type": "text"}


def _number(key: str, label: str, unit: str) -> Field:
    return {"key": key, "label": label, "type": "number", "unit": unit}


def _select(key: str, label: str, options: dict[str, str]) -> Field:
    return {
        "key": key,
        "label": label,
        "type": "select",
        "options": [{"value": value, "label": text} for value, text in options.items()],
    }


FREE = _boolean("free", "Бесплатно")
ACCESSIBLE = _boolean("accessible", "Доступно для маломобильных")
HOURS = _text("hours", "Режим работы")
CONDITION = _select(
    "condition", "Состояние", {"good": "Хорошее", "ok": "Удовлетворительное", "bad": "Плохое"}
)
LIGHTING = _boolean("lighting", "Есть освещение")
SURFACE = _select(
    "surface",
    "Покрытие",
    {
        "rubber": "Резиновое",
        "asphalt": "Асфальт",
        "turf": "Искусственный газон",
        "ground": "Грунт",
        "concrete": "Бетон",
    },
)
ACCESS = _text("access", "Как попасть")
INFO_SOURCE = _text("info_source", "Источник информации")
DIFFICULTY = _select("difficulty", "Сложность", {"easy": "Лёгкая", "medium": "Средняя", "hard": "Сложная"})
PARKING = _boolean("parking", "Есть парковка")
ENTRY_FEE = _number("price", "Стоимость входа", "₽")
ORGANIZER = _text("organizer", "Организатор")

SANITARY = "Санитарно-бытовые"
MEDICINE = "Медицина"
ACCESSIBILITY = "Доступная среда"
PUBLIC = "Общественные"
SPORT = "Спорт и отдых"
EVENTS = "События"
TOURISM = "Интересные места"
ISSUES = "Проблемы"

SPORT_KIND = _select(
    "sport",
    "Вид спорта",
    {
        "multi": "Универсальная",
        "volleyball": "Волейбол",
        "tennis": "Теннис",
        "hockey": "Хоккей",
        "athletics": "Лёгкая атлетика",
        "other": "Другое",
    },
)
SPORT_FIELDS = [FREE, LIGHTING, SURFACE, HOURS]
MEDICAL_FIELDS = [HOURS, ACCESS, INFO_SOURCE, ACCESSIBLE]
ACCESSIBILITY_FIELDS = [CONDITION, HOURS, _text("note", "Особенности")]
EVENT_FIELDS = [ORGANIZER, ACCESSIBLE]
SWAP_FIELDS = [_text("offer", "Что отдают"), _boolean("bring_own", "Можно принести своё")]
HELP_FIELDS = [_text("bring", "Что взять с собой")]
VENUE_FIELDS = [
    _text("activities", "Что можно провести"),
    _number("capacity", "Вмещает", "чел."),
    FREE,
    _number("price", "Стоимость", "₽ в час"),
    _text("booking", "Как договориться"),
    HOURS,
    ACCESSIBLE,
]
SIGHT_FIELDS = [FREE, ENTRY_FEE, HOURS, ACCESSIBLE]
OUTDOOR_FIELDS = [DIFFICULTY, PARKING, FREE, ACCESSIBLE]
ISSUE_FIELDS = [_text("cause", "Причина")]

Row = tuple[str, Layer, str, str, str, list[Field]]

CATEGORIES: tuple[Row, ...] = (
    (
        "toilet",
        Layer.INFRASTRUCTURE,
        SANITARY,
        "Туалет",
        "toilet",
        [
            FREE,
            _number("price", "Стоимость", "₽"),
            ACCESSIBLE,
            _boolean("changing_table", "Пеленальный столик"),
            HOURS,
            CONDITION,
        ],
    ),
    ("shower", Layer.INFRASTRUCTURE, SANITARY, "Душ", "shower-head", [FREE, HOURS, CONDITION]),
    (
        "baby_room",
        Layer.INFRASTRUCTURE,
        SANITARY,
        "Комната матери и ребёнка",
        "baby",
        [FREE, _boolean("changing_table", "Пеленальный столик"), HOURS, ACCESSIBLE],
    ),
    (
        "drinking_water",
        Layer.INFRASTRUCTURE,
        SANITARY,
        "Питьевая вода",
        "droplet",
        [FREE, _boolean("seasonal", "Работает только в тёплый сезон"), HOURS],
    ),
    ("first_aid", Layer.INFRASTRUCTURE, MEDICINE, "Пункт первой помощи", "cross", MEDICAL_FIELDS),
    ("defibrillator", Layer.INFRASTRUCTURE, MEDICINE, "Дефибриллятор", "heart-pulse", MEDICAL_FIELDS),
    ("first_aid_kit", Layer.INFRASTRUCTURE, MEDICINE, "Аптечка", "briefcase-medical", MEDICAL_FIELDS),
    ("ramp", Layer.INFRASTRUCTURE, ACCESSIBILITY, "Пандус", "accessibility", ACCESSIBILITY_FIELDS),
    (
        "elevator",
        Layer.INFRASTRUCTURE,
        ACCESSIBILITY,
        "Лифт или подъёмник",
        "arrow-up-down",
        ACCESSIBILITY_FIELDS,
    ),
    (
        "accessible_crossing",
        Layer.INFRASTRUCTURE,
        ACCESSIBILITY,
        "Доступный переход",
        "footprints",
        [_boolean("sound_signal", "Звуковой сигнал"), _boolean("tactile", "Тактильная плитка"), CONDITION],
    ),
    (
        "accessible_parking",
        Layer.INFRASTRUCTURE,
        ACCESSIBILITY,
        "Парковка для инвалидов",
        "square-parking",
        [_number("spots", "Количество мест", "шт."), FREE, CONDITION],
    ),
    (
        "accessible_entrance",
        Layer.INFRASTRUCTURE,
        ACCESSIBILITY,
        "Доступный вход",
        "door-open",
        ACCESSIBILITY_FIELDS,
    ),
    (
        "public_space",
        Layer.INFRASTRUCTURE,
        PUBLIC,
        "Общественное пространство",
        "trees",
        [FREE, ACCESSIBLE, HOURS],
    ),
    (
        "rest_place",
        Layer.INFRASTRUCTURE,
        PUBLIC,
        "Место для отдыха",
        "armchair",
        [FREE, ACCESSIBLE, _boolean("shelter", "Есть навес")],
    ),
    (
        "charging",
        Layer.INFRASTRUCTURE,
        PUBLIC,
        "Зарядка",
        "battery-charging",
        [FREE, _select("kind", "Тип", {"gadgets": "Для гаджетов", "ev": "Для электромобилей"}), HOURS],
    ),
    ("wifi", Layer.INFRASTRUCTURE, PUBLIC, "Wi-Fi", "wifi", [FREE, _text("network", "Название сети"), HOURS]),
    ("library", Layer.INFRASTRUCTURE, PUBLIC, "Библиотека", "library", [FREE, HOURS, ACCESSIBLE]),
    ("venue", Layer.INFRASTRUCTURE, PUBLIC, "Площадка для встреч", "presentation", VENUE_FIELDS),
    (
        "sports_ground",
        Layer.INFRASTRUCTURE,
        SPORT,
        "Спортивная площадка",
        "dumbbell",
        [SPORT_KIND, *SPORT_FIELDS],
    ),
    ("basketball", Layer.INFRASTRUCTURE, SPORT, "Баскетбольная площадка", "dribbble", SPORT_FIELDS),
    ("football", Layer.INFRASTRUCTURE, SPORT, "Футбольное поле", "goal", SPORT_FIELDS),
    ("skatepark", Layer.INFRASTRUCTURE, SPORT, "Скейт-парк", "zap", SPORT_FIELDS),
    ("workout", Layer.INFRASTRUCTURE, SPORT, "Воркаут", "biceps-flexed", SPORT_FIELDS),
    ("table_tennis", Layer.INFRASTRUCTURE, SPORT, "Настольный теннис", "table-2", SPORT_FIELDS),
    (
        "playground",
        Layer.INFRASTRUCTURE,
        SPORT,
        "Детская площадка",
        "toy-brick",
        [SURFACE, LIGHTING, CONDITION, ACCESSIBLE],
    ),
    ("culture", Layer.EVENT, EVENTS, "Культура", "drama", EVENT_FIELDS),
    ("city", Layer.EVENT, EVENTS, "Городские события", "building-2", EVENT_FIELDS),
    ("sport", Layer.EVENT, EVENTS, "Спорт", "trophy", EVENT_FIELDS),
    ("education", Layer.EVENT, EVENTS, "Образование", "graduation-cap", EVENT_FIELDS),
    ("entertainment", Layer.EVENT, EVENTS, "Развлечения", "party-popper", EVENT_FIELDS),
    ("swap", Layer.EVENT, EVENTS, "Раздача и барахолка", "gift", SWAP_FIELDS),
    ("help", Layer.EVENT, EVENTS, "Нужна помощь", "hand-helping", HELP_FIELDS),
    ("historic", Layer.TOURISM, TOURISM, "История", "landmark", SIGHT_FIELDS),
    ("architecture", Layer.TOURISM, TOURISM, "Архитектура", "building", SIGHT_FIELDS),
    (
        "food",
        Layer.TOURISM,
        TOURISM,
        "Еда",
        "utensils",
        [_number("avg_check", "Средний чек", "₽"), _text("cuisine", "Кухня"), HOURS, ACCESSIBLE],
    ),
    ("nature", Layer.TOURISM, TOURISM, "Природа", "mountain", OUTDOOR_FIELDS),
    ("viewpoint", Layer.TOURISM, TOURISM, "Видовая площадка", "binoculars", OUTDOOR_FIELDS),
    ("unusual", Layer.TOURISM, TOURISM, "Необычное", "sparkles", SIGHT_FIELDS),
    ("culture_space", Layer.TOURISM, TOURISM, "Культурное пространство", "palette", SIGHT_FIELDS),
    (
        "utilities",
        Layer.ISSUE,
        ISSUES,
        "Коммунальные отключения",
        "plug-zap",
        [
            _select(
                "service",
                "Что отключено",
                {
                    "cold_water": "Холодная вода",
                    "hot_water": "Горячая вода",
                    "heat": "Отопление",
                    "electricity": "Электричество",
                    "gas": "Газ",
                    "other": "Другое",
                },
            ),
            _text("cause", "Причина"),
        ],
    ),
    ("roads", Layer.ISSUE, ISSUES, "Дороги и транспорт", "construction", ISSUE_FIELDS),
    ("improvement", Layer.ISSUE, ISSUES, "Благоустройство", "trash-2", ISSUE_FIELDS),
    ("hazard", Layer.ISSUE, ISSUES, "Опасность", "triangle-alert", ISSUE_FIELDS),
    ("public_space_issue", Layer.ISSUE, ISSUES, "Общественные пространства", "fence", ISSUE_FIELDS),
)
