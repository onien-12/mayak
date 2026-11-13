from typing import Annotated

from pydantic import StringConstraints

from app.domain.enums import ComplaintReason, TargetType
from app.schemas.common import ApiModel


class ComplaintIn(ApiModel):
    target_type: TargetType
    target_id: int
    reason: ComplaintReason
    comment: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""


class ComplaintCreated(ApiModel):
    id: int
