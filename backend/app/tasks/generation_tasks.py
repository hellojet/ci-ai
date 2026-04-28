"""Celery 异步任务：图片生成、视频生成、音频生成。"""

import asyncio
import logging

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

CREDITS_MAP = {"image": 2, "video": 10, "audio": 5}


def _get_sync_session():
    """创建同步数据库 session 用于 Celery worker。"""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.config import get_settings

    settings = get_settings()
    sync_url = settings.database_url.replace("+asyncpg", "+psycopg2")
    engine = create_engine(sync_url)
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def _get_api_config(session, task_type: str) -> tuple[str, str]:
    """从 SystemSettings 读取指定类型的 API 配置。"""
    from app.models.system_settings import SystemSettings

    endpoint_row = (
        session.query(SystemSettings)
        .filter(SystemSettings.key == f"api.{task_type}.endpoint")
        .first()
    )
    key_row = (
        session.query(SystemSettings)
        .filter(SystemSettings.key == f"api.{task_type}.api_key")
        .first()
    )
    endpoint = endpoint_row.value.get("value", "") if endpoint_row else ""
    api_key = key_row.value.get("value", "") if key_row else ""
    return endpoint, api_key


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

        endpoint, api_key = _get_api_config(session, "image")
        if not endpoint or not api_key:
            task.status = "failed"
            task.error_message = "Image API not configured. Please configure in Settings."
            session.commit()
            return

        shot = session.get(Shot, task.shot_id)
        if not shot or not shot.generated_prompt:
            task.status = "failed"
            task.error_message = "Shot not found or prompt not generated"
            session.commit()
            return

        from app.ai import image_adapter

        try:
            image_urls = asyncio.run(
                image_adapter.generate(
                    endpoint=endpoint,
                    api_key=api_key,
                    prompt=shot.generated_prompt,
                    count=4,
                )
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

        task = session.get(GenerationTask, task_id)
        if not task:
            logger.error("Task %d not found", task_id)
            return

        task.status = "processing"
        session.commit()

        endpoint, api_key = _get_api_config(session, "video")
        if not endpoint or not api_key:
            task.status = "failed"
            task.error_message = "Video API not configured. Please configure in Settings."
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

        try:
            video_url = asyncio.run(
                video_adapter.generate(
                    endpoint=endpoint,
                    api_key=api_key,
                    image_url=locked_image.image_url,
                    prompt=shot.generated_prompt or "",
                )
            )
        except Exception as exc:
            task.status = "failed"
            task.error_message = str(exc)
            task.retry_count += 1
            session.commit()
            raise self.retry(exc=exc)

        shot.video_url = video_url
        shot.status = "video_generated"
        task.status = "completed"
        task.result_url = video_url
        session.commit()

        logger.info("Video task %d completed", task_id)

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

        endpoint, api_key = _get_api_config(session, "audio")
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
