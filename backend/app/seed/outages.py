"""Utility outages of the seed, fed through the same importer path as the live VL.ru data.

They keep the «Отключения» section alive when VL.ru is unreachable; the first real import
resolves them because their numbers are not in the source. House coordinates are approximate.
"""

from app.domain.enums import OutageResource
from app.domain.outages import House
from app.seed.specs import SeedOutage

OUTAGES: tuple[SeedOutage, ...] = (
    SeedOutage(
        number="900101",
        resource=OutageResource.ELECTRICITY,
        description="Ведутся аварийные ремонтные работы на сети электроснабжения",
        initiator="Электрические сети",
        started_hours_ago=3,
        ends_in_hours=4,
        complaints_count=17,
        houses=(
            House("Некрасовская ул. 50", 43.12135, 131.90721),
            House("Некрасовская ул. 52", 43.12160, 131.90770),
            House("Некрасовская ул. 48", 43.12112, 131.90668),
            House("Некрасовская ул. 46", 43.12090, 131.90620),
            House("Океанский пр-т 85", 43.12205, 131.90560),
        ),
    ),
    SeedOutage(
        number="900102",
        resource=OutageResource.HOT_WATER,
        description="Отключение горячего водоснабжения по жалобам жителей",
        initiator=None,
        started_hours_ago=7,
        ends_in_hours=None,
        complaints_count=9,
        houses=(
            House("Русская ул. 46", 43.16668, 131.91284),
            House("Русская ул. 48", 43.16700, 131.91340),
            House("Русская ул. 44", 43.16640, 131.91230),
        ),
    ),
    SeedOutage(
        number="900103",
        resource=OutageResource.HEAT,
        description="Ведутся ремонтные работы на тепловой сети",
        initiator="Тепловые сети",
        started_hours_ago=20,
        ends_in_hours=10,
        complaints_count=31,
        houses=(
            House("Нейбута ул. 30", 43.10972, 131.95953),
            House("Нейбута ул. 32", 43.11000, 131.96010),
            House("Нейбута ул. 28", 43.10945, 131.95900),
            House("Нейбута ул. 26", 43.10920, 131.95850),
            House("Нейбута ул. 34", 43.11025, 131.96065),
            House("Нейбута ул. 36", 43.11052, 131.96120),
            House("Нейбута ул. 38", 43.11078, 131.96176),
            House("Нейбута ул. 40", 43.11104, 131.96230),
            House("Нейбута ул. 24", 43.10894, 131.95798),
            House("Нейбута ул. 22", 43.10868, 131.95745),
            House("Зелёный бульвар 30", 43.11756, 131.96726),
        ),
    ),
    SeedOutage(
        number="900104",
        resource=OutageResource.COLD_WATER,
        description="Отключение холодного водоснабжения в связи с производством аварийных ремонтных работ",
        initiator="Водоканал",
        started_hours_ago=2,
        ends_in_hours=6,
        complaints_count=5,
        houses=(
            House("Кирова ул. 25", 43.17540, 131.90899),
            House("Кирова ул. 27", 43.17570, 131.90940),
            House("Русская ул. 46", 43.16668, 131.91284),
        ),
    ),
)
