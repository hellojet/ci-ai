"""端到端自测：候选视频 + 锁定 的完整链路。

覆盖用例：
1. 为 shot 写入两条 ShotVideo（模拟多次生成视频）
2. 调用 shot_service.lock_video 锁定第二条
3. 断言：第二条 is_locked=True / 第一条被反解锁 / shot.locked_video_id / shot.video_url / shot.status

不依赖真实 AI 网关，只直接走 DB + service 层，验证数据契约。
"""

from __future__ import annotations

import asyncio
import os
import sys

# 让脚本从任意目录都能跑起来
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from sqlalchemy import select  # noqa: E402

from app.database import async_session  # noqa: E402
from app.models.project import Project  # noqa: E402
from app.models.scene import Scene  # noqa: E402
from app.models.shot import Shot  # noqa: E402
from app.models.shot_video import ShotVideo  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import shot_service  # noqa: E402


async def _get_or_create_fixture():
    """拿到一个 project / scene / shot（如有历史数据复用，否则新建）。"""
    async with async_session() as db:
        # 复用任意一条存量数据避免污染
        scene = (
            await db.execute(select(Scene).order_by(Scene.id.asc()).limit(1))
        ).scalar_one_or_none()
        if scene is not None:
            project = (
                await db.execute(
                    select(Project).where(Project.id == scene.project_id)
                )
            ).scalar_one()
            shot = Shot(
                scene_id=scene.id,
                title="verify_shot_video_lock fixture",
                status="pending",
                sort_order=999,
            )
            db.add(shot)
            await db.commit()
            await db.refresh(shot)
            return project.id, shot.id

        # 无存量数据时，建一个最小 fixture
        user = (
            await db.execute(select(User).order_by(User.id.asc()).limit(1))
        ).scalar_one()
        project = Project(name="verify-fixture", owner_id=user.id)
        db.add(project)
        await db.flush()
        scene = Scene(project_id=project.id, title="verify-scene", sort_order=0)
        db.add(scene)
        await db.flush()
        shot = Shot(
            scene_id=scene.id,
            title="verify_shot_video_lock fixture",
            status="pending",
            sort_order=0,
        )
        db.add(shot)
        await db.commit()
        await db.refresh(shot)
        return project.id, shot.id


async def main() -> None:
    project_id, shot_id = await _get_or_create_fixture()
    print(f"fixture: project_id={project_id}, shot_id={shot_id}")

    # Step 1: 模拟两次视频生成（写两条 ShotVideo，默认都 is_locked=False）
    async with async_session() as db:
        v1 = ShotVideo(
            shot_id=shot_id, video_url="https://cdn.test/video-1.mp4", is_locked=False
        )
        v2 = ShotVideo(
            shot_id=shot_id, video_url="https://cdn.test/video-2.mp4", is_locked=False
        )
        db.add_all([v1, v2])
        await db.commit()
        await db.refresh(v1)
        await db.refresh(v2)
        print(f"created shot_videos: {v1.id} / {v2.id}")

    # Step 2: 锁定 v2
    async with async_session() as db:
        await shot_service.lock_video(db, project_id, shot_id, v2.id)

    # Step 3: 重新读取，断言契约
    async with async_session() as db:
        shot = (await db.execute(select(Shot).where(Shot.id == shot_id))).scalar_one()
        videos = (
            await db.execute(select(ShotVideo).where(ShotVideo.shot_id == shot_id))
        ).scalars().all()
        videos_by_id = {video.id: video for video in videos}

        assert shot.locked_video_id == v2.id, (
            f"expected locked_video_id={v2.id}, got {shot.locked_video_id}"
        )
        assert shot.video_url == "https://cdn.test/video-2.mp4", (
            f"expected shot.video_url sync to locked video, got {shot.video_url}"
        )
        assert shot.status == "completed", (
            f"expected shot.status=completed after lock, got {shot.status}"
        )
        assert videos_by_id[v2.id].is_locked is True, "v2 should be locked"
        assert videos_by_id[v1.id].is_locked is False, "v1 should be unlocked"

        print("PASS: lock-video end-to-end contract verified")

        # Step 4: 切换锁定到 v1，再验一次互斥
        await shot_service.lock_video(db, project_id, shot_id, v1.id)

    async with async_session() as db:
        shot = (await db.execute(select(Shot).where(Shot.id == shot_id))).scalar_one()
        videos = (
            await db.execute(select(ShotVideo).where(ShotVideo.shot_id == shot_id))
        ).scalars().all()
        locked = [video for video in videos if video.is_locked]
        assert len(locked) == 1 and locked[0].id == v1.id, (
            f"expected only v1 locked, got {[v.id for v in locked]}"
        )
        assert shot.locked_video_id == v1.id
        assert shot.video_url == "https://cdn.test/video-1.mp4"
        print("PASS: lock-video switch re-locks exclusively")

    # Step 5: 清理 fixture 数据（仅清理本脚本新建的两条 ShotVideo 与 shot 指针）
    async with async_session() as db:
        from sqlalchemy import delete, update as sa_update

        await db.execute(
            sa_update(Shot)
            .where(Shot.id == shot_id)
            .values(locked_video_id=None, video_url=None)
        )
        await db.execute(
            delete(ShotVideo).where(ShotVideo.shot_id == shot_id)
        )
        await db.commit()
    print("cleanup done")


if __name__ == "__main__":
    asyncio.run(main())
