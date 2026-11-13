"""Imports city events from the VL.ru afisha as verified `event` places (SPEC §11)."""

import logging
from dataclasses import dataclass, field
from datetime import datetime

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import ExternalSourceId, Layer, NotificationKind, PlaceStatus
from app.models import Category, Place, User
from app.schemas.place import EventInput, PlaceInput
from app.services import areas, events, place_queries, places
from app.services.imports import record_run, system_author
from app.services.interests import tagging as interest_tagging
from app.services.places import ExternalRef
from app.services.vlru import afisha_parser
from app.services.vlru.afisha_parser import ListingCard, ParsedEvent
from app.services.vlru.client import BASE_URL, VlRuClient

logger = logging.getLogger(__name__)

MAX_EVENTS_PER_RUN = 150
LISTING_PATHS = (
    "/afisha/vladivostok",
    "/afisha/vladivostok/events/by-category-concert",
    "/afisha/vladivostok/events/by-category-theatre",
    "/afisha/vladivostok/events/by-category-exhibition",
    "/afisha/vladivostok/events/by-category-city-event",
    "/afisha/vladivostok/events/by-category-child",
    "/afisha/vladivostok/events/by-category-education",
    "/afisha/vladivostok/events/by-category-masterclasses",
    "/afisha/vladivostok/events/by-category-standup",
)
_MAX_TITLE_LENGTH = 120
_MAX_ADDRESS_LENGTH = 200


@dataclass(frozen=True, slots=True)
class FetchedEvent:
    card: ListingCard
    event: ParsedEvent


@dataclass(slots=True)
class AfishaReport:
    found: int = 0
    created: int = 0
    updated: int = 0
    finished: int = 0
    kept_local_edits: int = 0
    failed_pages: int = 0
    without_coordinates: list[int] = field(default_factory=list)
    without_time: list[int] = field(default_factory=list)
    without_price: list[int] = field(default_factory=list)

    def summary(self) -> dict[str, int]:
        return {
            "found": self.found,
            "created": self.created,
            "updated": self.updated,
            "finished": self.finished,
            "kept_local_edits": self.kept_local_edits,
            "failed_pages": self.failed_pages,
            "without_coordinates": len(self.without_coordinates),
            "without_time": len(self.without_time),
            "without_price": len(self.without_price),
        }


def external_id(event_id: int) -> str:
    return f"{ExternalSourceId.VL_RU.value}:{event_id}"


def event_url(event_id: int) -> str:
    return BASE_URL + afisha_parser.EVENT_PATH.format(event_id=event_id)


async def fetch_events(client: VlRuClient, report: AfishaReport) -> list[FetchedEvent]:
    """Network phase: listings first, then the event pages. Touches no database."""
    cards: dict[int, ListingCard] = {}
    for path in LISTING_PATHS:
        html = await client.get(path)
        if html is None:
            report.failed_pages += 1
            continue
        for card in afisha_parser.parse_listing(html):
            known = cards.get(card.event_id)
            if known is None or (known.category_slug is None and card.category_slug is not None):
                cards[card.event_id] = card
    selected = list(cards.values())[:MAX_EVENTS_PER_RUN]
    report.found = len(selected)
    fetched: list[FetchedEvent] = []
    for card in selected:
        html = await client.get(afisha_parser.EVENT_PATH.format(event_id=card.event_id))
        event = afisha_parser.parse_event(html) if html else None
        if event is None:
            report.failed_pages += 1
            continue
        fetched.append(FetchedEvent(card, event))
    return fetched


def _description(event: ParsedEvent, url: str) -> str:
    text = event.description
    if len(text) >= afisha_parser.MAX_DESCRIPTION_LENGTH:
        text = text.rstrip() + "…"
    return f"{text}\n\nПодробнее: {url}".strip()


def _address(event: ParsedEvent) -> str | None:
    address = ", ".join(part for part in (event.venue, event.address) if part)
    return address[:_MAX_ADDRESS_LENGTH] or None


