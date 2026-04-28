from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.environment import Environment
    from app.models.project import Project
    from app.models.shot import Shot


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("projects.id"), nullable=False
    )
    environment_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("environments.id"), nullable=True
    )
    title: Mapped[str | None] = mapped_column(String(128), nullable=True)
    description_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    project: Mapped[Project] = relationship("Project", back_populates="scenes")
    environment: Mapped[Environment | None] = relationship(
        "Environment", lazy="selectin"
    )
    shots: Mapped[list[Shot]] = relationship(
        "Shot", back_populates="scene", lazy="selectin"
    )
