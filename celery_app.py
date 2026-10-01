"""
Celery application configuration for TTS task queue.

Uses Redis as both broker and result backend:
- Broker: redis://localhost:6379/1 (or CELERY_BROKER_URL env var)
- Result backend: redis://localhost:6379/2 (or CELERY_RESULT_BACKEND env var)
"""

import os

from celery import Celery

CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

app = Celery(
    "tts",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["tts_worker"],  # auto-discover tasks in tts_worker module
)

app.conf.update(
    result_expires=3600,           # results expire after 1 hour
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,  # one task at a time per worker process
)