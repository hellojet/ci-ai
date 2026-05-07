from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import JSON, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.character import Character
    from app.models.scene import Scene
    from app.models.shot_image import ShotImage
    from app.models.shot_video import ShotVideo


class Shot(Base):
    __tablename__ = "shots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scene_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("scenes.id"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(128), nullable=True)
    narration: Mapped[str | None] = mapped_column(Text, nullable=True)
    dialogue: Mapped[str | None] = mapped_column(Text, nullable=True)
    subtitle: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    camera_angle: Mapped[str | None] = mapped_column(String(32), nullable=True)
    generated_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    locked_image_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("shot_images.id", use_alter=True),
        nullable=True,
    )
    locked_video_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("shot_videos.id", use_alter=True),
        nullable=True,
    )
    ref_environment_image_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("environment_images.id"),
        nullable=True,
    )
    ref_character_view_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("character_views.id"),
        nullable=True,
    )
    # 一个分镜可能有多个角色，每个角色各锁一张 view 作为参考图。
    # 存 character_view id 列表，按在列表中的顺序作为参考图传递顺序。
    # 旧字段 ref_character_view_id 仅用于向下兼容：未迁移的旧数据读这个单值。
    ref_character_view_ids: Mapped[list[int] | None] = mapped_column(
        JSON,
        nullable=True,
        default=None,
    )
    # 提示词模块开关：dict[str, bool]，键为 style/environment/characters/action/dialogue/camera。
    # 为 None 时视为"全部启用"（兼容旧分镜，无需迁移数据）。
    prompt_modules_image: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, default=None,
    )
    prompt_modules_video: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, default=None,
    )
    # 自定义提示词：用户在前端整段编辑后保存，非空时覆盖开关拼接结果。
    # 用户点"刷新"按钮即清空此字段，回到按 modules 开关自动拼接的模式。
    custom_prompt_image: Mapped[str | None] = mapped_column(Text, nullable=True)
    custom_prompt_video: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    audio_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending"
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

    scene: Mapped[Scene] = relationship("Scene", back_populates="shots")
    characters: Mapped[list[Character]] = relationship(
        "Character",
        secondary="shot_characters",
        lazy="selectin",
    )
    images: Mapped[list[ShotImage]] = relationship(
        "ShotImage",
        back_populates="shot",
        foreign_keys="[ShotImage.shot_id]",
        lazy="selectin",
    )
    locked_image: Mapped[ShotImage | None] = relationship(
        "ShotImage",
        foreign_keys=[locked_image_id],
        post_update=True,
        lazy="selectin",
    )
    videos: Mapped[list[ShotVideo]] = relationship(
        "ShotVideo",
        back_populates="shot",
        foreign_keys="[ShotVideo.shot_id]",
        lazy="selectin",
    )
    locked_video: Mapped[ShotVideo | None] = relationship(
        "ShotVideo",
        foreign_keys=[locked_video_id],
        post_update=True,
        lazy="selectin",
    )
