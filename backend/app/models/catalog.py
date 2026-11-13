from typing import Any

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.enums import Layer
from app.models.base import Base, enum_type


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    layer: Mapped[Layer] = mapped_column(enum_type(Layer), index=True)
    group: Mapped[str] = mapped_column("group_name", String(60))
    name: Mapped[str] = mapped_column(String(80))
    icon: Mapped[str] = mapped_column(String(40))
    fields: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
