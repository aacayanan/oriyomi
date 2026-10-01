"""
FastAPI application for the Text-to-Speech API.

Provides endpoints for listing available voices and generating speech audio
with sentence-level timestamps using Microsoft Edge neural TTS voices.
"""

import base64
import json
import logging
import os

from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from tts import get_preferred_voices, generate_audio

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
    text: str
    start_ms: int
    end_ms: int


class TTSResponse(BaseModel):
    """Response from the TTS endpoint."""
    audio_base64: str = Field(description="Base64-encoded MP3 audio.")
    sentences: list[SentenceTimestamp] = Field(description="Sentence-level timestamps.")
    voice: str
    speed: float


class VoiceResponse(BaseModel):
    """A single voice in the voices list."""
    id: str
    name: str
    locale: str
    display_name: str


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


@app.post("/api/tts", response_model=TTSResponse)
async def text_to_speech(request: TTSRequest):
    """
    Generate speech audio from text.

    Returns base64-encoded MP3 audio and sentence-level timestamps
    for synchronizing text highlighting with audio playback.
    """
    logger.info("TTS request: text=%d chars, voice=%s, speed=%.1f", len(request.text), request.voice, request.speed)
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
            SentenceTimestamp(text=s.text, start_ms=s.start_ms, end_ms=s.end_ms)
            for s in result.sentences
        ],
        voice=request.voice,
        speed=request.speed,
    )


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
