"""Runner of the screening window (SPEC §24): one job per item, never inside the request with a model.

A job reads what to check in one short database session, asks the model without holding the
database (the text once, every photo on its own), then decides in a second session. If the
item changed meanwhile (a new revision of its hold), the old answers are dropped and the job
runs again. Without a model there is nothing to wait for: the fallback is applied at once,
inside the request that published the item.
"""

import asyncio
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi import Request
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import utcnow
from app.core.config import Settings
from app.domain import ai_moderation
from app.domain.ai_moderation import AiOpinion
from app.domain.enums import ACTIVE_HOLD_STATES, AiTarget, HoldSource, HoldState, RouteVisibility
from app.models import Comment, MapNote, Photo, QuietHold, Review
from app.services import place_queries, quiet_holds, routes
from app.services.ai_moderation import effects, prompts, subjects
from app.services.ai_moderation.client import PHOTO_CHECK, TEXT_REVIEW, AiClient, ResponseFormat
from app.services.ai_moderation.subjects import Subject

logger = logging.getLogger(__name__)

_JPEG_QUALITY = 80
SWEEP_INTERVAL_S = 60.0
STUCK_AFTER = timedelta(minutes=2)
"""A window older than this with no job running is re-submitted by the sweep."""

Parser = Callable[[Any], AiOpinion | None]
Key = tuple[AiTarget, int]


def downscale_image(path: Path) -> bytes | None:
    """JPEG of at most 1024 px for the model; None when the file cannot be read."""
    try:
        with Image.open(path) as image:
            preview = image.convert("RGB")
            preview.thumbnail((ai_moderation.IMAGE_SIDE_PX, ai_moderation.IMAGE_SIDE_PX))
            buffer = BytesIO()
            preview.save(buffer, format="JPEG", quality=_JPEG_QUALITY)
    except OSError:
        return None
    return buffer.getvalue()


@dataclass(slots=True)
class _Job:
    """What one screening window needs checked, read before the model is asked."""

    hold_id: int
    revision: int
    subject: Subject | None
    """None: no text to ask about (a photo, or text already held by the heuristics)."""
    has_text: bool
    photos: list[tuple[int, str | None]] = field(default_factory=list)
    """`(photo id, file name in the media directory)`; None for a file that is not ours."""


