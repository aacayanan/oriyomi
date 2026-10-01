"""
Text chunking for parallel TTS generation.

Splits text at sentence boundaries and groups sentences into chunks
of approximately max_chars characters each. This ensures:
- No sentence straddles two chunks (preserves timestamp accuracy)
- Chunks are roughly equal size (balanced worker load)
- Sentence boundaries are reused from the TTS engine's regex
"""

import re

# Same regex as tts.py — ensures sentence boundaries match what edge-tts expects
_SENTENCE_RE = re.compile(
    r'(?<=[.!?])'
    r'(?:"|\'|\)|\])*'
    r'\s+'
    r'(?=[A-Z"\'\(\[])'
)


def split_into_chunks(text: str, max_chars: int = 2500) -> list[dict]:
    """
    Split text into chunks at sentence boundaries.

    Each chunk is approximately max_chars characters long. Sentences are
    never split across chunks — this preserves timestamp accuracy when
    chunks are processed in parallel and merged.

    Args:
        text: The full text to split.
        max_chars: Target maximum characters per chunk (default 2500,
            which produces ~30-60 seconds of audio per chunk).

    Returns:
        List of dicts: [{"chunk_index": 0, "text": "..."}, ...]

    Raises:
        ValueError: If text is empty or too short to split.
    """
    if not text or not text.strip():
        raise ValueError("Text must not be empty.")

    text = text.strip()

    # If text is short enough, return as a single chunk
    if len(text) <= max_chars:
        return [{"chunk_index": 0, "text": text}]

    # Split into sentences
    raw_sentences = _SENTENCE_RE.split(text)
    sentences = [s.strip() for s in raw_sentences if s.strip()]

    # Group sentences into chunks
    chunks: list[dict] = []
    current_chunk_sentences: list[str] = []
    current_chunk_len = 0

    for sentence in sentences:
        sentence_len = len(sentence) + 1  # +1 for the space separator

        # If adding this sentence would exceed max_chars and we already have content,
        # finalize the current chunk and start a new one
        if current_chunk_len + sentence_len > max_chars and current_chunk_sentences:
            chunks.append({
                "chunk_index": len(chunks),
                "text": " ".join(current_chunk_sentences),
            })
            current_chunk_sentences = []
            current_chunk_len = 0

        current_chunk_sentences.append(sentence)
        current_chunk_len += sentence_len

    # Don't forget the last chunk
    if current_chunk_sentences:
        chunks.append({
            "chunk_index": len(chunks),
            "text": " ".join(current_chunk_sentences),
        })

    return chunks