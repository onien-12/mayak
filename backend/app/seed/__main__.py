"""CLI: `uv run python -m app.seed [--reset]` seeds the configured database."""

import argparse
import asyncio

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import Database
from app.models import ModerationCase, Place, Route, User
from app.seed.runner import seed_if_empty


async def _print_summary(session: AsyncSession) -> None:
    print("Точки по слоям и статусам:")
    rows = await session.execute(
        select(Place.layer, Place.status, func.count())
        .group_by(Place.layer, Place.status)
        .order_by(Place.layer)
    )
    for layer, status, count in rows:
        print(f"  {layer.value:<15} {status.value:<13} {count}")
    routes = await session.scalar(select(func.count()).select_from(Route))
    cases = await session.scalar(select(func.count()).select_from(ModerationCase))
    print(f"Маршруты: {routes}, обращения модерации: {cases}")
    print("Пользователи:")
    for user in await session.scalars(select(User).order_by(User.reputation.desc())):
        print(f"  {user.email:<24} {user.reputation:>4}  {user.level.value}")


async def _main(reset: bool) -> None:
    settings = get_settings()
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    database = Database(settings.database_url)
    try:
        if reset:
            await database.drop_schema()
        await database.create_schema()
        async with database.session_factory() as session:
            seeded = await seed_if_empty(session, settings)
            print(
                "База заполнена демо-данными."
                if seeded
                else "База уже содержит данные — используйте --reset."
            )
            await _print_summary(session)
    finally:
        await database.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Заполнить базу «Маяка» демо-данными.")
    parser.add_argument("--reset", action="store_true", help="удалить все данные и заполнить базу заново")
    asyncio.run(_main(parser.parse_args().reset))


if __name__ == "__main__":
    main()