def _place_input(
    category: Category, item: FetchedEvent, window: tuple[datetime, datetime], url: str
) -> PlaceInput:
    event = item.event
    return PlaceInput(
        layer=Layer.EVENT,
        category_id=category.id,
        title=event.title[:_MAX_TITLE_LENGTH],
        description=_description(event, url),
        lat=event.lat,
        lng=event.lng,
        address=_address(event),
        event=EventInput(
            starts_at=window[0],
            ends_at=window[1],
            price=event.price,
            price_note=event.price_note,
            age_limit=event.age_limit,
            registration_url=url,
        ),
    )


async def _refresh(
    session: AsyncSession,
    place: Place,
    category: Category,
    payload: PlaceInput,
    item: FetchedEvent,
    now: datetime,
) -> None:
    """Bring an already imported event in line with the source."""
    event = place.event
    rescheduled = event.starts_at != payload.event.starts_at
    place.category = category
    place.title = payload.title
    place.description = payload.description
    place.lat, place.lng, place.address = payload.lat, payload.lng, payload.address
    place.search_text = places.build_search_text(
        payload.title, payload.description, payload.address, place.tags
    )
    place.external_image_url = item.event.image_url
    if place.cover_url is None or place.cover_url.startswith("https://"):
        place.cover_url = item.event.image_url
    event.starts_at, event.ends_at = payload.event.starts_at, payload.event.ends_at
    event.price, event.price_note = payload.event.price, payload.event.price_note
    event.age_limit = payload.event.age_limit
    place.updated_at = now
    if rescheduled:
        await events.notify_participants(
            session, place, NotificationKind.EVENT_CHANGED, "Изменилось время события", now
        )


async def apply_events(
    session: AsyncSession, fetched: list[FetchedEvent], report: AfishaReport, now: datetime
) -> None:
    """Database phase: idempotent upsert by external id. Commits nothing itself."""
    author: User = await system_author(session, ExternalSourceId.VL_RU, now)
    categories = {
        category.slug: category
        for category in await session.scalars(select(Category).where(Category.layer == Layer.EVENT))
    }
    for item in fetched:
        event_id = item.card.event_id
        window = afisha_parser.event_window(item.event, now)
        if window is None:
            report.finished += 1
            continue
        if item.event.lat is None or item.event.lng is None:
            report.without_coordinates.append(event_id)
            continue
        if not any(session_.start for session_ in item.event.sessions):
            report.without_time.append(event_id)
        if item.event.price is None:
            report.without_price.append(event_id)
        url = event_url(event_id)
        category = categories[afisha_parser.map_category(item.card.category_slug)]
        try:
            payload = _place_input(category, item, window, url)
        except ValidationError:
            report.failed_pages += 1
            continue
        existing = await session.scalar(
            place_queries.card_query().where(Place.external_id == external_id(event_id))
        )
        if existing is None:
            await places.insert_place(
                session,
                author,
                category,
                payload,
                attributes={},
                status=PlaceStatus.VERIFIED,
                now=now,
                external=ExternalRef(
                    ExternalSourceId.VL_RU, external_id(event_id), url, item.event.image_url
                ),
            )
            report.created += 1
        elif existing.locally_edited:
            report.kept_local_edits += 1
        else:
            await _refresh(session, existing, category, payload, item, now)
            report.updated += 1
    await areas.refresh_all(session, now)


async def run_import(session: AsyncSession, client: VlRuClient, now: datetime) -> AfishaReport:
    """Fetch everything first, then write in one short transaction."""
    report = AfishaReport()
    fetched = await fetch_events(client, report)
    await apply_events(session, fetched, report, now)
    await interest_tagging.tag_stale(session, now)
    record_run(session, ExternalSourceId.VL_RU, report.summary(), now)
    await session.commit()
    logger.info("Afisha import: %s", report.summary())
    return report
