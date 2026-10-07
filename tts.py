"""
Text-to-Speech engine using Microsoft Edge's neural TTS voices (edge-tts).

Provides voice listing, audio generation with MP3 output, and sentence-level
timestamps using edge-tts's built-in SentenceBoundary events.
"""

import asyncio
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass

import edge_tts

from tts_chunks import split_into_chunks

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Voice list cache
# ---------------------------------------------------------------------------

# Avoids a network round-trip on every TTS request.
# Each process (uvicorn worker) maintains its own cache.
_voice_cache: set[str] | None = None
_voice_cache_time: float = 0
_VOICE_CACHE_TTL: float = 3600  # 1 hour


async def _get_voice_set() -> set[str]:
    """Return the set of valid voice IDs, cached for VOICE_CACHE_TTL seconds."""
    global _voice_cache, _voice_cache_time
    now = time.monotonic()
    if _voice_cache is not None and (now - _voice_cache_time) < _VOICE_CACHE_TTL:
        return _voice_cache
    voices = await get_voices()
    _voice_cache = {v.id for v in voices}
    _voice_cache_time = now
    return _voice_cache


# ---------------------------------------------------------------------------
# Public data types
# ---------------------------------------------------------------------------

@dataclass
class Voice:
    """A TTS voice returned by the engine."""
    id: str
    name: str
    locale: str
    display_name: str


@dataclass
class SentenceTimestamp:
    """Timing information for a single sentence."""
    text: str
    start_ms: int
    end_ms: int


@dataclass
class TTSResult:
    """Result of a TTS generation request."""
    audio_bytes: bytes
    sentences: list[SentenceTimestamp]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _display_name(friendly_name: str) -> str:
    """
    Extract a clean display name from a Microsoft Edge TTS friendly name.

    Turns "Microsoft AvaMultilingual Online (Natural) - English (United States)"
    into "Ava (Multilingual)", or "Microsoft Aria Online (Natural) ..." into "Aria".
    Falls back to the original string if parsing fails.
    """
    if not friendly_name.startswith("Microsoft "):
        return friendly_name
    # e.g. "Microsoft AvaMultilingual Online (Natural) - English (United States)"
    rest = friendly_name[len("Microsoft "):]  # "AvaMultilingual Online ..."
    name = rest.split(" Online")[0]            # "AvaMultilingual" or "Aria"
    if name.endswith("Multilingual"):
        name = name[: -len("Multilingual")]
        return f"{name} (Multilingual)"
    return name


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# Curated shortlist of the highest-quality US English voices, best first.
# The four *Multilingual voices are Microsoft's newest HD generation; the rest
# are the strongest of the classic neural voices. Left out: child/telephony
# voices (Ana, Eric, Roger) and non-multilingual twins superseded by these
# (e.g. AvaNeural, EmmaNeural).
_PREFERRED_VOICE_IDS = [
    "en-US-AvaMultilingualNeural",
    "en-US-EmmaMultilingualNeural",
    "en-US-AndrewMultilingualNeural",
    "en-US-BrianMultilingualNeural",
    "en-US-AriaNeural",
    "en-US-JennyNeural",
    "en-US-GuyNeural",
    "en-US-ChristopherNeural",
    "en-US-MichelleNeural",
]


async def get_voices() -> list[Voice]:
    """Return all available TTS voices."""
    raw = await edge_tts.list_voices()
    return [
        Voice(
            id=v["ShortName"],
            name=v["FriendlyName"],
            locale=v["Locale"],
            display_name=_display_name(v["FriendlyName"]),
        )
        for v in raw
    ]


async def get_preferred_voices() -> list[Voice]:
    """
    Return the highest-quality US English voices only.

    Preserves the curated quality ordering. Falls back to every en-US voice
    if none of the curated short names are available from the engine.
    """
    voices = await get_voices()
    by_id = {v.id: v for v in voices}

    preferred = [by_id[vid] for vid in _PREFERRED_VOICE_IDS if vid in by_id]
    if preferred:
        return preferred
    return [v for v in voices if v.locale == "en-US"]


# ---------------------------------------------------------------------------
# Text normalization
# ---------------------------------------------------------------------------

def _normalize_text(text: str) -> str:
    """
    Normalize text for TTS by cleaning up whitespace and formatting.

    Collapses multiple whitespace characters (spaces, tabs, newlines) into
    single spaces and trims leading/trailing whitespace. This prevents
    edge-tts from inserting unwanted pauses at arbitrary break points.
    """
    # Replace tabs and newlines with spaces
    text = text.replace("\t", " ").replace("\n", " ").replace("\r", " ")
    # Collapse multiple spaces into one
    text = re.sub(r' {2,}', ' ', text)
    # Remove spaces before punctuation
    text = re.sub(r'\s+([.,!?;:])', r'\1', text)
    # Ensure single space after punctuation
    text = re.sub(r'([.,!?;:])\s{2,}', r'\1 ', text)
    return text.strip()


