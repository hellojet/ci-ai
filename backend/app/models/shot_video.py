from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.shot import Shot


class ShotVideo(Base):
    """镜头候选视频。

    一个 Shot 可以有多个候选视频（多次生成、不同 seed 等），
    用 `is_locked` + Shot.locked_video_id 标记选中的那一条作为最终稿。
    """

    __tablename__ = "shot_videos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    shot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("shots.id"), nullable=False
    )
    video_url: Mapped[str] = mapped_column(String(512), nullable=False)
    # 生成视频所依据的图片（可选，方便回溯）
    source_image_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("shot_images.id"), nullable=True
    )
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    shot: Mapped[Shot] = relationship(
        "Shot",
        back_populates="videos",
        foreign_keys=[shot_id],
    )
