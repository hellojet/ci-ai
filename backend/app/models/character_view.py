from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.character import Character


class CharacterView(Base):
    __tablename__ = "character_views"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    character_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("characters.id"), nullable=False
    )
    image_url: Mapped[str] = mapped_column(String(512), nullable=False)
    view_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    character: Mapped[Character] = relationship(
        "Character", back_populates="views"
    )
