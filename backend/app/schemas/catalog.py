from typing import Any

from pydantic import SerializerFunctionWrapHandler, model_serializer

from app.domain.enums import FieldType, Layer
from app.schemas.common import ApiModel


class FieldOption(ApiModel):
    value: str
    label: str


class FieldDef(ApiModel):
    key: str
    label: str
    type: FieldType
    options: list[FieldOption] | None = None
    unit: str | None = None

    @model_serializer(mode="wrap")
    def _omit_absent_optionals(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        """`options` and `unit` are optional keys in the contract, not nullable ones."""
        return {key: value for key, value in handler(self).items() if value is not None}


class CategoryOut(ApiModel):
    id: int
    slug: str
    layer: Layer
    group: str
    name: str
    icon: str
    fields: list[FieldDef]
