"""
FastAPI application for the Text-to-Speech API.

Provides endpoints for listing available voices and generating speech audio
with sentence-level timestamps using Microsoft Edge neural TTS voices.
"""

import base64
import json
import logging
import os
import re
import uuid

from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from tts import get_preferred_voices, generate_audio
from text_structure import analyze_text_structure

load_dotenv()

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Text Reader TTS API",
    description="Free text-to-speech using Microsoft Edge neural voices with sentence timestamps.",
    version="1.0.0",
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s: %(message)s")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    if request.url.path == "/api/tts" and request.method == "POST":
        body = await request.body()
        logger.info("POST /api/tts raw body length: %d bytes", len(body))
        logger.info("POST /api/tts raw body: %s", body[:500])
        # Re-create the request with the consumed body
        from starlette.requests import Request as StarletteRequest
        scope = request.scope
        async def receive():
            return {"type": "http.request", "body": body}
        request = StarletteRequest(scope, receive=receive)
    response = await call_next(request)
    return response


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class TTSRequest(BaseModel):
    """Request body for the TTS endpoint."""
    text: str = Field(..., min_length=1, max_length=50000, description="Text to synthesize.")
    voice: str = Field(
        default="en-US-EmmaMultilingualNeural",
        description="Voice short name (e.g. 'en-US-EmmaMultilingualNeural').",
    )
    speed: float = Field(
        default=1.0,
        ge=0.5,
        le=2.0,
        description="Speech rate multiplier (0.5 = half speed, 2.0 = double speed).",
    )


class SentenceTimestamp(BaseModel):
    """Timing for a single sentence."""
    index: int = 0
    text: str
    start_ms: int
    end_ms: int


class TTSResponse(BaseModel):
    """Response from the TTS endpoint."""
    audio_base64: str = Field(description="Base64-encoded MP3 audio.")
    sentences: list[SentenceTimestamp] = Field(description="Sentence-level timestamps.")
    voice: str
    speed: float


class TTSAsyncResponse(BaseModel):
    """Response when TTS is submitted asynchronously."""
    task_id: str
    chunk_count: int
    mode: str = "async"


class TTSJobStatus(BaseModel):
    """Status of an async TTS job."""
    task_id: str
    status: str  # "queued", "processing", "complete", "error"
    chunk: int | None = None
    total: int | None = None
    error: str | None = None


class VoiceResponse(BaseModel):
    """A single voice in the voices list."""
    id: str
    name: str
    locale: str
    display_name: str


# ---------------------------------------------------------------------------
# Structure analysis models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    """Request body for the structure analysis endpoint."""
    text: str = Field(..., min_length=1, max_length=50000, description="Text to analyze for structure.")


class AnalyzeSection(BaseModel):
    """A single section in the document structure."""
    title: str
    level: int
    section_type: str
    number: str | None
    char_start: int
    char_end: int
    text: str
    text_preview: str
    children: list["AnalyzeSection"] = []


class AnalyzeResponse(BaseModel):
    """Response from the structure analysis endpoint."""
    sections: list[AnalyzeSection]
    doc_type: str  # "flat", "chapters", "sections", "hierarchical"
    total_chars: int
    detection_method: str
    has_structure: bool


# ---------------------------------------------------------------------------
# Quiz models
# ---------------------------------------------------------------------------

class QuizRequest(BaseModel):
    """Request body for the quiz endpoint."""
    text: str = Field(..., min_length=50, max_length=20000, description="Source text to generate questions from.")
    num_questions: int = Field(default=3, ge=1, le=8, description="How many questions to generate.")


class QuizQuestion(BaseModel):
    """A single multiple-choice quiz question."""
    question: str
    options: list[str]  # exactly 4
    correct_index: int  # 0-3
    explanation: str


class QuizResponse(BaseModel):
    """Response from the quiz endpoint."""
    questions: list[QuizQuestion]
    model: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/voices", response_model=list[VoiceResponse])