async def generate_audio(
    text: str,
    voice: str = "en-US-EmmaMultilingualNeural",
    speed: float = 1.0,
) -> TTSResult:
    """
    Generate speech audio from text with sentence-level timestamps.

    Uses edge-tts's SentenceBoundary events to get precise timing for each
    sentence, which is used for text highlighting during playback.

    Args:
        text: The text to synthesize.
        voice: The voice short name (e.g. "en-US-EmmaMultilingualNeural").
        speed: Speech rate multiplier (0.5 = half speed, 2.0 = double speed).

    Returns:
        TTSResult with MP3 audio bytes and sentence timestamps.

    Raises:
        ValueError: If text is empty or voice is not found.
        RuntimeError: If the TTS engine returns no audio data.
    """
    if not text or not text.strip():
        raise ValueError("Text must not be empty.")

    # Normalize text: collapse whitespace, fix formatting for better TTS
    text = _normalize_text(text)

    # Validate voice exists (cached — avoids network round-trip on every request)
    voice_ids = await _get_voice_set()
    if voice not in voice_ids:
        raise ValueError(
            f"Voice '{voice}' not found. Available voices: {sorted(voice_ids)[:10]}..."
        )

    # Collect audio chunks and sentence boundary events with retry
    max_retries = 3
    last_error: Exception | None = None

    for attempt in range(max_retries):
        audio_chunks: list[bytes] = []
        sentence_boundaries: list[dict] = []

        communicate = edge_tts.Communicate(
            text,
            voice,
            rate=_speed_to_rate(speed),
            boundary="SentenceBoundary",
        )

        try:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_chunks.append(chunk["data"])
                elif chunk["type"] == "SentenceBoundary":
                    sentence_boundaries.append({
                        "text": chunk["text"],
                        "offset_ms": int(chunk["offset"] / 10_000),  # ticks -> ms
                        "duration_ms": int(chunk["duration"] / 10_000),
                    })

            audio_bytes = b"".join(audio_chunks)

            if audio_bytes:
                break  # Success

            last_error = RuntimeError("TTS engine returned no audio data.")
            logger.warning("TTS attempt %d/%d: no audio received, retrying...", attempt + 1, max_retries)
        except Exception as e:
            last_error = e
            logger.warning("TTS attempt %d/%d failed: %s, retrying...", attempt + 1, max_retries, e)

        # Wait before retrying (exponential backoff: 0.5s, 1s, 2s)
        if attempt < max_retries - 1:
            await asyncio.sleep(0.5 * (2 ** attempt))

    if not audio_bytes:
        raise RuntimeError(f"TTS generation failed after {max_retries} attempts: {last_error}")

    # Build sentence timestamps from boundary events
    sentences = [
        SentenceTimestamp(
            text=sb["text"],
            start_ms=sb["offset_ms"],
            end_ms=sb["offset_ms"] + sb["duration_ms"],
        )
        for sb in sentence_boundaries
    ]

    # Fallback: if no sentence boundaries were returned, split the text
    # manually with estimated timestamps (no timing info available)
    if not sentences:
        sentences = _fallback_sentences(text)

    return TTSResult(audio_bytes=audio_bytes, sentences=sentences)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

# Matches sentence boundaries: period, !, ? followed by optional quotes/parens,
# then whitespace. Requires the next character to be uppercase or a quote/bracket
# to avoid splitting on abbreviations like "Dr." or "U.S.A.".
_SENTENCE_RE = re.compile(
    r'(?<=[.!?])'           # lookbehind for sentence-ending punctuation
    r'(?:"|\'|\)|\])*'      # optional closing quotes/parens
    r'\s+'                   # required whitespace
    r'(?=[A-Z"\'\(\[])'     # lookahead for start of new sentence
)


def _fallback_sentences(text: str) -> list[SentenceTimestamp]:
    """
    Fallback sentence splitting when no boundary events are returned.

    Returns sentences with start_ms=0 and end_ms=0 (no timing info).
    """
    if not text or not text.strip():
        return []
    raw_sentences = _SENTENCE_RE.split(text.strip())
    return [
        SentenceTimestamp(text=s.strip(), start_ms=0, end_ms=0)
        for s in raw_sentences
        if s.strip()
    ]


def _speed_to_rate(speed: float) -> str:
    """Convert a speed multiplier to an SSML rate string like '+20%' or '-10%'."""
    if speed == 1.0:
        return "+0%"
    pct = int((speed - 1.0) * 100)
    sign = "+" if pct >= 0 else ""
    return f"{sign}{pct}%"


