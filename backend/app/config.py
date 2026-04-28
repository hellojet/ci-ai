from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ci_ai"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret_key: str = "change-me-to-a-random-secret-key"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24

    # MinIO / S3
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_secure: bool = False
    minio_bucket_uploads: str = "ci-ai-uploads"
    minio_bucket_generated: str = "ci-ai-generated"
    minio_bucket_exports: str = "ci-ai-exports"

    # 七牛云对象存储
    qiniu_access_key: str = ""
    qiniu_secret_key: str = ""
    qiniu_bucket: str = "ci-ai"
    qiniu_domain: str = ""

    # Lock
    lock_heartbeat_timeout_seconds: int = 60

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