async def list_voices():
    """Return the highest-quality US English TTS voices, best first."""
    voices = await get_preferred_voices()
    return [
        VoiceResponse(id=v.id, name=v.name, locale=v.locale, display_name=v.display_name)
        for v in voices
    ]


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_structure(request: AnalyzeRequest):
    """
    Analyze text for document structure (chapters, sections, subsections).

    Returns a tree of detected sections with character offsets, allowing the
    frontend to offer section-level TTS generation.
    """
    logger.info("Analyze request: %d chars", len(request.text))

    result = analyze_text_structure(request.text)

    def convert_section(s) -> AnalyzeSection:
        return AnalyzeSection(
            title=s.title,
            level=s.level,
            section_type=s.section_type,
            number=s.number,
            char_start=s.char_start,
            char_end=s.char_end,
            text=s.text,
            text_preview=s.text_preview,
            children=[convert_section(c) for c in s.children],
        )

    return AnalyzeResponse(
        sections=[convert_section(s) for s in result.sections],
        doc_type=result.doc_type,
        total_chars=result.total_chars,
        detection_method=result.detection_method,
        has_structure=result.has_structure,
    )


@app.post("/api/tts", response_model=TTSResponse | TTSAsyncResponse)
async def text_to_speech(request: TTSRequest):
    """
    Generate speech audio from text.

    For short texts (<1000 chars), returns audio immediately (synchronous).
    For long texts (>=1000 chars), submits a Celery chord for parallel
    processing and returns a task_id for SSE progress tracking.
    """
    logger.info(
        "TTS request: text=%d chars, voice=%s, speed=%.1f",
        len(request.text), request.voice, request.speed,
    )

    # Fast path: short texts stay synchronous
    if len(request.text) < 1000:
        return await _tts_sync(request)

    # Async path: chunk and submit to Celery
    return await _tts_async(request)


