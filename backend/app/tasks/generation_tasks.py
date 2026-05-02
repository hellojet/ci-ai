"""Celery 异步任务：图片生成、视频生成、音频生成。"""

import asyncio
import logging

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

CREDITS_MAP = {"image": 2, "video": 10, "audio": 5}


CREDITS_MAP = {"image": 2, "video": 10, "audio": 5}


def _build_prompt_for_shot(session, shot):
    """在 Celery worker 中同步地为 shot 组装图片生成 prompt。"""
    from app.models.scene import Scene
    from app.models.project import Project
    from app.models.style import Style

    scene = session.get(Scene, shot.scene_id)
    if not scene:
        return ""

    project = session.get(Project, scene.project_id)

    parts = []

    # Style prompt
    if project and project.style_id:
        style = session.get(Style, project.style_id)
        if style and style.prompt:
            parts.append(style.prompt)

    # Environment prompt
    if scene.environment_id:
        from app.models.environment import Environment
        env = session.get(Environment, scene.environment_id)
        if env:
            parts.append(env.prompt or env.name)

    # Characters prompt
    if hasattr(shot, 'characters') and shot.characters:
        char_prompts = [c.visual_prompt or c.name for c in shot.characters]
        parts.append(", ".join(char_prompts))

    # Action description
    if shot.action_description:
        parts.append(shot.action_description)

    # Narration as context
    if shot.narration:
        parts.append(shot.narration)

    # Camera angle
    if shot.camera_angle:
        parts.append(f"camera: {shot.camera_angle}")

    return ", ".join(parts) if parts else shot.title or "a cinematic scene"


def _get_sync_session():
    """创建同步数据库 session 用于 Celery worker。"""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.config import get_settings

    settings = get_settings()
    database_url = settings.database_url
    # 将异步驱动替换为同步驱动
    if "+aiosqlite" in database_url:
        database_url = database_url.replace("+aiosqlite", "")
    elif "+asyncpg" in database_url:
        database_url = database_url.replace("+asyncpg", "+psycopg2")
    engine = create_engine(database_url)
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def _to_absolute_media_url(url: str) -> str:
    """把本地相对路径 /uploads/... 拼成可被外部 AI 网关访问的绝对 URL。

    - 已是 http/https/oss 开头的，原样返回
    - 相对路径且配置了 PUBLIC_BASE_URL，则拼接成绝对 URL
    - 否则原样返回（由下游适配器校验并抛错）
    """
    if not url:
        return url
    if url.startswith(("http://", "https://", "oss://")):
        return url

    from app.config import get_settings
    base = (get_settings().public_base_url or "").rstrip("/")
    if not base:
        return url
    if not url.startswith("/"):
        url = "/" + url
    return f"{base}{url}"


