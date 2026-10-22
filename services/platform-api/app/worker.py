"""Celery application for platform-api background work.

Uses its own Redis DB index so it cannot collide with the NestJS BullMQ keys (DB 0).
"""

import os
import ssl

from celery import Celery

from app.config import get_settings
from app.logging import configure_logging

configure_logging(os.environ.get("LOG_LEVEL", "info"))
broker = get_settings().celery_broker_url

celery_app = Celery("platform", broker=broker, backend=None, include=["app.crop_scans.tasks", "app.satellite.tasks", "app.irrigation.tasks"])
celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_time_limit=180,
    task_soft_time_limit=150,
    broker_connection_retry_on_startup=True,
    broker_connection_timeout=5,
    broker_use_ssl={"ssl_cert_reqs": ssl.CERT_REQUIRED} if broker.startswith("rediss://") else False,
    broker_transport_options={"socket_timeout": 5, "socket_connect_timeout": 5, "retry_on_timeout": False},
    task_publish_retry_policy={"max_retries": 2, "interval_start": 0, "interval_step": 0.2, "interval_max": 0.5},
    timezone="Asia/Karachi",
    enable_utc=True,
    task_routes={"satellite.*": {"queue": "satellite"}, "irrigation.productivity": {"queue": "wapor"}, "irrigation.*": {"queue": "irrigation"}},
    beat_schedule={
        "irrigation-outbox": {"task": "irrigation.dispatch", "schedule": 30.0},
        "satellite-outbox": {"task": "satellite.dispatch", "schedule": 30.0},
        "satellite-monitoring": {"task": "satellite.schedule", "schedule": 600.0},
    },
)
get_settings()  # fail fast on missing configuration
