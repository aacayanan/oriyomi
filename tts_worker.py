"""
Celery tasks for TTS audio generation.

Tasks:
- generate_chunk_task: Generate TTS audio for a single text chunk
- merge_chunks_callback: Merge completed chunks into final audio (chord callback)
"""

import asyncio
import base64
import json
import logging
import os
import subprocess
import tempfile

import redis

from celery_app import app
from tts import generate_audio

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")
redis_client = redis.from_url(REDIS_URL)


def _run_async(coro):
    """Run an async coroutine in a new event loop (safe for Celery prefork workers)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@app.task(bind=True, max_retries=2, default_retry_delay=5)
def generate_chunk_task(
    self,
    chunk_index: int,
    text: str,
    voice: str,
    speed: float,
    task_id: str,
    total_chunks: int,
):
    """
    Generate TTS audio for a single text chunk.

    Publishes progress to Redis pub/sub channel tts_progress:{task_id}.
    Returns dict with chunk_index, audio_base64, and sentences.
    """
    try:
        logger.info(
            "Chunk %d/%d for task %s: %d chars",
            chunk_index + 1, total_chunks, task_id, len(text),
        )

        # Publish progress: chunk started
        redis_client.publish(f"tts_progress:{task_id}", json.dumps({
            "status": "processing",
            "chunk": chunk_index + 1,
            "total": total_chunks,
        }))

        # Generate audio for this chunk
        result = _run_async(generate_audio(text=text, voice=voice, speed=speed))

        audio_b64 = base64.b64encode(result.audio_bytes).decode("utf-8")
        sentences_data = [
            {"text": s.text, "start_ms": s.start_ms, "end_ms": s.end_ms}
            for s in result.sentences
        ]

        # Publish progress: chunk complete
        redis_client.publish(f"tts_progress:{task_id}", json.dumps({
            "status": "chunk_done",
            "chunk": chunk_index + 1,
            "total": total_chunks,
        }))

        return {
            "chunk_index": chunk_index,
            "audio_base64": audio_b64,
            "sentences": sentences_data,
            "duration_ms": result.sentences[-1].end_ms if result.sentences else 0,
        }
    except Exception as exc:
        logger.error("Chunk %d failed for task %s: %s", chunk_index, task_id, exc)
        raise self.retry(exc=exc)



def _update_document_fold_status(
    document_id: str,
    fold_index: int,
    status: str,
    **extra,
) -> None:
    """
    Persist fold status on the document record the API polls.

    Without this, /api/tts/document/{id}/status stays "queued" forever and
    the client never fetches finished fold audio (infinite Preparing).
    """
    key = f"tts_doc_status:{document_id}"
    try:
        raw = redis_client.get(key)
        if not raw:
            return
        data = json.loads(raw)
        folds = data.get("folds") or {}
        k = str(fold_index)
        if k not in folds:
            return
        folds[k]["status"] = status
        for ek, ev in extra.items():
            if ev is not None:
                folds[k][ek] = ev
        data["folds"] = folds
        redis_client.set(key, json.dumps(data), ex=3600)
    except Exception as exc:
        logger.warning(
            "Failed to update fold status doc=%s fold=%s: %s",
            document_id, fold_index, exc,
        )


@app.task(bind=True, max_retries=2, default_retry_delay=5)
def generate_fold_task(
    self,
    fold_index: int,
    text: str,
    voice: str,
    speed: float,
    document_id: str,
    title: str = "",
):
    """
    Generate TTS audio for one fold/section of a document.

    Each fold is its own Celery task so folds generate in parallel while
    the reader can already play whichever fold finishes first.

    Result key: tts_fold:{document_id}:{fold_index}
    Progress channel: tts_doc:{document_id}
    """
    try:
        logger.info(
            "Fold %s task doc=%s: %d chars",
            fold_index, document_id, len(text or ""),
        )

        _update_document_fold_status(document_id, fold_index, "processing")
        redis_client.publish(f"tts_doc:{document_id}", json.dumps({
            "status": "processing",
            "fold_index": fold_index,
            "title": title,
        }))

        normalized = re_sub_ws(text or "")
        if not normalized:
            raise ValueError("Fold text is empty")

        result = _run_async(generate_audio(text=normalized, voice=voice, speed=speed))
        audio_b64 = base64.b64encode(result.audio_bytes).decode("utf-8")
        sentences = [
            {"text": s.text, "start_ms": s.start_ms, "end_ms": s.end_ms}
            for i, s in enumerate(result.sentences)
        ]
        for i, s in enumerate(sentences):
            s["index"] = i
        duration_ms = result.sentences[-1].end_ms if result.sentences else 0

        payload = {
            "audio_base64": audio_b64,
            "sentences": sentences,
            "voice": voice,
            "speed": speed,
            "fold_index": fold_index,
            "title": title,
            "duration_ms": duration_ms,
        }
        redis_client.set(
            f"tts_fold:{document_id}:{fold_index}",
            json.dumps(payload),
            ex=3600,
        )
        # Status must flip here or the client polls "Preparing…" forever
        _update_document_fold_status(
            document_id,
            fold_index,
            "complete",
            duration_ms=duration_ms,
            sentence_count=len(sentences),
        )
        redis_client.publish(f"tts_doc:{document_id}", json.dumps({
            "status": "fold_complete",
            "fold_index": fold_index,
            "title": title,
            "duration_ms": duration_ms,
            "sentence_count": len(sentences),
        }))
        logger.info(
            "Fold %s complete doc=%s: %d sentences, %d bytes",
            fold_index, document_id, len(sentences), len(result.audio_bytes),
        )
        return {"fold_index": fold_index, "duration_ms": duration_ms}
    except Exception as exc:
        logger.error("Fold %s failed doc=%s: %s", fold_index, document_id, exc)
        _update_document_fold_status(
            document_id, fold_index, "error", error=str(exc),
        )
        redis_client.publish(f"tts_doc:{document_id}", json.dumps({
            "status": "fold_error",
            "fold_index": fold_index,
            "error": str(exc),
        }))
        raise self.retry(exc=exc)


def re_sub_ws(text: str) -> str:
    """Collapse whitespace the same way the HTTP layer does before TTS."""
    import re
    text = re.sub(r"[\t\n\r]+", " ", text)
    return re.sub(r" {2,}", " ", text).strip()


@app.task
def merge_chunks_callback(results: list, task_id: str, voice: str, speed: float):
    """
    Chord callback: merge all chunk results into final audio.

    Sorts by chunk_index, stitches sentence timestamps, concatenates audio via
    ffmpeg (lossless concat), stores the final result in Redis, and publishes a
    completion event on the progress pub/sub channel.
    """
    try:
        logger.info("Merging %d chunks for task %s", len(results), task_id)

        # Sort by chunk_index (chord results arrive in arbitrary order)
        results.sort(key=lambda r: r["chunk_index"])

        # Stitch sentence timestamps and concatenate audio
        all_sentences: list[dict] = []
        cumulative_duration_ms = 0
        audio_files: list[str] = []

        try:
            for chunk_result in results:
                # Write chunk audio to temp file for ffmpeg
                audio_bytes = base64.b64decode(chunk_result["audio_base64"])
                tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
                tmp.write(audio_bytes)
                tmp.close()
                audio_files.append(tmp.name)

                # Stitch sentence timestamps
                for s in chunk_result["sentences"]:
                    all_sentences.append({
                        "text": s["text"],
                        "start_ms": s["start_ms"] + cumulative_duration_ms,
                        "end_ms": s["end_ms"] + cumulative_duration_ms,
                    })

                cumulative_duration_ms += chunk_result["duration_ms"]

            # Concatenate audio files with ffmpeg (lossless, no re-encoding)
            concat_list = tempfile.NamedTemporaryFile(
                mode="w", suffix=".txt", delete=False,
            )
            for f in audio_files:
                concat_list.write(f"file '{f}'\n")
            concat_list.close()

            output_file = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
            output_file.close()

            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-f", "concat",
                    "-safe", "0",
                    "-i", concat_list.name,
                    "-c", "copy",
                    output_file.name,
                ],
                check=True,
                capture_output=True,
            )

            with open(output_file.name, "rb") as f:
                merged_audio = f.read()

            audio_b64 = base64.b64encode(merged_audio).decode("utf-8")

            # Assign sentence indices
            for i, s in enumerate(all_sentences):
                s["index"] = i

            # Store result in Redis (expires in 1 hour)
            result_data = json.dumps({
                "audio_base64": audio_b64,
                "sentences": all_sentences,
                "voice": voice,
                "speed": speed,
            })
            redis_client.set(f"tts_result:{task_id}", result_data, ex=3600)

            # Publish completion event
            redis_client.publish(f"tts_progress:{task_id}", json.dumps({
                "status": "complete",
                "task_id": task_id,
            }))

            logger.info(
                "Task %s complete: %d sentences, %d bytes audio",
                task_id, len(all_sentences), len(merged_audio),
            )

        finally:
            # Cleanup temp files
            for f in audio_files:
                try:
                    os.unlink(f)
                except OSError:
                    pass
            try:
                os.unlink(concat_list.name)
            except (OSError, UnboundLocalError):
                pass
            try:
                os.unlink(output_file.name)
            except (OSError, UnboundLocalError):
                pass

    except Exception as exc:
        logger.error("Merge failed for task %s: %s", task_id, exc)
        redis_client.publish(f"tts_progress:{task_id}", json.dumps({
            "status": "error",
            "error": str(exc),
        }))
        raise