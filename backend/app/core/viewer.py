"""Who is looking at the response being built: profanity masking (SPEC §24.5) depends on it.

Bound once per request by an API dependency; anything built outside a request (the seed,
background jobs, imports) counts as an anonymous visitor.
"""

from contextvars import ContextVar
from dataclasses import dataclass

from app.domain.content_check import mask_profanity
from app.models import User


@dataclass(frozen=True, slots=True)
class Viewer:
    id: int
    is_staff: bool


_current: ContextVar[Viewer | None] = ContextVar("viewer", default=None)


def bind(user: User | None) -> None:
    _current.set(Viewer(user.id, user.is_staff) if user is not None else None)


def current() -> Viewer | None:
    return _current.get()


def is_staff() -> bool:
    viewer = _current.get()
    return viewer is not None and viewer.is_staff


def sees_original(owner_id: int | None) -> bool:
    """Moderators and the author of a text get it as written."""
    viewer = _current.get()
    return viewer is not None and (viewer.is_staff or (owner_id is not None and viewer.id == owner_id))


def shown(text: str, owner_id: int | None) -> str:
    return text if sees_original(owner_id) else mask_profanity(text)


def shown_optional(text: str | None, owner_id: int | None) -> str | None:
    return None if text is None else shown(text, owner_id)
