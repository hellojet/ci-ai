from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.shot import Shot


class ShotImage(Base):
    __tablename__ = "shot_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    shot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("shots.id"), nullable=False
    )
    image_url: Mapped[str] = mapped_column(String(512), nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    shot: Mapped[Shot] = relationship(
        "Shot",
        back_populates="images",
        foreign_keys=[shot_id],
    )
