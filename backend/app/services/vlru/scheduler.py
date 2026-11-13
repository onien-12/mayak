"""One background loop that runs the VL.ru import jobs on their own intervals."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import utcnow
from app.core.config import Settings
from app.services.vlru import afisha_importer, outages_importer
from app.services.vlru.client import VlRuClient

logger = logging.getLogger(__name__)

AFISHA_INTERVAL = timedelta(hours=12)
OUTAGES_INTERVAL = timedelta(minutes=20)

ImportJob = Callable[[AsyncSession, VlRuClient, datetime], Awaitable[object]]


@dataclass(frozen=True, slots=True)
class ScheduledJob:
    name: str
    interval: timedelta
    run: ImportJob


def enabled_jobs(settings: Settings) -> list[ScheduledJob]:
    jobs: list[ScheduledJob] = []
    if settings.outages_import_enabled:
        jobs.append(ScheduledJob("outages", OUTAGES_INTERVAL, outages_importer.run_import))
    if settings.afisha_import_enabled:
        jobs.append(ScheduledJob("afisha", AFISHA_INTERVAL, afisha_importer.run_import))
    return jobs


class VlRuScheduler:
    """Runs every job at startup and then on its interval. A failing job never stops the loop."""

    def __init__(
        self, session_factory: async_sessionmaker[AsyncSession], client: VlRuClient, jobs: list[ScheduledJob]
    ) -> None:
        self._session_factory = session_factory
        self._client = client
        self._jobs = jobs
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._jobs:
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
        await self._client.aclose()

    async def _run(self, job: ScheduledJob) -> None:
        try:
            async with self._session_factory() as session:
                await job.run(session, self._client, utcnow())
        except Exception:
            logger.exception("VL.ru import job %r failed", job.name)

    async def _loop(self) -> None:
        due = dict.fromkeys((job.name for job in self._jobs), utcnow())
        while True:
            for job in self._jobs:
                if due[job.name] <= utcnow():
                    await self._run(job)
                    due[job.name] = utcnow() + job.interval
            pause = min(due.values()) - utcnow()
            await asyncio.sleep(max(pause.total_seconds(), 1.0))
