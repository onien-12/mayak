"""State shared by the seed steps."""

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import Area, Category, Place, Route, User


@dataclass(slots=True)
class SeedContext:
    session: AsyncSession
    settings: Settings
    now: datetime
    users: dict[str, User] = field(default_factory=dict)
    categories: dict[str, Category] = field(default_factory=dict)
    places: dict[str, Place] = field(default_factory=dict)
    areas: dict[str, Area] = field(default_factory=dict)
    routes: dict[str, Route] = field(default_factory=dict)

    def ago(self, days: float) -> datetime:
        return self.now - timedelta(days=days)
