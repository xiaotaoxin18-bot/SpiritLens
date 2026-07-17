"""Celery application for SpiritLens async task processing."""
from celery import Celery
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
)

# Make sure task modules are imported so they register with Celery
import app.tasks  # noqa: F401
