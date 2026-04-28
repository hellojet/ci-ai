from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.character import Character
    from app.models.scene import Scene
    from app.models.shot_image import ShotImage


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
