"""Which routes are quests, for the code that screens, moderates and links routes (SPEC §27).

A quest is a `Route` underneath; everything that lists or opens routes leaves quests out, and
everything that tells an author about a route sends them to the quest instead.
"""

from sqlalchemy import ColumnElement, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Photo, Quest, QuestStage, Route


def quest_link(quest_id: int) -> str:
    return f"/quests/{quest_id}"


def is_quest_clause() -> ColumnElement[bool]:
    return Route.id.in_(select(Quest.route_id))


async def is_quest(session: AsyncSession, route_id: int) -> bool:
    return await session.scalar(select(Quest.route_id).where(Quest.route_id == route_id)) is not None


async def find_quest(session: AsyncSession, route_id: int) -> Quest | None:
    """The quest with its stages; None when the route is an ordinary one."""
    return await session.scalar(
        select(Quest)
        .where(Quest.route_id == route_id)
        .options(selectinload(Quest.stages), selectinload(Quest.cover_photo))
    )


async def photos(session: AsyncSession, route_id: int) -> list[Photo]:
    """The cover and the riddle photos of a quest, for the moderator's case page."""
    quest = await session.scalar(
        select(Quest)
        .where(Quest.route_id == route_id)
        .options(selectinload(Quest.cover_photo), selectinload(Quest.stages).selectinload(QuestStage.photo))
    )
    if quest is None:
        return []
    found = [quest.cover_photo, *(stage.photo for stage in quest.stages)]
    return list({photo.id: photo for photo in found if photo is not None}.values())
