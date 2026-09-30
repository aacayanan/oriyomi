"""
FastAPI application for the Text-to-Speech API.

Provides endpoints for listing available voices and generating speech audio
with sentence-level timestamps using Microsoft Edge neural TTS voices.
"""

import base64

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from tts import get_preferred_voices, generate_audio

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Text Reader TTS API",
    description="Free text-to-speech using Microsoft Edge neural voices with sentence timestamps.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class TTSRequest(BaseModel):
    """Request body for the TTS endpoint."""
    text: str = Field(..., min_length=1, max_length=5000, description="Text to synthesize.")
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
