"""Extractive fold summaries via sumy's Luhn summarizer.

Kept deliberately lightweight for deployment: sumy is pure Python (no model
weights), and a regex tokenizer stands in for NLTK's punkt data so the Docker
image never needs a corpus download. Any failure falls back to the fold's
opening sentences, so the sidebar always has a description.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

try:
    from sumy.parsers.plaintext import PlaintextParser
    from sumy.summarizers.luhn import LuhnSummarizer

    _HAS_SUMY = True
except ImportError:  # pragma: no cover - sumy ships in requirements.txt
    _HAS_SUMY = False

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_WORD = re.compile(r"[A-Za-z0-9']+")

# Sidebar description budget — long enough to orient, short enough to scan
_MAX_CHARS = 280

# Small English stop list — keeps Luhn's term-frequency scoring on content
# words instead of "the/of/and" repeats.
_STOP_WORDS = frozenset(
    """
    a about after all also an and any are as at be been but by can could did
    do does for from had has have he her him his how i if in into is it its
    just may me more most my no not of on or our out over she so than that
    the their them then there these they this to too up us very was we were
    what when where which while who whom why will with would you your
    """.split()
)


class _RegexTokenizer:
    """Duck-typed stand-in for sumy.Tokenizer — no NLTK data required."""

    def to_sentences(self, paragraph: str) -> tuple[str, ...]:
        return tuple(
            s.strip() for s in _SENTENCE_SPLIT.split(paragraph) if s.strip()
        )

    def to_words(self, sentence: str) -> tuple[str, ...]:
        return tuple(w.lower() for w in _WORD.findall(sentence))


def _clamp_sentences(text: str, count: int) -> str:
    """Keep at most `count` sentences — the sidebar budget, enforced."""
    parts = [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]
    return " ".join(parts[:count])


def summarize_fold(text: str, sentences_count: int = 2) -> str:
    """Return an extractive summary of one fold's text — at most `sentences_count` sentences."""
    cleaned = (text or "").strip()
    if not cleaned:
        return ""
    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(cleaned) if s.strip()]
    if len(sentences) <= sentences_count:
        return cleaned
    if len(cleaned) < 160:
        return " ".join(sentences[:sentences_count])

    if _HAS_SUMY:
        try:
            parser = PlaintextParser.from_string(cleaned, _RegexTokenizer())
            summarizer = LuhnSummarizer()  # default stemmer is identity
            summarizer.stop_words = _STOP_WORDS
            picked = [str(s) for s in summarizer(parser.document, sentences_count)]
            if picked:
                # sumy's sentence view can mis-tokenize (abbreviations etc.),
                # so re-clamp the rendered string to the sentence budget
                summary = _clamp_sentences(" ".join(picked), sentences_count)
                if len(summary) > _MAX_CHARS:
                    summary = (
                        summary[:_MAX_CHARS].rsplit(" ", 1)[0].rstrip(",;:") + "…"
                    )
                return summary
        except Exception:
            logger.exception("sumy summarization failed for %d-char fold", len(cleaned))

    return _clamp_sentences(cleaned, sentences_count)
