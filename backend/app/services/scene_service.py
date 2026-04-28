from fastapi import HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.scene import Scene
from app.models.shot import Shot
from app.models.shot_character import ShotCharacter
from app.schemas.scene import CreateSceneRequest, SceneOrderItem, UpdateSceneRequest


async def create_scene(
    db: AsyncSession, project_id: int, data: CreateSceneRequest
) -> Scene:
    scene = Scene(
        project_id=project_id,
        title=data.title,
        description_prompt=data.description_prompt,
        environment_id=data.environment_id,
        sort_order=data.sort_order or 0,
    )
    db.add(scene)
    await db.commit()
    await db.refresh(scene)
    # Reload with relationships
    result = await db.execute(
        select(Scene)
        .options(selectinload(Scene.environment), selectinload(Scene.shots))
        .where(Scene.id == scene.id)
    )
    return result.scalar_one()


async def update_scene(
    db: AsyncSession, project_id: int, scene_id: int, data: UpdateSceneRequest
) -> Scene:
    result = await db.execute(
        select(Scene).where(Scene.id == scene_id, Scene.project_id == project_id)
    )
    scene = result.scalar_one_or_none()
    if scene is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Scene not found"
        )

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(scene, field, value)

    await db.commit()
    await db.refresh(scene)
    # Reload with relationships
    result = await db.execute(
        select(Scene)
        .options(selectinload(Scene.environment), selectinload(Scene.shots))
        .where(Scene.id == scene.id)
    )
    return result.scalar_one()


async def delete_scene(
    db: AsyncSession, project_id: int, scene_id: int
) -> None:
    result = await db.execute(
        select(Scene).where(Scene.id == scene_id, Scene.project_id == project_id)
    )
    scene = result.scalar_one_or_none()
    if scene is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Scene not found"
        )

    # Cascade delete: remove shot_characters for all shots in this scene, then shots
    shots_result = await db.execute(
        select(Shot.id).where(Shot.scene_id == scene_id)
    )
    shot_ids = [row[0] for row in shots_result.all()]

    if shot_ids:
        await db.execute(
            delete(ShotCharacter).where(ShotCharacter.shot_id.in_(shot_ids))
        )
        await db.execute(delete(Shot).where(Shot.scene_id == scene_id))

    await db.delete(scene)
    await db.commit()


async def reorder_scenes(
    db: AsyncSession, project_id: int, scene_orders: list[SceneOrderItem]
) -> None:
    for item in scene_orders:
        await db.execute(
            update(Scene)
            .where(Scene.id == item.scene_id, Scene.project_id == project_id)
            .values(sort_order=item.sort_order)
        )
    await db.commit()
