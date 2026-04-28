"""MinIO/S3 文件存储服务。"""

import io
import logging
import uuid

from minio import Minio

from app.config import get_settings

logger = logging.getLogger(__name__)


def get_minio_client() -> Minio:
    settings = get_settings()
    return Minio(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def ensure_buckets():
    """确保所有需要的 bucket 都已存在。"""
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


def upload_file(
    bucket_name: str,
    file_data: bytes,
    filename: str,
    content_type: str = "application/octet-stream",
) -> str:
    """上传文件到 MinIO，返回访问 URL。"""
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
    logger.info("Uploaded file: %s", url)
    return url


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
