from sqlalchemy import Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ShotCharacter(Base):
    __tablename__ = "shot_characters"

    __table_args__ = (
        UniqueConstraint("shot_id", "character_id", name="uq_shot_character"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    shot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("shots.id"), nullable=False
    )
    character_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("characters.id"), nullable=False
    )
