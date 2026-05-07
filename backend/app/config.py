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
    # ai_image_endpoint / ai_image_model / ai_image_api_key 保留作为"默认图像模型"的兜底配置，
    # 真正的多模型清单请使用 ai_image_models（JSON 字符串），前端在生成画面里做下拉选择。
    ai_image_endpoint: str = ""
    ai_image_model: str = ""
    ai_image_api_key: str = ""
    ai_image_concurrency: int = 1
    ai_image_timeout: int = 120
    # 图像模型清单（JSON 字符串），示例：
    # [{"id":"gpt-image-2","label":"GPT Image 2","endpoint":"https://.../images/generations",
    #   "api_key":"fai-...","model":"gpt-image-2","protocol":"images_generations","default":true},
    #  {"id":"gemini-2.5-flash-image-preview","label":"Gemini 2.5 Flash Image",
    #   "endpoint":"https://.../chat/completions","api_key":"fai-...",
    #   "model":"gemini-2.5-flash-image-preview","protocol":"chat_completions_modalities"}]
    ai_image_models: str = ""
    # 视频生成
    ai_video_endpoint: str = ""
    ai_video_model: str = ""
    ai_video_api_key: str = ""
    ai_video_concurrency: int = 1
    ai_video_timeout: int = 300
    # 视频模型清单（JSON 字符串）：与 ai_image_models 同构。
    # 字段：id/label/display_name/endpoint/api_key/model/protocol/default
    # 当前 protocol 仅支持 "dashscope_async_i2v"（dashscope 异步任务模式：submit + poll）
    # 示例：[{"id":"happyhorse-1.0-i2v","label":"HappyHorse 1.0 I2V","display_name":"快马 1.0",
    #   "endpoint":"https://.../video-synthesis","api_key":"fai-...",
    #   "model":"happyhorse-1.0-i2v","protocol":"dashscope_async_i2v","default":true}]
    ai_video_models: str = ""
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