class AiScreener:
    """Runs screening jobs and never lets a failure escape."""

    def __init__(
        self,
        client: AiClient | None,
        session_factory: async_sessionmaker[AsyncSession],
        settings: Settings,
    ) -> None:
        self._client = client
        self._session_factory = session_factory
        self._model = settings.llm_moderation_model
        self._media_dir = settings.media_dir
        self._check_images = settings.llm_moderation_images
        self._daily_limit = settings.llm_moderation_daily_limit
        self._tasks: set[asyncio.Task[None]] = set()
        self._running: set[Key] = set()
        self._again: set[Key] = set()
        self._calls_on: tuple[date, int] = (utcnow().date(), 0)

    @property
    def enabled(self) -> bool:
        return self._client is not None

    async def submit(self, target_type: AiTarget, target_id: int) -> None:
        """Check an item in its screening window; a no-op for anything not in one.

        With a model the check runs in the background, so publishing is never slowed down.
        Without one the fallback is applied right away.
        """
        if not self.enabled:
            await self._run(target_type, target_id)
            return
        self._spawn(target_type, target_id)

    async def submit_all(self, target_type: AiTarget, target_ids: list[int]) -> None:
        for target_id in target_ids:
            await self.submit(target_type, target_id)

    def _spawn(self, target_type: AiTarget, target_id: int) -> None:
        key = (target_type, target_id)
        if key in self._running:
            self._again.add(key)
            return
        self._running.add(key)
        task = asyncio.create_task(self._job_loop(key))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _job_loop(self, key: Key) -> None:
        try:
            while True:
                self._again.discard(key)
                await self._run(*key)
                if key not in self._again:
                    return
        finally:
            self._running.discard(key)

    async def drain(self) -> None:
        """Wait for the running jobs (tests, shutdown)."""
        while self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

    async def resubmit_stuck(self, *, older_than: timedelta | None = None) -> int:
        """Windows left open by a restart or a failed job are checked again; returns how many."""
        statement = select(QuietHold.target_type, QuietHold.target_id).where(
            QuietHold.state == HoldState.SCREENING, QuietHold.parent_type.is_(None)
        )
        if older_than is not None:
            statement = statement.where(QuietHold.updated_at < utcnow() - older_than)
        async with self._session_factory() as session:
            stuck = [(target_type, target_id) for target_type, target_id in await session.execute(statement)]
        stuck = [key for key in stuck if key not in self._running]
        for target_type, target_id in stuck:
            await self.submit(target_type, target_id)
        return len(stuck)

    async def _run(self, target_type: AiTarget, target_id: int) -> None:
        try:
            async with self._session_factory() as session:
                job = await self._load(session, target_type, target_id)
            if job is None:
                return
            checked = await self._check(job)
            async with self._session_factory() as session:
                hold = await session.get(QuietHold, job.hold_id)
                if hold is None or hold.revision != job.revision or hold.state not in ACTIVE_HOLD_STATES:
                    if hold is not None and hold.state in ACTIVE_HOLD_STATES and self.enabled:
                        self._again.add((target_type, target_id))
                    return
                await effects.apply(session, hold, checked, model=self._model, now=utcnow())
                await session.commit()
        except Exception:
            logger.exception("Screening of %s %s failed", target_type.value, target_id)

    async def _load(self, session: AsyncSession, target_type: AiTarget, target_id: int) -> _Job | None:
        hold = await quiet_holds.find(session, target_type, target_id)
        if hold is None or hold.state not in ACTIVE_HOLD_STATES or hold.parent_type is not None:
            return None
        if target_type is AiTarget.PHOTO:
            photo = await session.get(Photo, target_id)
            files = [(target_id, _file_name(photo))] if photo is not None else []
            return _Job(hold.id, hold.revision, None, has_text=False, photos=files)
        subject = await _subject(session, target_type, target_id)
        if subject is None:
            return None
        held_by_heuristics = hold.source is HoldSource.HEURISTIC and bool(hold.reasons)
        photos: list[tuple[int, str | None]] = []
        for child in await quiet_holds.children(session, hold):
            if child.target_type is AiTarget.PHOTO and child.state is HoldState.SCREENING:
                photo = await session.get(Photo, child.target_id)
                photos.append((child.target_id, _file_name(photo) if photo is not None else None))
        return _Job(
            hold.id,
            hold.revision,
            None if held_by_heuristics else subject,
            has_text=not held_by_heuristics,
            photos=photos,
        )

    async def _check(self, job: _Job) -> effects.Checked:
        text = None
        if job.subject is not None:
            content = prompts.build_text_content(job.subject.kind, job.subject.fields)
            text = await self._ask(
                prompts.TEXT_SYSTEM_PROMPT, content, TEXT_REVIEW, ai_moderation.parse_text_opinion
            )
        photos = [(photo_id, await self._check_photo(name)) for photo_id, name in job.photos]
        return effects.Checked(text_checked=job.has_text, text=text, photos=photos)

    async def _check_photo(self, file_name: str | None) -> AiOpinion | None:
        if self._client is None or not self._check_images or file_name is None:
            return None
        image = await asyncio.to_thread(downscale_image, self._media_dir / file_name)
        if image is None:
            return None
        content = prompts.build_photo_content(image)
        return await self._ask(
            prompts.PHOTO_SYSTEM_PROMPT, content, PHOTO_CHECK, ai_moderation.parse_photo_opinion
        )

    def _take_quota(self) -> bool:
        today = utcnow().date()
        day, calls = self._calls_on
        calls = calls if day == today else 0
        if calls >= self._daily_limit:
            return False
        self._calls_on = (today, calls + 1)
        return True

    async def _ask(
        self,
        system_prompt: str,
        content: list[dict[str, Any]],
        response_format: ResponseFormat,
        parse: Parser,
    ) -> AiOpinion | None:
        """One request within the time limit; None when there is no usable answer."""
        if self._client is None:
            return None
        if not self._take_quota():
            logger.warning("Screening daily limit reached")
            return None
        try:
            async with asyncio.timeout(ai_moderation.REQUEST_TIMEOUT_S):
                answer = await self._client.complete(system_prompt, content, response_format)
        except TimeoutError:
            logger.warning("Screening model did not answer in %.0f s", ai_moderation.REQUEST_TIMEOUT_S)
            return None
        except Exception as error:
            logger.warning("Screening model request failed: %s", type(error).__name__)
            return None
        try:
            opinion = parse(json.loads(answer)) if answer else None
        except ValueError:
            opinion = None
        if opinion is None:
            logger.warning("Screening model gave no valid %s answer", response_format.name)
        return opinion


def _file_name(photo: Photo) -> str | None:
    """Our uploads live in the media directory; freely licensed external photos are not checked."""
    if photo.credit is not None or not photo.url.startswith("/media/"):
        return None
    return Path(photo.url).name


async def _route_subject(session: AsyncSession, route_id: int) -> Subject | None:
    route = await routes.find_route(session, route_id)
    if route is None or route.visibility is RouteVisibility.PRIVATE:
        return None
    return subjects.route_subject(route)


async def _subject(session: AsyncSession, target_type: AiTarget, target_id: int) -> Subject | None:
    """The text the model reads about an item; None when there is nothing (left) to check."""
    if target_type is AiTarget.PLACE:
        return subjects.place_subject(await place_queries.get_place(session, target_id))
    if target_type is AiTarget.ROUTE:
        return await _route_subject(session, target_id)
    model, describe = {
        AiTarget.NOTE: (MapNote, subjects.note_subject),
        AiTarget.COMMENT: (Comment, subjects.comment_subject),
        AiTarget.REVIEW: (Review, subjects.review_subject),
    }[target_type]
    item = await session.get(model, target_id)
    return describe(item) if item is not None else None


class ScreeningSweeper:
    """Re-submits screening windows nobody is working on (SPEC §24.1) every minute."""

    def __init__(self, screener: Callable[[], AiScreener], interval_s: float = SWEEP_INTERVAL_S) -> None:
        self._screener = screener
        self._interval_s = interval_s
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)

    async def _loop(self) -> None:
        while True:
            await asyncio.sleep(self._interval_s)
            try:
                await self._screener().resubmit_stuck(older_than=STUCK_AFTER)
            except Exception:
                logger.exception("Screening sweep failed")


def get_ai_screener(request: Request) -> AiScreener:
    return request.app.state.ai_screener
