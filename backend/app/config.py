from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ci_ai"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # 对外可访问的基础 URL（用于拼接传给外部 AI 网关的绝对图片/音频地址）
    # 生产环境应配成可被外网访问的域名或 ngrok 地址，例如 https://xxx.ngrok.app
    # 本地调试可设为 http://<内网 IP>:8000 或 http://host.docker.internal:8000
    # 未配置时，相对 URL 将原样透传（dashscope 等外部网关会直接报 400）
    public_base_url: str = ""

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

    # AI 模型默认配置（.env 兜底，数据库配置优先）
    # 文本生成
    ai_text_endpoint: str = ""
    ai_text_model: str = ""
    ai_text_api_key: str = ""
    ai_text_concurrency: int = 1
    ai_text_timeout: int = 60
    # 图像生成
    ai_image_endpoint: str = ""
    ai_image_model: str = ""
    ai_image_api_key: str = ""
    ai_image_concurrency: int = 1
    ai_image_timeout: int = 120
    # 视频生成
    ai_video_endpoint: str = ""
    ai_video_model: str = ""
    ai_video_api_key: str = ""
    ai_video_concurrency: int = 1
    ai_video_timeout: int = 300
    # 音频生成
    ai_audio_endpoint: str = ""
    ai_audio_model: str = ""
    ai_audio_api_key: str = ""
    ai_audio_concurrency: int = 1
    ai_audio_timeout: int = 120

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