async def _tts_sync(request: TTSRequest) -> TTSResponse:
    """Synchronous TTS for short texts."""
    try:
        result = await generate_audio(
            text=request.text,
            voice=request.voice,
            speed=request.speed,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {e}")

    audio_b64 = base64.b64encode(result.audio_bytes).decode("utf-8")

    return TTSResponse(
        audio_base64=audio_b64,
        sentences=[
            SentenceTimestamp(index=i, text=s.text, start_ms=s.start_ms, end_ms=s.end_ms)
            for i, s in enumerate(result.sentences)
        ],
        voice=request.voice,
        speed=request.speed,
    )


async def _tts_async(request: TTSRequest) -> TTSAsyncResponse:
    """Async TTS via Celery chord for large texts."""
    from celery import chord as celery_chord
    from celery_app import app as celery_app
    from tts_worker import generate_chunk_task, merge_chunks_callback
    from tts_chunks import split_into_chunks

    task_id = str(uuid.uuid4())

    # Normalize text the same way as the sync path
    normalized_text = re.sub(r"[\t\n\r]+", " ", request.text)
    normalized_text = re.sub(r" {2,}", " ", normalized_text).strip()

    # Split into chunks at sentence boundaries
    chunks = split_into_chunks(normalized_text, max_chars=2500)
    total_chunks = len(chunks)

    logger.info("Async TTS: task=%s, %d chunks", task_id, total_chunks)

    # Build chord: header = chunk tasks, body = merge callback
    header = [
        generate_chunk_task.s(
            chunk_index=c["chunk_index"],
            text=c["text"],
            voice=request.voice,
            speed=request.speed,
            task_id=task_id,
            total_chunks=total_chunks,
        )
        for c in chunks
    ]
    body = merge_chunks_callback.s(
        task_id=task_id,
        voice=request.voice,
        speed=request.speed,
    )

    # Submit the chord
    celery_chord(header)(body)

    return TTSAsyncResponse(task_id=task_id, chunk_count=total_chunks)


@app.get("/api/tts/stream/{task_id}")
async def tts_stream(task_id: str):
    """
    Server-Sent Events stream for TTS job progress.

    Subscribes to Redis pub/sub channel tts_progress:{task_id} and
    relays progress events to the client.

    Events:
    - data: {"status": "processing", "chunk": N, "total": M}
    - data: {"status": "chunk_done", "chunk": N, "total": M}
    - data: {"status": "complete", "task_id": "..."}
    - data: {"status": "error", "error": "..."}
    """
    import redis as redis_lib

    redis_url = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")
    r = redis_lib.from_url(redis_url)
    pubsub = r.pubsub()
    pubsub.subscribe(f"tts_progress:{task_id}")

    async def event_generator():
        try:
            for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = (
                    message["data"].decode("utf-8")
                    if isinstance(message["data"], bytes)
                    else message["data"]
                )
                yield f"data: {data}\n\n"
                # Stop after terminal states
                parsed = json.loads(data)
                if parsed.get("status") in ("complete", "error"):
                    break
        finally:
            pubsub.unsubscribe()
            pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/tts/{task_id}", response_model=TTSResponse)
async def tts_result(task_id: str):
    """
    Retrieve the result of a completed async TTS job.

    Returns the full TTSResponse (audio_base64, sentences, voice, speed).
    404 if the result has expired or doesn't exist.
    """
    import redis as redis_lib

    redis_url = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")
    r = redis_lib.from_url(redis_url)
    data = r.get(f"tts_result:{task_id}")

    if not data:
        raise HTTPException(status_code=404, detail="Result not found or expired.")

    result = json.loads(data)
    return TTSResponse(
        audio_base64=result["audio_base64"],
        sentences=[SentenceTimestamp(**s) for s in result["sentences"]],
        voice=result["voice"],
        speed=result["speed"],
    )


@app.delete("/api/tts/{task_id}")
async def tts_cancel(task_id: str):
    """
    Cancel an in-progress TTS job.

    Revokes the Celery chord and cleans up Redis keys.
    """
    import redis as redis_lib
    from celery_app import app as celery_app

    redis_url = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")
    r = redis_lib.from_url(redis_url)

    # Revoke any pending tasks (best-effort)
    celery_app.control.revoke(task_id, terminate=True)

    # Clean up Redis keys
    r.delete(f"tts_result:{task_id}")
    pubsub = r.pubsub()
    pubsub.unsubscribe(f"tts_progress:{task_id}")
    pubsub.close()

    return {"status": "cancelled", "task_id": task_id}


@app.post("/api/quiz", response_model=QuizResponse)
async def generate_quiz(request: QuizRequest):
    """
    Generate multiple-choice quiz questions about the given text using Google Gemini.

    Returns a strict-JSON list of questions, each with 4 options and a correct index.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not set. Copy .env.example to .env and add your Google Gemini API key.",
        )

    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    logger.info(
        "Quiz request: text=%d chars, num_questions=%d, model=%s",
        len(request.text), request.num_questions, model_name,
    )

    prompt = (
        f"You are a quiz generator. Based on the source text below, create exactly "
        f"{request.num_questions} multiple-choice questions that test comprehension of the material.\n\n"
        "Return STRICT JSON only — no markdown, no code fences, no extra commentary. "
        "The JSON must match this shape exactly:\n"
        '{"questions": [{"question": str, "options": [4 strings], "correct_index": int, "explanation": str}]}\n\n'
        "Rules:\n"
        "- Each question must have exactly 4 options.\n"
        "- Exactly one option is correct; correct_index is the 0-based index of that option.\n"
        "- Shuffle option order so the correct answer is not always in the same position.\n"
        "- The explanation should briefly justify why the correct answer is right.\n"
        "- Do not include any keys other than those specified.\n\n"
        f"Source text:\n{request.text}"
    )

    from google import genai
    client = genai.Client(api_key=api_key)
    try:
        result = client.models.generate_content(
            model=model_name,
            contents=prompt,
        )
    except Exception as e:
        logger.error("Gemini API call failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Gemini API call failed: {e}")

    raw = result.text or ""

    # Defensive JSON parsing: strip markdown fences if present
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        # Remove opening fence (```json or ```) and closing fence
        lines = cleaned.split("\n")
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error("Quiz JSON parse failed: %s | raw=%.300s", e, raw)
        raise HTTPException(
            status_code=502,
            detail=f"Model returned invalid JSON: {raw[:300]}",
        )

    raw_questions = data.get("questions", [])
    if not isinstance(raw_questions, list) or not raw_questions:
        raise HTTPException(status_code=502, detail=f"Model returned no questions: {raw[:300]}")

    questions: list[QuizQuestion] = []
    for i, q in enumerate(raw_questions):
        try:
            options = q["options"]
            correct_index = int(q["correct_index"])
            if len(options) != 4:
                raise ValueError(f"question {i}: expected 4 options, got {len(options)}")
            if not (0 <= correct_index < 4):
                raise ValueError(f"question {i}: correct_index {correct_index} out of range")
            questions.append(QuizQuestion(
                question=str(q["question"]),
                options=[str(o) for o in options],
                correct_index=correct_index,
                explanation=str(q.get("explanation", "")),
            ))
        except (KeyError, TypeError, ValueError) as e:
            logger.error("Quiz question validation failed at index %d: %s | raw=%.300s", i, e, raw)
            raise HTTPException(status_code=502, detail=f"Invalid question from model: {e}")

    logger.info("Quiz generated: %d questions from model %s", len(questions), model_name)
    return QuizResponse(questions=questions, model=model_name)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)