def _get_api_config(session, task_type: str) -> tuple[str, str, str]:
    """从 SystemSettings 读取指定类型的 API 配置。

    数据库优先、.env 兜底（对齐 settings_service 的合并规则）。
    Returns:
        (endpoint, api_key, model)
    """
    from app.models.system_settings import SystemSettings
    from app.config import get_settings

    def _read(key: str, env_field: str) -> str:
        row = (
            session.query(SystemSettings)
            .filter(SystemSettings.key == key)
            .first()
        )
        if row and isinstance(row.value, dict):
            val = row.value.get("value", "")
            if val:
                return str(val)
        env_val = getattr(get_settings(), env_field, "") or ""
        return str(env_val)

    endpoint = _read(f"api.{task_type}.endpoint", f"ai_{task_type}_endpoint")
    api_key = _read(f"api.{task_type}.api_key", f"ai_{task_type}_api_key")
    model = _read(f"api.{task_type}.model", f"ai_{task_type}_model")
    return endpoint, api_key, model


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def generate_image_task(self, task_id: int):
    """图片生成任务。"""
    session = _get_sync_session()
    try:
        from app.models.generation_task import GenerationTask
        from app.models.shot import Shot
        from app.models.shot_image import ShotImage

        task = session.get(GenerationTask, task_id)
        if not task:
            logger.error("Task %d not found", task_id)
            return

        task.status = "processing"
        session.commit()

        endpoint, api_key, _image_model = _get_api_config(session, "image")
        if not endpoint or not api_key:
            task.status = "failed"
            task.error_message = "Image API not configured. Please configure in Settings."
            session.commit()
            return

        shot = session.get(Shot, task.shot_id)
        if not shot:
            task.status = "failed"
            task.error_message = "Shot not found"
            session.commit()
            return

        # 如果 prompt 未生成，自动组装
        if not shot.generated_prompt:
            shot.generated_prompt = _build_prompt_for_shot(session, shot)
            session.commit()
            if not shot.generated_prompt:
                task.status = "failed"
                task.error_message = "Failed to build prompt for shot"
                session.commit()
                return

        from app.ai import image_adapter

        try:
            image_urls = image_adapter.generate_sync(
                endpoint=endpoint,
                api_key=api_key,
                prompt=shot.generated_prompt,
                count=1,
            )
        except Exception as exc:
            task.status = "failed"
            task.error_message = str(exc)
            task.retry_count += 1
            session.commit()
            raise self.retry(exc=exc)

        for url in image_urls:
            session.add(ShotImage(shot_id=shot.id, image_url=url, is_locked=False))

        shot.status = "image_generated"
        task.status = "completed"
        task.result_url = image_urls[0] if image_urls else None
        session.commit()

        logger.info("Image task %d completed, %d images generated", task_id, len(image_urls))

    except Exception as exc:
        session.rollback()
        logger.error("Image task %d failed: %s", task_id, exc)
        _mark_task_failed(session, task_id, str(exc))
        raise
    finally:
        session.close()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def generate_video_task(self, task_id: int):
    """视频生成任务。"""
    session = _get_sync_session()
    try:
        from app.models.generation_task import GenerationTask
        from app.models.shot import Shot
        from app.models.shot_image import ShotImage
        from app.models.shot_video import ShotVideo

        task = session.get(GenerationTask, task_id)
        if not task:
            logger.error("Task %d not found", task_id)
            return

        task.status = "processing"
        session.commit()

        endpoint, api_key, video_model = _get_api_config(session, "video")
        if not endpoint or not api_key:
            task.status = "failed"
            task.error_message = "Video API not configured. Please configure in Settings."
            session.commit()
            return
        if not video_model:
            task.status = "failed"
            task.error_message = "Video model not configured (api.video.model)."
            session.commit()
            return

        shot = session.get(Shot, task.shot_id)
        if not shot:
            task.status = "failed"
            task.error_message = "Shot not found"
            session.commit()
            return

        locked_image = None
        if shot.locked_image_id:
            locked_image = session.get(ShotImage, shot.locked_image_id)

        if not locked_image:
            task.status = "failed"
            task.error_message = "No locked image found. Please lock an image first."
            session.commit()
            return

        from app.ai import video_adapter

        # 外部 AI 网关无法访问本地 /uploads/... 相对路径，需拼成公网可达的绝对 URL
        absolute_image_url = _to_absolute_media_url(locked_image.image_url)

        try:
            video_url = asyncio.run(
                video_adapter.generate(
                    endpoint=endpoint,
                    api_key=api_key,
                    model=video_model,
                    image_url=absolute_image_url,
                    prompt=shot.generated_prompt or "",
                )
            )
        except Exception as exc:
            task.status = "failed"
            task.error_message = str(exc)
            task.retry_count += 1
            session.commit()
            raise self.retry(exc=exc)

        # 写入候选视频表：多次生成会累积多条，用户可在前端选择一条 lock
        shot_video = ShotVideo(
            shot_id=shot.id,
            video_url=video_url,
            source_image_id=locked_image.id,
            is_locked=False,
        )
        session.add(shot_video)
        session.flush()  # 让 shot_video.id 可用

        # 首次生成（还没有任何 locked_video）时，自动锁定这条最新生成的视频，提升开箱体验
        existing_locked = (
            session.query(ShotVideo)
            .filter(ShotVideo.shot_id == shot.id, ShotVideo.is_locked.is_(True))
            .first()
        )
        if existing_locked is None:
            shot_video.is_locked = True
            shot.locked_video_id = shot_video.id
            shot.video_url = video_url  # 与锁定视频保持一致
            shot.status = "completed"
        else:
            # 已有锁定视频时不抢占，仅让新候选出现在列表里；shot.video_url 保持指向已锁定的那条
            shot.status = shot.status or "video_generated"
            # 兼容老前端：若 shot.video_url 还没填，先用最新生成的顶上
            if not shot.video_url:
                shot.video_url = video_url

        task.status = "completed"
        task.result_url = video_url
        session.commit()

        logger.info("Video task %d completed, shot_video_id=%d", task_id, shot_video.id)

    except Exception as exc:
        session.rollback()
        logger.error("Video task %d failed: %s", task_id, exc)
        _mark_task_failed(session, task_id, str(exc))
        raise
    finally:
        session.close()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def generate_audio_task(self, task_id: int):
    """音频生成任务（TTS）。"""
    session = _get_sync_session()
    try:
        from app.models.generation_task import GenerationTask
        from app.models.shot import Shot

        task = session.get(GenerationTask, task_id)
        if not task:
            logger.error("Task %d not found", task_id)
            return

        task.status = "processing"
        session.commit()

        endpoint, api_key, _audio_model = _get_api_config(session, "audio")
        if not endpoint or not api_key:
            task.status = "failed"
            task.error_message = "Audio API not configured. Please configure in Settings."
            session.commit()
            return

        shot = session.get(Shot, task.shot_id)
        if not shot:
            task.status = "failed"
            task.error_message = "Shot not found"
            session.commit()
            return

        text = shot.narration or shot.dialogue or ""
        if not text:
            task.status = "failed"
            task.error_message = "No narration or dialogue text for audio generation"
            session.commit()
            return

        from app.ai import audio_adapter

        try:
            audio_url = asyncio.run(
                audio_adapter.generate(
                    endpoint=endpoint,
                    api_key=api_key,
                    text=text,
                )
            )
        except Exception as exc:
            task.status = "failed"
            task.error_message = str(exc)
            task.retry_count += 1
            session.commit()
            raise self.retry(exc=exc)

        shot.audio_url = audio_url
        shot.status = "audio_generated"
        task.status = "completed"
        task.result_url = audio_url
        session.commit()

        logger.info("Audio task %d completed", task_id)

    except Exception as exc:
        session.rollback()
        logger.error("Audio task %d failed: %s", task_id, exc)
        _mark_task_failed(session, task_id, str(exc))
        raise
    finally:
        session.close()


