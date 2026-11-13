"""Reading the licence notice of a description taken from a free source (SPEC §19, §21)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Area, Place, TextCredit
from app.schemas.place import TextCredit as TextCreditOut


async def credit_of(session: AsyncSession, target: Place | Area) -> TextCredit | None:
    column = TextCredit.place_id if isinstance(target, Place) else TextCredit.area_id
    return await session.scalar(select(TextCredit).where(column == target.id))


async def for_description(session: AsyncSession, target: Place | Area) -> TextCreditOut | None:
    """The notice to show with the description; none once the description is empty."""
    row = await credit_of(session, target) if target.description.strip() else None
    return TextCreditOut(label=row.label, license=row.license, url=row.url) if row else None
