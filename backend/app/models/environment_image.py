from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.environment import Environment


class EnvironmentImage(Base):
    """场景资产下的一张图片（场景图片库）。

    对应产品文档 / 开发文档 1.6.1：每个场景资产最多支持 20 张图片，
    可在分镜中通过 ref_environment_image_id 引用某一张具体场景图片。
    """

    __tablename__ = "environment_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    environment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("environments.id"), nullable=False, index=True
    )
    image_url: Mapped[str] = mapped_column(String(512), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    environment: Mapped[Environment] = relationship(
        "Environment", back_populates="images"
    )
