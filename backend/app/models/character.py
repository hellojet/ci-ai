from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.character_view import CharacterView


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    visual_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    seed_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    voice_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    creator_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    views: Mapped[list[CharacterView]] = relationship(
        "CharacterView", back_populates="character", lazy="selectin"
    )
