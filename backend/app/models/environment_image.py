from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.environment import Environment


class EnvironmentImage(Base):
    """场景资产下的一张图片（场景图片库）。

    对应产品文档 / 开发文档 1.6.1：每个场景资产最多支持 20 张图片，
    可在分镜中通过 ref_environment_image_id 引用某一张具体场景图片。

    生命周期（对齐 CharacterView）：
      queued → generating → completed / failed
    - 占位行在刚派发 Celery 任务时落库，image_url 为空串
    - worker 拿到 URL 后回填 image_url + status=completed
    """

    __tablename__ = "environment_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    environment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("environments.id"), nullable=False, index=True
    )
    # 生成中的占位图允许 image_url 暂时为空串；完成后再回填
    image_url: Mapped[str] = mapped_column(String(512), nullable=False, default="", server_default="")
    # 视角/角度文案（例如："wide", "close-up", "overhead"），给 prompt 生成用的提示
    view_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 生命周期：老数据默认 completed，新的派发会落 queued
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="completed", server_default="completed"
    )
    error_message: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # 本次生成是否参考了场景的种子图
    use_seed_image: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    # 本次生成使用的图像模型 id（指向 AI_IMAGE_MODELS 里的某一项），占位阶段写入
    model_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    environment: Mapped[Environment] = relationship(
        "Environment", back_populates="images"
    )
