from fastapi import HTTPException, status
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project import Project
from app.models.scene import Scene
from app.models.shot import Shot
from app.models.script import Script
from app.schemas.project import CreateProjectRequest, UpdateProjectRequest


async def get_projects(
    db: AsyncSession,
    creator_id: int,
    page: int,
    page_size: int,
    status_filter: str | None = None,
) -> tuple[list[Project], int]:
    """获取项目列表（分页），按创建时间倒序。"""
    base_query = select(Project).where(Project.creator_id == creator_id)

    if status_filter:
        base_query = base_query.where(Project.status == status_filter)

    count_query = select(sa_func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    items_query = (
        base_query
        .order_by(Project.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(items_query)
    projects = list(result.scalars().all())

    return projects, total


async def get_project(db: AsyncSession, project_id: int) -> Project:
    """获取项目详情，使用 selectinload 加载完整关系树。"""
    query = (
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.style),
            selectinload(Project.script),
            selectinload(Project.scenes).selectinload(Scene.environment),
            selectinload(Project.scenes)
            .selectinload(Scene.shots)
            .selectinload(Shot.characters),
            selectinload(Project.scenes)
            .selectinload(Scene.shots)
            .selectinload(Shot.images),
        )
    )
    result = await db.execute(query)
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


async def create_project(
    db: AsyncSession,
    creator_id: int,
    data: CreateProjectRequest,
) -> Project:
    """创建项目，同时创建关联的空 Script 记录。"""
    project = Project(
        name=data.name,
        description=data.description,
        creator_id=creator_id,
        style_id=data.style_id,
        shots_per_image=data.shots_per_image,
    )
    db.add(project)
    await db.flush()

    script = Script(project_id=project.id)
    db.add(script)

    await db.commit()
    await db.refresh(project)
    return project


async def update_project(
    db: AsyncSession,
    project_id: int,
    data: UpdateProjectRequest,
) -> Project:
    """更新项目信息，仅更新非 None 字段。"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    update_fields = data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(project, field, value)

    await db.commit()
    await db.refresh(project)
    return project


async def delete_project(db: AsyncSession, project_id: int) -> None:
    """删除项目（级联删除由数据库外键约束处理）。"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    await db.delete(project)
    await db.commit()
