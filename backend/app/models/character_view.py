from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Integer, String, DateTime, ForeignKey, func
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
    # 生成中的占位视图允许 image_url 暂时为空；完成后再回填
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    view_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 生命周期：queued → generating → completed / failed；老数据默认 completed
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="completed", server_default="completed"
    )
    error_message: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # 本次生成是否参考了角色的种子图（用于前端给卡片加"参考"徽标）；老数据默认 False
    use_seed_image: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    character: Mapped[Character] = relationship(
        "Character", back_populates="views"
    )
