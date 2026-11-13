"""The only things a screening result is allowed to do (SPEC §14, §24).

Release an item, release it for a moderator's look (`needs_review`, as before) or keep it
quietly held until a moderator decides. It never decides after a person has, never rejects,
deletes or touches reputation; it only moves the hidden author standing.
"""

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import ai_moderation
from app.domain import standing as standing_rules
from app.domain.ai_moderation import AiOpinion, TextOutcome
from app.domain.enums import AiTarget, HoldSource, HoldState, ModerationTrigger, StandingReason
from app.models import AiReview, QuietHold
from app.services import place_quality, quiet_holds, screening, standing

UNCHECKED_TEXT = "Текст не проверен: модель недоступна, а внутренняя оценка автора низкая"
UNCHECKED_PHOTO = "Фото {index} не проверено: модель недоступна, а внутренняя оценка автора низкая"


@dataclass(frozen=True, slots=True)
class Checked:
    """What the checks of one screening window found. None means the check did not happen."""

    text_checked: bool
    text: AiOpinion | None = None
    photos: list[tuple[int, AiOpinion | None]] = field(default_factory=list)
    """`(photo id, opinion)` in the order the photos are shown."""


def _review_row(
    target_type: AiTarget, target_id: int, opinion: AiOpinion, model: str, now: datetime
) -> AiReview:
    return AiReview(
        target_type=target_type,
        target_id=target_id,
        verdict=opinion.verdict,
        categories=[category.value for category in opinion.categories],
        confidence=opinion.confidence,
        summary=opinion.summary,
        model=model,
        created_at=now,
    )


async def _store(session: AsyncSession, hold: QuietHold, checked: Checked, model: str, now: datetime) -> None:
    if checked.text is not None:
        session.add(_review_row(hold.target_type, hold.target_id, checked.text, model, now))
        if hold.target_type is AiTarget.PLACE and checked.text.usefulness is not None:
            await place_quality.store(session, hold.target_id, checked.text.usefulness, model=model, now=now)
    for photo_id, opinion in checked.photos:
        if opinion is not None:
            session.add(_review_row(AiTarget.PHOTO, photo_id, opinion, model, now))
    await session.flush()


@dataclass(slots=True)
class _Findings:
    """Why the window turns into a hold, collected over the text and every photo."""

    reasons: list[str] = field(default_factory=list)
    triggers: list[ModerationTrigger] = field(default_factory=list)
    sources: list[HoldSource] = field(default_factory=list)

    def add(self, reason: str | None, trigger: ModerationTrigger, source: HoldSource) -> None:
        if reason is not None:
            self.reasons.append(reason)
        self.triggers.append(trigger)
        self.sources.append(source)


def _judge_text(hold: QuietHold, checked: Checked, low: bool, findings: _Findings) -> TextOutcome:
    if checked.text is None:
        if checked.text_checked and low:
            findings.add(UNCHECKED_TEXT, ModerationTrigger.AUTO_AI, HoldSource.STANDING)
            return TextOutcome.HOLD
        return TextOutcome.RELEASE
    outcome = ai_moderation.text_outcome(
        checked.text, standing_low=low, rates_usefulness=rates_usefulness(hold)
    )
    if outcome is TextOutcome.HOLD:
        findings.add(
            ai_moderation.describe(checked.text, subject="Текст"), ModerationTrigger.AUTO_AI, HoldSource.AI
        )
    return outcome


async def _judge_photos(
    session: AsyncSession, hold: QuietHold, checked: Checked, low: bool, findings: _Findings, now: datetime
) -> None:
    """Each photo on its own: passed ones are released at once (still hidden with their place
    while it is screened), failed ones are held and hold what they were attached with."""
    photo_holds = {child.target_id: child for child in await quiet_holds.children(session, hold)}
    for index, (photo_id, opinion) in enumerate(checked.photos, start=1):
        photo_hold = hold if hold.target_type is AiTarget.PHOTO else photo_holds.get(photo_id)
        is_child = photo_hold is not None and photo_hold is not hold
        if (not low) if opinion is None else ai_moderation.photo_passes(opinion):
            if is_child:
                await screening.release(session, photo_hold, now, by_moderator=False)
            continue
        if opinion is None:
            reason, source = UNCHECKED_PHOTO.format(index=index), HoldSource.STANDING
        else:
            reason, source = ai_moderation.describe(opinion, subject=f"Фото {index}"), HoldSource.AI
        findings.add(reason, ModerationTrigger.AUTO_IMAGE, source)
        if is_child:
            photo_hold.state = HoldState.HELD
            photo_hold.reasons = [reason]
            photo_hold.source = source
            photo_hold.updated_at = now


async def apply(
    session: AsyncSession, hold: QuietHold, checked: Checked, *, model: str, now: datetime
) -> None:
    """Decide one screening window. An author with low standing gets no benefit of the doubt:
    a check that did not happen holds, and so does `suspicious` of any confidence."""
    await _store(session, hold, checked, model, now)
    low = standing_rules.is_low(await standing.score(session, hold.author_id))
    findings = _Findings()
    if hold.source is HoldSource.HEURISTIC and hold.reasons:
        findings.add(None, ModerationTrigger.AUTO_TEXT, HoldSource.HEURISTIC)
    outcome = _judge_text(hold, checked, low, findings)
    await _judge_photos(session, hold, checked, low, findings, now)

    if hold.state is HoldState.HELD and not findings.reasons:
        await screening.refresh_open_case(session, hold)
        return
    if findings.triggers:
        await screening.hold_item(
            session,
            hold,
            reasons=findings.reasons,
            source=findings.sources[0],
            triggers=findings.triggers,
            now=now,
        )
        return
    await screening.release(session, hold, now, by_moderator=False)
    await screening.refresh_open_case(session, hold)
    if checked.text is not None and rates_usefulness(hold) and ai_moderation.is_useful(checked.text):
        await standing.change(
            session, hold.author_id, StandingReason.USEFUL, now=now, target=(hold.target_type, hold.target_id)
        )
    if outcome is TextOutcome.REVIEW:
        await screening.send_to_review(session, hold, now)


def rates_usefulness(hold: QuietHold) -> bool:
    """Only places carry a usefulness (SPEC §24.3)."""
    return hold.target_type is AiTarget.PLACE