# ---------------------------------------------------------------------------
# Chunked generation (in-process parallelism)
# ---------------------------------------------------------------------------

async def generate_audio_chunked(
    text: str,
    voice: str = "en-US-EmmaMultilingualNeural",
    speed: float = 1.0,
    max_chars: int = 2500,
) -> TTSResult:
    """
    Generate speech for arbitrary-length text.

    Short texts go straight to generate_audio. Longer texts split at sentence
    boundaries (tts_chunks) and every chunk generates concurrently on one
    event loop, then merges via ffmpeg — the same parallelism a task queue
    provided, now in-process so it runs inside a single request.

    Args:
        text: The text to synthesize.
        voice: The voice short name.
        speed: Speech rate multiplier.
        max_chars: Target chunk size; produces ~30-60s of audio per chunk.

    Returns:
        TTSResult with merged MP3 audio and sentence timestamps whose
        start/end offsets are cumulative across the whole text.
    """
    if not text or not text.strip():
        raise ValueError("Text must not be empty.")

    normalized = _normalize_text(text)
    chunks = split_into_chunks(normalized, max_chars=max_chars)

    if len(chunks) == 1:
        return await generate_audio(normalized, voice=voice, speed=speed)

    logger.info(
        "Chunked TTS: %d chunks for %d chars (voice=%s speed=%.1f)",
        len(chunks), len(normalized), voice, speed,
    )
    results = await asyncio.gather(
        *(generate_audio(c["text"], voice=voice, speed=speed) for c in chunks)
    )
    return _merge_chunk_results(list(results))


def _resolve_ffmpeg() -> str | None:
    """
    Locate an ffmpeg binary.

    Order: FFMPEG_PATH env override → the static binary bundled in the
    imageio-ffmpeg wheel (covers serverless runtimes like Vercel, which
    ship no system ffmpeg) → whatever is on PATH (Docker/local dev).
    Returns None when nothing is available; callers fall back to a
    pure-Python MP3 byte-concatenation.
    """
    override = os.environ.get("FFMPEG_PATH")
    if override and os.path.exists(override):
        return override
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    return shutil.which("ffmpeg")


def _concat_mp3_bytes(chunk_bytes: list[bytes]) -> bytes:
    """
    Merge per-chunk MP3 audio into one buffer.

    Uses ffmpeg's concat demuxer (lossless, no re-encoding) when a binary
    is available. Without one — e.g. a bare Vercel Python function — falls
    back to byte concatenation: MP3 frames are self-contained, so browsers
    decode the joined stream fine, and sentence timestamps are already
    cumulative across chunks.
    """
    if len(chunk_bytes) == 1:
        return chunk_bytes[0]

    ffmpeg_exe = _resolve_ffmpeg()
    if not ffmpeg_exe:
        logger.warning(
            "ffmpeg not found (set FFMPEG_PATH or install imageio-ffmpeg) — "
            "concatenating MP3 bytes directly",
        )
        return b"".join(chunk_bytes)

    audio_files: list[str] = []
    concat_list_name = ""
    output_name = ""
    try:
        for data in chunk_bytes:
            tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
            tmp.write(data)
            tmp.close()
            audio_files.append(tmp.name)

        concat_list = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
        for f in audio_files:
            concat_list.write(f"file '{f}'\n")
        concat_list.close()
        concat_list_name = concat_list.name

        output_file = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        output_file.close()
        output_name = output_file.name

        subprocess.run(
            [
                ffmpeg_exe, "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_list_name,
                "-c", "copy",
                output_name,
            ],
            check=True,
            capture_output=True,
        )

        with open(output_name, "rb") as f:
            return f.read()
    finally:
        for f in audio_files:
            try:
                os.unlink(f)
            except OSError:
                pass
        for name in (concat_list_name, output_name):
            if name:
                try:
                    os.unlink(name)
                except OSError:
                    pass


def _merge_chunk_results(results: list[TTSResult]) -> TTSResult:
    """
    Stitch chunk sentence timestamps with cumulative offsets and concatenate
    the chunk audio (ffmpeg when available, byte-join otherwise).
    """
    if len(results) == 1:
        return results[0]

    all_sentences: list[SentenceTimestamp] = []
    cumulative_ms = 0
    for result in results:
        for s in result.sentences:
            all_sentences.append(
                SentenceTimestamp(
                    text=s.text,
                    start_ms=s.start_ms + cumulative_ms,
                    end_ms=s.end_ms + cumulative_ms,
                )
            )
        if result.sentences:
            cumulative_ms += result.sentences[-1].end_ms

    merged_audio = _concat_mp3_bytes([r.audio_bytes for r in results])
    return TTSResult(audio_bytes=merged_audio, sentences=all_sentences)
