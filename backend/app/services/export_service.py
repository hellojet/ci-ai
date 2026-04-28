"""项目导出服务：JSON 和 ZIP 格式导出。"""

import io
import json
import logging
import zipfile

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project import Project
from app.models.scene import Scene
from app.models.shot import Shot

logger = logging.getLogger(__name__)


async def export_project_json(db: AsyncSession, project_id: int) -> dict:
    """导出项目完整数据为 JSON dict。"""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.script),
            selectinload(Project.style),
            selectinload(Project.scenes)
            .selectinload(Scene.environment),
            selectinload(Project.scenes)
            .selectinload(Scene.shots)
            .selectinload(Shot.characters),
            selectinload(Project.scenes)
            .selectinload(Scene.shots)
            .selectinload(Shot.images),
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    data = {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "script": {
            "content": project.script.content if project.script else None,
        },
        "style": {
            "name": project.style.name if project.style else None,
            "prompt": project.style.prompt if project.style else None,
        },
        "scenes": [],
    }

    for scene in sorted(project.scenes, key=lambda s: s.sort_order):
        scene_data = {
            "title": scene.title,
            "sort_order": scene.sort_order,
            "environment": scene.environment.name if scene.environment else None,
            "shots": [],
        }
        for shot in sorted(scene.shots, key=lambda s: s.sort_order):
            shot_data = {
                "title": shot.title,
                "sort_order": shot.sort_order,
                "narration": shot.narration,
                "dialogue": shot.dialogue,
                "action_description": shot.action_description,
                "camera_angle": shot.camera_angle,
                "generated_prompt": shot.generated_prompt,
                "video_url": shot.video_url,
                "audio_url": shot.audio_url,
                "status": shot.status,
                "characters": [c.name for c in shot.characters],
                "images": [
                    {"url": img.image_url, "is_locked": img.is_locked}
                    for img in shot.images
                ],
            }
            scene_data["shots"].append(shot_data)
        data["scenes"].append(scene_data)

    return data


async def export_project_zip(db: AsyncSession, project_id: int) -> bytes:
    """导出项目为 ZIP 文件（含媒体资源）。"""
    project_data = await export_project_json(db, project_id)

    buffer = io.BytesIO()
    async with httpx.AsyncClient(timeout=30.0) as client:
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("metadata.json", json.dumps(project_data, ensure_ascii=False, indent=2))

            for scene_idx, scene in enumerate(project_data.get("scenes", [])):
                for shot_idx, shot in enumerate(scene.get("shots", [])):
                    prefix = f"scene_{scene_idx + 1}/shot_{shot_idx + 1}"

                    for img_idx, img in enumerate(shot.get("images", [])):
                        url = img.get("url")
                        if url:
                            try:
                                resp = await client.get(url)
                                if resp.status_code == 200:
                                    extension = url.rsplit(".", 1)[-1] if "." in url else "png"
                                    zf.writestr(
                                        f"{prefix}/image_{img_idx + 1}.{extension}",
                                        resp.content,
                                    )
                            except Exception as exc:
                                logger.warning("Failed to download image %s: %s", url, exc)

                    video_url = shot.get("video_url")
                    if video_url:
                        try:
                            resp = await client.get(video_url)
                            if resp.status_code == 200:
                                zf.writestr(f"{prefix}/video.mp4", resp.content)
                        except Exception as exc:
                            logger.warning("Failed to download video: %s", exc)

                    audio_url = shot.get("audio_url")
                    if audio_url:
                        try:
                            resp = await client.get(audio_url)
                            if resp.status_code == 200:
                                zf.writestr(f"{prefix}/audio.mp3", resp.content)
                        except Exception as exc:
                            logger.warning("Failed to download audio: %s", exc)

    buffer.seek(0)
    return buffer.read()
