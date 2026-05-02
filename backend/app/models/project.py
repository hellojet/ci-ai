from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.style import Style
    from app.models.scene import Scene
    from app.models.script import Script


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    creator_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    style_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("styles.id"), nullable=True
    )
    shots_per_image: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="draft"
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

    creator: Mapped[User] = relationship(
        "User", foreign_keys=[creator_id], lazy="selectin"
    )
    style: Mapped[Style | None] = relationship("Style", lazy="selectin")
    scenes: Mapped[list[Scene]] = relationship(
        "Scene", back_populates="project", lazy="selectin"
    )
    script: Mapped[Script | None] = relationship(
        "Script", back_populates="project", uselist=False, lazy="selectin"
    )
