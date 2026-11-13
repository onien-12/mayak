"""Pieces shared by every importer of external data: system authors and the run log."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ExternalSourceId
from app.models import ImportRun, User

UNUSABLE_PASSWORD_HASH = "!"
"""Not a valid hash: nobody can log in as a system author."""


@dataclass(frozen=True, slots=True)
class SystemAuthor:
    email: str
    username: str
    display_name: str
    bio: str


_VL_RU_BIO = "Автоматический импорт из открытого источника VL.ru."
SYSTEM_AUTHORS: dict[ExternalSourceId, SystemAuthor] = {
    ExternalSourceId.VL_RU: SystemAuthor("afisha@mayak-vl.ru", "afisha_vl", "Афиша VL.ru", _VL_RU_BIO),
    ExternalSourceId.VL_RU_OFF: SystemAuthor("off@mayak-vl.ru", "off_vl", "Отключения VL.ru", _VL_RU_BIO),
    ExternalSourceId.OSM: SystemAuthor(
        "osm@mayak-vl.ru",
        "openstreetmap",
        "OpenStreetMap",
        "Объекты из открытой карты OpenStreetMap (© участники OpenStreetMap, ODbL). "
        "Жители подтверждают их на месте.",
    ),
    ExternalSourceId.WIKIVOYAGE: SystemAuthor(
        "wikivoyage@mayak-vl.ru",
        "wikivoyage",
        "Викигид",
        "Места из свободного путеводителя Викигид (ru.wikivoyage.org, CC BY-SA). "
        "Описания написаны путешественниками; жители подтверждают их на месте.",
    ),
}


async def system_author(session: AsyncSession, source: ExternalSourceId, now: datetime) -> User:
    """The technical account that owns everything imported from the source."""
    spec = SYSTEM_AUTHORS[source]
    author = await session.scalar(select(User).where(User.email == spec.email))
    if author is None:
        author = User(
            email=spec.email,
            username=spec.username,
            display_name=spec.display_name,
            password_hash=UNUSABLE_PASSWORD_HASH,
            is_system=True,
            bio=spec.bio,
            created_at=now,
        )
        session.add(author)
        await session.flush()
    return author


def record_run(
    session: AsyncSession, source: ExternalSourceId, summary: dict[str, int], now: datetime
) -> None:
    session.add(ImportRun(source=source, finished_at=now, summary=summary))
