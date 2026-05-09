"""Celery 异步任务：图片生成、视频生成、音频生成。"""

import asyncio
import logging
from typing import Any, Optional

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

CREDITS_MAP = {"image": 2, "video": 10, "audio": 5}

# 用户在 ShotEditor 没有显式选择参数时使用的默认值。
# 与前端 ShotEditor 的默认值保持一致，避免出现"前端 UI 是 1080p、实际请求是 720p"的漂移。
DEFAULT_IMAGE_PARAMS = {"ratio": "9:16", "resolution": "1080p"}
DEFAULT_VIDEO_PARAMS = {
    "ratio": "9:16",
    "resolution": "1080p",
    "duration": 5,
    "watermark": False,
}


def _merge_params(defaults: dict[str, Any], task_params: dict[str, Any] | None) -> dict[str, Any]:
    """把任务上的 params 合并到默认值之上。

    - task_params 为 None / 非 dict → 直接返回 defaults 副本
    - 仅覆盖 defaults 里已有的 key（防止脏字段）
    """
    merged = dict(defaults)
    if isinstance(task_params, dict):
        for key, value in task_params.items():
            if key in defaults and value not in (None, ""):
                merged[key] = value
    return merged


def _build_prompt_for_shot(session, shot, prompt_type: str = "image") -> str:
    """在 Celery worker 中为 shot 组装提示词。

    **直接复用 service 层的 shot_service.get_shot_prompt**，确保与前端"提示词预览"
    展示的内容**完全一致**——这是单一数据源。之前 worker 自己手撸了一份拼接逻辑，
    跟 service 层很容易漂移（比如 characters relationship 在同步 session 里不一定
    被加载），导致"前端展示的 prompt ≠ 实际生成用的 prompt"，本次彻底废弃。

    实现细节：worker 是同步上下文，service 层是异步且依赖 AsyncSession，
    所以这里用 asyncio.run 启动一个独立的异步 session 跑 get_shot_prompt。
    传入的 `session` 参数只用来拿 shot.scene_id → scene.project_id，
    真正的拼接走 service 层的预加载查询。
    """
    from app.models.scene import Scene
    from app.database import async_session
    from app.services import shot_service

    # service 层签名是 (db, project_id, shot_id, prompt_type)，需要 project_id
    scene = session.get(Scene, shot.scene_id)
    if not scene:
        return shot.title or "a cinematic scene"
    project_id = scene.project_id

    async def _run() -> str:
        async with async_session() as adb:
            preview = await shot_service.get_shot_prompt(
                adb, project_id, shot.id, prompt_type
            )
            return preview.prompt or ""

    try:
        prompt = asyncio.run(_run())
    except Exception as exc:  # noqa: BLE001 - 容错：拼装失败时退回到 shot.title
        logger.warning(
            "Failed to build %s prompt for shot %d via shot_service: %s",
            prompt_type, shot.id, exc,
        )
        prompt = ""

    return prompt or (shot.title or "a cinematic scene")


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


