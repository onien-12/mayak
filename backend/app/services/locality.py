"""Home area bookkeeping (SPEC §16): the locality factor of a vote and the home confidence.

Internal signal: nothing computed here may reach an API response, a notification or history.
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import geo, locality
from app.domain.enums import Layer
from app.domain.locality import VoteFact
from app.models import IssueDetails, Place, User, Vote

_SECONDS_PER_DAY = 86_400


def distance_from_home_m(user: User, lat: float, lng: float) -> float | None:
    if user.home_lat is None or user.home_lng is None:
        return None
    return geo.haversine_m(user.home_lat, user.home_lng, lat, lng)


def factor_for(user: User, layer: Layer, category_slug: str, lat: float, lng: float) -> float:
    """Locality multiplier of the user's word about a place of this kind at this spot."""
    return locality.local_factor(
        locality.sensitivity(layer, category_slug), user.home_confidence, distance_from_home_m(user, lat, lng)
    )


async def refresh_confidence(session: AsyncSession, user: User, now: datetime) -> None:
    """Recompute how much the user's declared home is believed; one query over their votes."""
    if user.home_lat is None or user.home_set_at is None:
        user.home_confidence = 0.0
        return
    rows = await session.execute(
        select(
            Vote.kind, Vote.is_near, Vote.created_at, Place.lat, Place.lng, Place.status, IssueDetails.stage
        )
        .join(Place, Place.id == Vote.place_id)
        .outerjoin(IssueDetails, IssueDetails.place_id == Place.id)
        .where(Vote.user_id == user.id)
    )
    facts = [
        VoteFact(
            kind=row.kind,
            is_geo_confirmed=row.is_near,
            cast_on=row.created_at.date(),
            distance_from_home_m=geo.haversine_m(user.home_lat, user.home_lng, row.lat, row.lng),
            outcome=locality.outcome_of(row.status, row.stage),
        )
        for row in rows
    ]
    tenure_days = (now - user.home_set_at).total_seconds() / _SECONDS_PER_DAY
    user.home_confidence = locality.home_confidence(locality.gather_evidence(facts, tenure_days))
