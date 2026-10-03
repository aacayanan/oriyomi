"""Extractive fold summaries via sumy's Luhn summarizer.

Kept deliberately lightweight for deployment: sumy is pure Python (no model
weights), and a regex tokenizer stands in for NLTK's punkt data so the Docker
image never needs a corpus download. Any failure falls back to packing
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

# Sidebar description budget — long enough for 2–3 sentences, short enough to scan
_MAX_CHARS = 320

# How many sentences the sidebar aims to show
_DEFAULT_SENTENCE_COUNT = 3

# Sentences shorter than this are weak standalone summary lines
_MIN_SENTENCE_CHARS = 35

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


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT.split(text) if s.strip()]


def _truncate_to_budget(text: str, limit: int = _MAX_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def _pack_sentences(candidates: list[str], count: int, budget: int) -> list[str]:
    """Greedily keep whole sentences until `count` or `budget` is hit.

    An opener longer than the budget is hard-truncated to ~half the budget so
    a second sentence can still fit — otherwise one dense textbook sentence
    swallows the whole sidebar and the summary looks like a single line.
    """
    picked: list[str] = []
    used = 0
    for raw in candidates:
        s = raw.strip()
        if not s:
            continue
        if not picked and len(s) > budget:
            head_budget = max(80, int(budget * 0.55))
            head = _truncate_to_budget(s, head_budget)
            picked.append(head)
            used = len(head)
            continue
        cost = len(s) + (1 if picked else 0)  # +1 for joining space
        if picked and used + cost > budget:
            continue
        picked.append(s)
        used += cost
        if len(picked) >= count:
            break
    return picked


def _top_up_with_body(picked: list[str], body_sentences: list[str], count: int, budget: int) -> list[str]:
    """If sumy only returned one line, fill with other body sentences that fit."""
    if len(picked) >= count or len(body_sentences) <= 1:
        return picked

    used = sum(len(s) for s in picked) + max(0, len(picked) - 1)
    existing = {p.lower() for p in picked}

    # Prefer mid-length content sentences over stubs and near-duplicates
    extras = [
        s
        for s in body_sentences
        if s.lower() not in existing and len(s) >= _MIN_SENTENCE_CHARS
    ]
    extras.sort(key=lambda s: abs(len(s) - 120))  # ~sidebar-friendly length

    for s in extras:
        if len(picked) >= count:
            break
        cost = len(s) + 1
        if used + cost > budget:
            continue
        picked.append(s)
        used += cost
    return picked


def summarize_fold(
    text: str,
    sentences_count: int = _DEFAULT_SENTENCE_COUNT,
) -> str:
    """Return an extractive summary of one fold — 2–3 whole sentences when possible."""
    cleaned = (text or "").strip()
    if not cleaned:
        return ""

    sentences = _split_sentences(cleaned)
    if len(sentences) <= sentences_count:
        return cleaned
    if len(cleaned) < 160:
        return " ".join(sentences[:sentences_count])

    candidates: list[str] = []
    if _HAS_SUMY:
        try:
            parser = PlaintextParser.from_string(cleaned, _RegexTokenizer())
            summarizer = LuhnSummarizer()  # default stemmer is identity
            summarizer.stop_words = _STOP_WORDS
            candidates = [str(s).strip() for s in summarizer(parser.document, sentences_count)]
            candidates = [c for c in candidates if c]
        except Exception:
            logger.exception("sumy summarization failed for %d-char fold", len(cleaned))
            candidates = []

    # Luhn can repeat near-identical lines — keep first occurrence only
    seen: set[str] = set()
    deduped: list[str] = []
    for c in candidates:
        key = c.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(c)
    candidates = deduped

    if not candidates:
        candidates = sentences[:sentences_count]

    picked = _pack_sentences(candidates, sentences_count, _MAX_CHARS)
    # Luhn often returns a single dense sentence — pull in body lines so the
    # sidebar shows a real 2–3 sentence summary, not one long opener.
    picked = _top_up_with_body(picked, sentences, sentences_count, _MAX_CHARS)

    if not picked:
        picked = _pack_sentences(sentences[:sentences_count], sentences_count, _MAX_CHARS)

    summary = " ".join(picked)
    return _truncate_to_budget(summary, _MAX_CHARS)
