from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GenerationTask(Base):
    __tablename__ = "generation_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    shot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("shots.id"), nullable=False
    )
    task_type: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending"
    )
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    credits_cost: Mapped[int] = mapped_column(Integer, nullable=False)
    result_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 用户在前端选择的模型 id（仅 task_type=image 会写入；其它类型保持 null）
    # 由 image_models_service 读取 .env AI_IMAGE_MODELS 匹配出完整 endpoint/api_key/protocol
    model_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 生成参数（JSON）：图片任务 = {ratio, resolution}；视频任务 = {ratio, resolution, duration, watermark}
    # nullable，老任务/未传参时由 worker 侧用默认值兜底（图片 9:16/1080p；视频 9:16/1080p/5s/无水印）
    # 用 SQLAlchemy JSON 列：SQLite 下落为 TEXT，Postgres 下落为 jsonb，无需 alembic 迁移
    params: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_by: Mapped[int] = mapped_column(
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
