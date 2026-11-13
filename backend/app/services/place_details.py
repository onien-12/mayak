"""Assembly of the full place card for a particular viewer."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import interests as interest_rules
from app.domain.enums import AiTarget, Layer, PlaceStatus, VoteKind
from app.domain.interests import InterestTarget, Topic
from app.models import Comment, EventParticipant, Favorite, OutageBuilding, Photo, Place, Review, User, Vote
from app.schemas.catalog import CategoryOut
from app.schemas.place import (
    IssueDetail,
    MyVote,
    OutageBuildingOut,
    PhotoOut,
    PlaceDetail,
    VerificationSummary,
)
from app.schemas.user import UserBrief
from app.services import (
    combined_ratings,
    covers,
    external_ratings,
    mappers,
    moderation_cases,
    place_queries,
    quiet_holds,
    reviews,
    text_credits,
    uploads,
)
from app.services.interests import tags as interest_tags


def can_edit(place: Place, viewer: User | None) -> bool:
    if viewer is None or place.status is PlaceStatus.ARCHIVED:
        return False
    return viewer.id == place.author_id or viewer.is_staff


async def _verification(session: AsyncSession, place: Place, viewer: User | None) -> VerificationSummary:
    counts = dict.fromkeys(VoteKind, 0)
    rows = await session.execute(
        select(Vote.kind, func.count()).where(Vote.place_id == place.id).group_by(Vote.kind)
    )
    for kind, count in rows:
        counts[kind] = count
    my_vote = None
    if viewer is not None:
        vote = await session.scalar(select(Vote).where(Vote.place_id == place.id, Vote.user_id == viewer.id))
        my_vote = MyVote(kind=vote.kind, created_at=vote.created_at) if vote else None
    return VerificationSummary(
        present=counts[VoteKind.PRESENT],
        absent=counts[VoteKind.ABSENT],
        unclear=counts[VoteKind.UNCLEAR],
        my_vote=my_vote,
    )


async def _exists(session: AsyncSession, model: type, *conditions: object) -> bool:
    return await session.scalar(select(model.id).where(*conditions).limit(1)) is not None


async def _issue_detail(session: AsyncSession, place: Place) -> IssueDetail:
    issue = place.issue
    buildings: list[OutageBuildingOut] = []
    if issue.outage_number is not None:
        rows = await session.scalars(
            select(OutageBuilding).where(OutageBuilding.place_id == place.id).order_by(OutageBuilding.address)
        )
        buildings = [OutageBuildingOut.model_validate(row) for row in rows]
    return IssueDetail(
        **mappers.issue_brief_fields(issue),
        detected_at=issue.detected_at,
        resolved_at=issue.resolved_at,
        official_note=issue.official_note,
        expected_fix_at=issue.expected_fix_at,
        appeal_number=issue.appeal_number,
        responsible_org=issue.responsible_org,
        outage_buildings=buildings,
    )


async def _topics(session: AsyncSession, place: Place) -> list[Topic]:
    """What the place is about (SPEC §23.2); issues carry no topics."""
    if place.layer is Layer.ISSUE:
        return []
    return interest_rules.strongest(await interest_tags.for_target(session, InterestTarget.PLACE, place.id))


async def _own_held_comments(session: AsyncSession, place: Place, viewer: User | None) -> int:
    """The viewer's comments still being screened or held: counted for them alone (SPEC §24.1)."""
    if viewer is None:
        return 0
    count = await session.scalar(
        select(func.count()).where(
            Comment.place_id == place.id,
            Comment.author_id == viewer.id,
            Comment.id.in_(quiet_holds.active_ids(AiTarget.COMMENT)),
        )
    )
    return count or 0


async def _cover_seen(
    session: AsyncSession, place: Place, photos: list[Photo], viewer: User | None
) -> tuple[str | None, dict[str, str] | None]:
    """An uploader whose photo on the place is still held sees the cover it would have made:
    the best preview among the photos they can see (SPEC §25)."""
    if viewer is None or viewer.is_staff or all(photo.uploader_id != viewer.id for photo in photos):
        return place.cover_url, place.cover_credit
    best = await covers.best(session, photos)
    return (best.url, best.credit) if best else (place.cover_url, place.cover_credit)


async def build(session: AsyncSession, place: Place, viewer: User | None, now: datetime) -> PlaceDetail:
    """Requires `place` loaded with category, author, event and issue.

    The author of a quietly held place sees it exactly as published (SPEC §24.1): the status
    they would have, their held photos, comments and review counted; moderators see the truth.
    """
    is_author = viewer is not None and viewer.id == place.author_id
    is_staff = viewer is not None and viewer.is_staff
    is_privileged = is_author or is_staff
    status = place.status if is_staff else await place_queries.shown_status(session, place)
    standing = await moderation_cases.standing_for_place(session, place, status=status)
    photos = await uploads.visible_place_photos(session, place.id, viewer)
    cover_url, cover_credit = await _cover_seen(session, place, photos, viewer)
    rating_avg, rating_count = place.rating_avg, place.rating_count
    if await reviews.has_own_held(session, Review.place_id == place.id, viewer):
        rating_avg, rating_count = await reviews.rating_summary(session, Review.place_id == place.id, viewer)

    my_rating = None
    is_favorite = False
    is_joined = False
    if viewer is not None:
        my_rating = await session.scalar(
            select(Review.rating).where(Review.place_id == place.id, Review.author_id == viewer.id)
        )
        is_favorite = await _exists(
            session, Favorite, Favorite.place_id == place.id, Favorite.user_id == viewer.id
        )
        if place.layer is Layer.EVENT:
            is_joined = await _exists(
                session,
                EventParticipant,
                EventParticipant.place_id == place.id,
                EventParticipant.user_id == viewer.id,
            )

    event = None
    if place.event is not None:
        sees_contact = not place.event.is_meetup or is_privileged or is_joined
        event = mappers.event_detail(place.event, now, is_joined=is_joined, sees_contact=sees_contact)

    base = mappers.place_base_fields(place, now, await combined_ratings.for_place(session, place), status)
    base.update(
        cover_url=cover_url, cover_credit=cover_credit, rating_avg=rating_avg, rating_count=rating_count
    )
    return PlaceDetail(
        **base,
        description=place.description,
        description_credit=await text_credits.for_description(session, place),
        tips=place.tips,
        attributes=place.attributes,
        category=CategoryOut.model_validate(place.category),
        photos=[PhotoOut.model_validate(photo) for photo in photos],
        author=UserBrief.model_validate(place.author),
        updated_at=place.updated_at,
        verification=await _verification(session, place, viewer),
        my_rating=my_rating,
        is_favorite=is_favorite,
        can_edit=can_edit(place, viewer),
        can_appeal=is_author and standing.can_appeal,
        moderation_note=standing.note if is_privileged else None,
        object_id=place.object_id,
        external_rating=await external_ratings.cached(session, place.object_id),
        comments_count=place.comments_count + await _own_held_comments(session, place, viewer),
        event=event,
        issue=await _issue_detail(session, place) if place.issue else None,
        topics=await _topics(session, place),
    )
