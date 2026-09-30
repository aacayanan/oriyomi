"""
Text-to-Speech engine using Microsoft Edge's neural TTS voices (edge-tts).

Provides voice listing, audio generation with MP3 output, and sentence-level
timestamps using edge-tts's built-in SentenceBoundary events.
"""

import re
from dataclasses import dataclass

import edge_tts


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

    # Validate voice exists (cache this in production to avoid repeated calls)
    voices = await get_voices()
    voice_ids = {v.id for v in voices}
    if voice not in voice_ids:
        raise ValueError(
            f"Voice '{voice}' not found. Available voices: {sorted(voice_ids)[:10]}..."
        )

    # Collect audio chunks and sentence boundary events
    audio_chunks: list[bytes] = []
    sentence_boundaries: list[dict] = []

    communicate = edge_tts.Communicate(
        text,
        voice,
        rate=_speed_to_rate(speed),
        boundary="SentenceBoundary",
    )

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

    if not audio_bytes:
        raise RuntimeError("TTS engine returned no audio data.")

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
