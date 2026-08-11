"""Celery application for SpiritLens async task processing."""
from celery import Celery
from kombu import Queue
from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "spiritlens",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    result_expires=3600,
    worker_send_task_events=True,
    task_send_sent_event=True,
    broker_connection_retry_on_startup=True,
    broker_transport_options={"retry_on_timeout": True, "socket_keepalive": True},
    # 队列路由：图片/视频任务分队列消费，长耗时视频任务不饿死图片任务。
    # 未命中路由的任务走 "celery" 兜底队列（显式声明，避免进无人消费的黑洞队列）。
    task_routes={
        "app.tasks.generate_image": {"queue": "image"},
        "app.tasks.generate_video": {"queue": "video"},
    },
    task_queues=(
        Queue("image", routing_key="image"),
        Queue("video", routing_key="video"),
        Queue("celery", routing_key="celery"),
    ),
    worker_shutdown_timeout=30,
    # 2026-08-11 修复：部署重建 worker 时丢任务（PROCESSING 永久卡死）。
    # acks_late：任务执行完才 ack → worker 重启时已取未执行/执行中的任务
    # 由 broker 重新投递，不再丢失；配合 acks_on_failure_or_timeout 防止
    # 反复崩溃导致无限重投（time_limit 超时也会 ack）。
    task_acks_late=True,
    task_acks_on_failure_or_timeout=True,
)

# Make sure task modules are imported so they register with Celery
import app.tasks  # noqa: F401
