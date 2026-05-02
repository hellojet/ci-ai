"""对象存储服务。

落盘策略（与 app.ai.image_adapter 对齐）：
1. 优先上传到七牛云（.env 配置 QINIU_*），返回公网 CDN URL，供外部 AI 网关直接拉取
2. 七牛未配置或上传异常时，降级使用 MinIO（本地开发且已起了 MinIO 的场景）
3. MinIO 也不可用时，抛 HTTPException，让上层给出明确错误

保持对上层契约不变：仍然返回一个可访问的 URL 字符串。
"""

import io
import logging
import uuid

from fastapi import HTTPException
from minio import Minio

from app.config import get_settings

logger = logging.getLogger(__name__)


def _is_qiniu_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.qiniu_access_key
        and settings.qiniu_secret_key
        and settings.qiniu_bucket
        and settings.qiniu_domain
    )


def get_minio_client() -> Minio:
    settings = get_settings()
    return Minio(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def ensure_buckets():
    """确保所有需要的 bucket 都已存在（仅在使用 MinIO 时调用）。"""
    client = get_minio_client()
    settings = get_settings()
    for bucket in [
        settings.minio_bucket_uploads,
        settings.minio_bucket_generated,
        settings.minio_bucket_exports,
    ]:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
            logger.info("Created bucket: %s", bucket)


# bucket_name → 七牛 folder 前缀（便于在七牛后台按路径管理）
_BUCKET_TO_FOLDER = {
    "ci-ai-uploads": "uploads",
    "ci-ai-generated": "generated",
    "ci-ai-exports": "exports",
}


def _upload_to_qiniu(
    file_data: bytes, filename: str, bucket_name: str
) -> str:
    from app.services.qiniu_storage import upload_bytes

    extension = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    folder = _BUCKET_TO_FOLDER.get(bucket_name, "uploads")
    url = upload_bytes(file_data, extension=extension, folder=folder)
    logger.info("Uploaded file to qiniu: %s", url)
    return url


def _upload_to_minio(
    file_data: bytes,
    filename: str,
    bucket_name: str,
    content_type: str,
) -> str:
    client = get_minio_client()
    settings = get_settings()

    extension = filename.rsplit(".", 1)[-1] if "." in filename else ""
    object_name = f"{uuid.uuid4().hex}.{extension}" if extension else uuid.uuid4().hex

    client.put_object(
        bucket_name=bucket_name,
        object_name=object_name,
        data=io.BytesIO(file_data),
        length=len(file_data),
        content_type=content_type,
    )

    protocol = "https" if settings.minio_secure else "http"
    url = f"{protocol}://{settings.minio_endpoint}/{bucket_name}/{object_name}"
    logger.info("Uploaded file to MinIO: %s", url)
    return url


def upload_file(
    bucket_name: str,
    file_data: bytes,
    filename: str,
    content_type: str = "application/octet-stream",
) -> str:
    """上传文件，返回公网可访问 URL。

    七牛优先 → MinIO 降级。两者都不可用时抛 HTTPException。
    """
    # 1) 七牛
    if _is_qiniu_configured():
        try:
            return _upload_to_qiniu(file_data, filename, bucket_name)
        except Exception as exc:
            logger.warning(
                "Qiniu upload failed, falling back to MinIO if available: %s", exc
            )

    # 2) MinIO 降级
    try:
        return _upload_to_minio(file_data, filename, bucket_name, content_type)
    except Exception as exc:
        logger.error("Upload failed (both qiniu and minio): %s", exc)
        raise HTTPException(
            status_code=500,
            detail=(
                "File upload failed: no usable object storage. "
                "Please configure QINIU_* in .env or start MinIO on localhost:9000."
            ),
        )


def get_file_url(bucket_name: str, object_name: str) -> str:
    """生成文件访问 URL。"""
    settings = get_settings()
    protocol = "https" if settings.minio_secure else "http"
    return f"{protocol}://{settings.minio_endpoint}/{bucket_name}/{object_name}"


def delete_file(bucket_name: str, object_name: str) -> None:
    """删除 MinIO 中的文件。"""
    client = get_minio_client()
    client.remove_object(bucket_name, object_name)
    logger.info("Deleted file: %s/%s", bucket_name, object_name)