def _mark_task_failed(session, task_id: int, error_message: str):
    """安全地将任务标记为失败。"""
    try:
        from app.models.generation_task import GenerationTask

        task = session.get(GenerationTask, task_id)
        if task and task.status != "completed":
            task.status = "failed"
            task.error_message = error_message
            session.commit()
    except Exception:
        session.rollback()


def _mark_character_view_failed(session, view_id: int, error_message: str) -> None:
    """把 CharacterView 标记为失败，供前端展示。"""
    try:
        from app.models.character_view import CharacterView

        view = session.get(CharacterView, view_id)
        if view and view.status != "completed":
            view.status = "failed"
            # SQLite 字段是 String(512)，截断一下避免超长
            view.error_message = (error_message or "")[:500]
            session.commit()
    except Exception:
        session.rollback()


@celery_app.task(bind=True, max_retries=0)
def generate_character_view_task(self, view_id: int):
    """生成单张角色参考视图：queued → generating → completed/failed。

    流程：
    1. 校验 view 仍存在、状态合法
    2. 读取角色 + API 配置
    3. 调用图像生成 API（直接复用 image_adapter 的限流 / 重试逻辑）
    4. 拿到 URL 后回写 image_url + status=completed
    5. 任意异常均兜底为 status=failed + error_message，不影响其它视图
    """
    session = _get_sync_session()
    try:
        from app.models.character import Character
        from app.models.character_view import CharacterView

        view = session.get(CharacterView, view_id)
        if not view:
            logger.error("CharacterView %s not found", view_id)
            return
        if view.status == "completed":
            logger.info("CharacterView %s already completed, skip", view_id)
            return

        view.status = "generating"
        session.commit()

        character = session.get(Character, view.character_id)
        if not character:
            _mark_character_view_failed(session, view_id, "character not found")
            return

        endpoint, api_key, _model = _get_api_config(session, "image")
        if not endpoint or not api_key:
            _mark_character_view_failed(
                session, view_id, "图像生成 API 未配置，请在系统设置或 .env 中配置 endpoint 和 api_key。"
            )
            return

        base_prompt = (
            character.visual_prompt or character.description or character.name or "character"
        )
        view_type_hint = view.view_type or "front"
        prompt = f"{base_prompt}，{view_type_hint}视角，高质量，细节丰富"

        # 决策是否把角色种子图作为参考图：view 标记开启 + 种子图真实存在
        # 种子图缺失时不报错，降级为纯文生图，并在 error_message 里留痕（不影响 status=completed）
        reference_image_url: Optional[str] = None
        seed_fallback_note: Optional[str] = None
        if view.use_seed_image:
            if character.seed_image_url:
                reference_image_url = character.seed_image_url
            else:
                seed_fallback_note = "use_seed_image=True but character.seed_image_url is empty; fell back to text-to-image"
                logger.warning("CharacterView %s: %s", view_id, seed_fallback_note)

        from app.ai import image_adapter

        try:
            image_urls = image_adapter.generate_sync(
                endpoint=endpoint,
                api_key=api_key,
                prompt=prompt,
                count=1,
                reference_image_url=reference_image_url,
            )
        except Exception as exc:
            # image_adapter 内部已经做过 2 次限流/网络重试；到这里就是真失败。
            # 不再走 Celery 级 self.retry，避免双重重试把用户挂几分钟。
            logger.error("CharacterView %s 生成失败（放弃重试）: %s", view_id, exc)
            _mark_character_view_failed(session, view_id, f"image api failed: {exc}")
            return

        if not image_urls:
            _mark_character_view_failed(session, view_id, "image api returned empty")
            return

        # 重新 get 一次，避免 retry 间隙 view 被删
        view = session.get(CharacterView, view_id)
        if not view:
            return
        view.image_url = image_urls[0]
        view.status = "completed"
        # 降级提示不算错误，但保留给前端展示（字段是 String(512)，超长截断）
        view.error_message = (seed_fallback_note or "")[:500] or None
        session.commit()
        logger.info(
            "CharacterView %s 生成完成: %s (reference_used=%s)",
            view_id, view.image_url, bool(reference_image_url),
        )

    except Exception as exc:
        # Celery 的 Retry 异常需要原样抛出，不能被 "except Exception" 兜住
        from celery.exceptions import Retry

        if isinstance(exc, Retry):
            raise
        session.rollback()
        logger.exception("generate_character_view_task 意外失败: view_id=%s", view_id)
        _mark_character_view_failed(session, view_id, str(exc))
    finally:
        session.close()
