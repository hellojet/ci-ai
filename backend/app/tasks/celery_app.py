"""Celery 应用配置。"""

from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "ci_ai_worker",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # 任务不依赖 Celery result backend 拿返回值（worker 自己写库），
    # 关闭之后 .delay() 不会触发 result_consumer.consume_from 里的 Redis MGET，
    # 这是在 Redis 挂掉时 HTTP 请求会被卡 ~50 秒的真正原因。
    task_ignore_result=True,
    # Broker 连接/派发超时：Redis 挂掉时让 .delay() 快速失败，不拖住调用方（FastAPI 请求）
    broker_connection_timeout=2.0,
    broker_connection_retry_on_startup=False,
    broker_connection_max_retries=0,
    broker_transport_options={
        "socket_timeout": 2,
        "socket_connect_timeout": 2,
    },
    # result backend 也设同样的超时，双保险：即便某处仍用 backend，也能快速失败
    result_backend_transport_options={
        "socket_timeout": 2,
        "socket_connect_timeout": 2,
        "retry_policy": {"timeout": 2.0},
    },
)

celery_app.autodiscover_tasks(["app.tasks"])

# 显式 import，确保任务在 worker 启动时注册，避免 KeyError: 'app.tasks.generation_tasks.xxx'
from app.tasks import generation_tasks  # noqa: E402,F401