def _resolve_image_model_config(task_model_key: str | None) -> dict | None:
    """根据 task.model_key 拿到完整模型配置（含 endpoint/api_key/protocol）。

    找不到就回退到默认模型；连默认模型都没有就返回 None（由调用方报错）。
    """
    from app.services import image_models_service

    model = image_models_service.get_model_by_id(task_model_key)
    if model is None:
        # 兼容老任务：既没有 model_key 又没有 AI_IMAGE_MODELS 配置时，用旧的 .env 兜底
        return None
    return model


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def generate_image_task(self, task_id: int):
    """图片生成任务。

    模型来源：优先用 task.model_key 对应的 AI_IMAGE_MODELS 条目（含 endpoint/api_key/protocol），
    其次回落到 .env 的 AI_IMAGE_ENDPOINT/API_KEY（仅支持 images_generations 协议）。
    """
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

        # 优先从模型清单解析（含 protocol），失败回落到老的 .env 兜底路径
        model_cfg = _resolve_image_model_config(task.model_key)
        if model_cfg:
            endpoint = model_cfg["endpoint"]
            api_key = model_cfg["api_key"]
            model_name = model_cfg["model"]
            protocol = model_cfg["protocol"]
        else:
            endpoint, api_key, model_name = _get_api_config(session, "image")
            protocol = "images_generations"

        if not endpoint or not api_key:
            task.status = "failed"
            task.error_message = "Image API not configured. Please configure AI_IMAGE_MODELS or AI_IMAGE_* in .env."
            session.commit()
            return

        shot = session.get(Shot, task.shot_id)
        if not shot:
            task.status = "failed"
            task.error_message = "Shot not found"
            session.commit()
            return

        # 每次生成都按当前的 modules 开关 + custom_prompt 重新组装；
        # 不再依赖 shot.generated_prompt 旧缓存，避免开关切换后用错老 prompt。
        # 同时把本次实际使用的 prompt 回写到 shot.generated_prompt 供前端展示。
        image_prompt = _build_prompt_for_shot(session, shot, prompt_type="image")
        if not image_prompt:
            task.status = "failed"
            task.error_message = "Failed to build prompt for shot"
            session.commit()
            return
        shot.generated_prompt = image_prompt
        session.commit()

        # 读取用户在前端锁定的参考图：场景图 + 每个角色各一张 view
        # 顺序：[场景图, 角色1 view, 角色2 view, ...]，便于 LLM 先理解环境再还原角色
        reference_urls: list[str] = []

        # 1) 场景参考图
        if shot.ref_environment_image_id:
            from app.models.environment_image import EnvironmentImage

            env_image = session.get(EnvironmentImage, shot.ref_environment_image_id)
            if env_image and env_image.image_url:
                reference_urls.append(_to_absolute_media_url(env_image.image_url))
            else:
                logger.warning(
                    "shot %d ref_environment_image_id=%s 查无此图或 image_url 为空，跳过",
                    shot.id, shot.ref_environment_image_id,
                )

        # 2) 角色参考图（多角色多参考图），优先读新字段 ref_character_view_ids，回落到旧单值
        from app.models.character_view import CharacterView

        char_view_ids: list[int] = []
        if shot.ref_character_view_ids:
            # JSON 列返回的直接就是 list
            char_view_ids = [int(vid) for vid in shot.ref_character_view_ids if vid]
        elif shot.ref_character_view_id:
            char_view_ids = [shot.ref_character_view_id]

        for view_id in char_view_ids:
            view = session.get(CharacterView, view_id)
            if view and view.image_url:
                reference_urls.append(_to_absolute_media_url(view.image_url))
            else:
                logger.warning(
                    "shot %d ref_character_view_id=%s 查无此图或 image_url 为空，跳过",
                    shot.id, view_id,
                )

        from app.ai import image_adapter

        # 读取用户在 ShotEditor 选择的图片生成参数（ratio/resolution），缺省走默认 9:16/1080p
        image_params = _merge_params(DEFAULT_IMAGE_PARAMS, task.params)
        img_ratio = image_params.get("ratio")
        img_resolution = image_params.get("resolution")
        img_width, img_height = image_adapter.resolve_image_size(img_ratio, img_resolution)

        try:
            if protocol == "chat_completions_modalities":
                # Gemini 系列：multimodal content 原生支持多图，
                # 通过 extendParams.imageConfig 传入画面比例和分辨率。
                image_urls = image_adapter.generate_sync_via_chat(
                    endpoint=endpoint,
                    api_key=api_key,
                    model=model_name,
                    prompt=shot.generated_prompt,
                    count=1,
                    reference_image_urls=reference_urls,
                    ratio=img_ratio,
                    resolution=img_resolution,
                )
            else:
                # images_generations（gpt-image-2）：实测 payload.image 支持数组多图，全部透传
                image_urls = image_adapter.generate_sync(
                    endpoint=endpoint,
                    api_key=api_key,
                    prompt=shot.generated_prompt,
                    width=img_width,
                    height=img_height,
                    count=1,
                    reference_image_urls=reference_urls,
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

        logger.info(
            "Image task %d completed via %s (%s), %d images generated, ref_images=%d",
            task_id, model_name or "default", protocol, len(image_urls), len(reference_urls),
        )

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

        # 解析视频模型配置：优先按 task.model_key（前端选择）查 AI_VIDEO_MODELS 清单。
        # 找不到就回退到默认模型；连默认模型都没有时回退到 .env 的 AI_VIDEO_* 单条配置。
        from app.services import video_models_service

        model_cfg = video_models_service.get_model_by_id(task.model_key, strict=False)
        if model_cfg:
            endpoint = model_cfg["endpoint"]
            api_key = model_cfg["api_key"]
            video_model = model_cfg["model"]
        else:
            # 兜底：清单里没有任何模型时，仍然允许通过老的 AI_VIDEO_* 三件套生成
            endpoint, api_key, video_model = _get_api_config(session, "video")

        if not endpoint or not api_key:
            task.status = "failed"
            task.error_message = "Video API not configured. Please configure AI_VIDEO_MODELS or AI_VIDEO_* in .env."
            session.commit()
            return
        if not video_model:
            task.status = "failed"
            task.error_message = "Video model not configured."
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

        # 视频生成用独立的 video 提示词（独立的 modules 开关 / custom_prompt）
        video_prompt = _build_prompt_for_shot(session, shot, prompt_type="video")

        # 读取用户在 ShotEditor 选择的视频生成参数（ratio/resolution/duration/watermark）
        # 缺省走默认 9:16 / 1080p / 5s / 无水印（与前端默认值保持一致）
        video_params = _merge_params(DEFAULT_VIDEO_PARAMS, task.params)

        try:
            video_url = asyncio.run(
                video_adapter.generate(
                    endpoint=endpoint,
                    api_key=api_key,
                    model=video_model,
                    image_url=absolute_image_url,
                    prompt=video_prompt or shot.generated_prompt or "",
                    duration=int(video_params.get("duration") or 5),
                    ratio=video_params.get("ratio"),
                    resolution=video_params.get("resolution"),
                    watermark=bool(video_params.get("watermark") or False),
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


def _mark_environment_image_failed(session, image_id: int, error_message: str) -> None:
    """把 EnvironmentImage 标记为失败，供前端展示。"""
    try:
        from app.models.environment_image import EnvironmentImage

        image = session.get(EnvironmentImage, image_id)
        if image and image.status != "completed":
            image.status = "failed"
            image.error_message = (error_message or "")[:500]
            session.commit()
    except Exception:
        session.rollback()


def _call_image_api_by_model_key(
    session,
    model_key: Optional[str],
    prompt: str,
    reference_image_url: Optional[str],
    count: int = 1,
    ratio: Optional[str] = None,
    resolution: Optional[str] = None,
) -> tuple[list[str], str, str]:
    """按 model_key 查清单并调用对应协议的图像 API。

    Returns:
        (image_urls, model_key_used, protocol_used)

    - 优先用 model_key 对应的 AI_IMAGE_MODELS 条目（含 endpoint/api_key/protocol）
    - 找不到清单时回落到 .env 的 AI_IMAGE_ENDPOINT/API_KEY，按 images_generations 协议调
    - ratio/resolution 仅在 chat_completions_modalities 协议下通过 extendParams 传给上游
    - 调用方需负责捕获异常并转成领域错误
    """
    from app.ai import image_adapter

    model_cfg = _resolve_image_model_config(model_key)
    if model_cfg:
        endpoint = model_cfg["endpoint"]
        api_key = model_cfg["api_key"]
        model_name = model_cfg["model"]
        protocol = model_cfg["protocol"]
        used_model_key = model_cfg["id"]
    else:
        endpoint, api_key, model_name = _get_api_config(session, "image")
        protocol = "images_generations"
        used_model_key = model_key or ""

    if not endpoint or not api_key:
        raise RuntimeError(
            "图像生成 API 未配置，请在环境变量 AI_IMAGE_MODELS 或 AI_IMAGE_* 中配置 endpoint 和 api_key。"
        )

    if protocol == "chat_completions_modalities":
        image_urls = image_adapter.generate_sync_via_chat(
            endpoint=endpoint,
            api_key=api_key,
            model=model_name,
            prompt=prompt,
            count=count,
            reference_image_url=reference_image_url,
            ratio=ratio,
            resolution=resolution,
        )
    else:
        image_urls = image_adapter.generate_sync(
            endpoint=endpoint,
            api_key=api_key,
            prompt=prompt,
            count=count,
            reference_image_url=reference_image_url,
        )

    return image_urls, used_model_key, protocol


@celery_app.task(bind=True, max_retries=0)
def generate_character_view_task(self, view_id: int):
    """生成单张角色参考视图：queued → generating → completed/failed。

    流程：
    1. 校验 view 仍存在、状态合法
    2. 读取角色 + 按 view.model_key 查模型清单（回落到 .env 默认）
    3. 调用对应协议的图像 API（image_adapter 内部已做限流/重试）
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

        try:
            image_urls, used_model_key, protocol = _call_image_api_by_model_key(
                session=session,
                model_key=view.model_key,
                prompt=prompt,
                reference_image_url=reference_image_url,
                count=1,
            )
        except RuntimeError as cfg_err:
            # 配置缺失：直接给前端可读的中文错误
            _mark_character_view_failed(session, view_id, str(cfg_err))
            return
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
        # 如果占位阶段没写 model_key（老占位行），这里补回实际用到的 id
        if not view.model_key and used_model_key:
            view.model_key = used_model_key
        # 降级提示不算错误，但保留给前端展示（字段是 String(512)，超长截断）
        view.error_message = (seed_fallback_note or "")[:500] or None
        session.commit()
        logger.info(
            "CharacterView %s 生成完成 via %s (%s): %s (reference_used=%s)",
            view_id, used_model_key or "default", protocol, view.image_url, bool(reference_image_url),
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


@celery_app.task(bind=True, max_retries=0)
def generate_environment_image_task(self, image_id: int):
    """生成单张场景参考图：queued → generating → completed/failed。

    对齐 generate_character_view_task 的设计：
    1. 校验 image 仍存在、状态合法
    2. 读取场景 + 按 image.model_key 查模型清单（回落到 .env 默认）
    3. 调用对应协议的图像 API（支持把场景 seed_image_url 作为参考图）
    4. 拿到 URL 后回写 image_url + status=completed；首次生成同步写 environment.base_image_url
    5. 任意异常均兜底为 status=failed + error_message
    """
    session = _get_sync_session()
    try:
        from app.models.environment import Environment
        from app.models.environment_image import EnvironmentImage

        image = session.get(EnvironmentImage, image_id)
        if not image:
            logger.error("EnvironmentImage %s not found", image_id)
            return
        if image.status == "completed":
            logger.info("EnvironmentImage %s already completed, skip", image_id)
            return

        image.status = "generating"
        session.commit()

        environment = session.get(Environment, image.environment_id)
        if not environment:
            _mark_environment_image_failed(session, image_id, "environment not found")
            return

        base_prompt = (
            environment.prompt or environment.description or environment.name or "environment"
        )
        view_type_hint = image.view_type or "wide"
        prompt = f"{base_prompt}，{view_type_hint}视角，场景环境图，高质量，宽幅构图，电影感"

        # 参考图（种子图）决策：use_seed_image=True 且 seed_image_url 非空
        reference_image_url: Optional[str] = None
        seed_fallback_note: Optional[str] = None
        if image.use_seed_image:
            if environment.seed_image_url:
                reference_image_url = environment.seed_image_url
            else:
                seed_fallback_note = "use_seed_image=True but environment.seed_image_url is empty; fell back to text-to-image"
                logger.warning("EnvironmentImage %s: %s", image_id, seed_fallback_note)

        try:
            image_urls, used_model_key, protocol = _call_image_api_by_model_key(
                session=session,
                model_key=image.model_key,
                prompt=prompt,
                reference_image_url=reference_image_url,
                count=1,
            )
        except RuntimeError as cfg_err:
            _mark_environment_image_failed(session, image_id, str(cfg_err))
            return
        except Exception as exc:
            logger.error("EnvironmentImage %s 生成失败（放弃重试）: %s", image_id, exc)
            _mark_environment_image_failed(session, image_id, f"image api failed: {exc}")
            return

        if not image_urls:
            _mark_environment_image_failed(session, image_id, "image api returned empty")
            return

        # 重新 get 一次，避免 retry 间隙 image 被删
        image = session.get(EnvironmentImage, image_id)
        if not image:
            return
        image.image_url = image_urls[0]
        image.status = "completed"
        if not image.model_key and used_model_key:
            image.model_key = used_model_key
        image.error_message = (seed_fallback_note or "")[:500] or None

        # 首次生成时，同步写入 environment.base_image_url 便于兼容旧前端
        environment = session.get(Environment, image.environment_id)
        if environment and not environment.base_image_url:
            environment.base_image_url = image_urls[0]

        session.commit()
        logger.info(
            "EnvironmentImage %s 生成完成 via %s (%s): %s (reference_used=%s)",
            image_id, used_model_key or "default", protocol, image.image_url, bool(reference_image_url),
        )

    except Exception as exc:
        from celery.exceptions import Retry

        if isinstance(exc, Retry):
            raise
        session.rollback()
        logger.exception("generate_environment_image_task 意外失败: image_id=%s", image_id)
        _mark_environment_image_failed(session, image_id, str(exc))
    finally:
        session.close()
