from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.environment_image import EnvironmentImage


class Environment(Base):
    __tablename__ = "environments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 保留 base_image_url 作为历史字段兼容，但实际场景图片集中存储在 EnvironmentImage 里
    base_image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
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

    images: Mapped[list[EnvironmentImage]] = relationship(
        "EnvironmentImage",
        back_populates="environment",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="EnvironmentImage.sort_order",
    )
