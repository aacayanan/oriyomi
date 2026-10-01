"""
Document structure detection for plain text.

Detects chapters, sections, and subsections using tiered regex patterns
and heuristics. Returns a DocumentStructure tree that the frontend uses
to offer section-level TTS generation.
"""

import re
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Section:
    """A detected section/chapter in the document."""
    title: str
    level: int                      # 1=chapter, 2=section, 3=subsection
    section_type: str               # "chapter", "section", "part", "prologue", etc.
    number: str | None              # "3", "II", "2.1", "Two", or None
    char_start: int                 # Start offset in original text (inclusive)
    char_end: int                   # End offset in original text (exclusive)
    text: str                       # The actual text content of this section
    text_preview: str               # First 200 chars (for TOC display)
    children: list["Section"] = field(default_factory=list)


@dataclass
class DocumentStructure:
    """Complete detected structure of a document."""
    sections: list[Section]
    doc_type: str                   # "flat", "chapters", "sections", "hierarchical"
    total_chars: int
    detection_method: str           # "regex_tier1", "regex_tier2", "heuristic", "none"

    @property
    def has_structure(self) -> bool:
        return len(self.sections) > 0 and self.doc_type != "flat"


# ---------------------------------------------------------------------------
# Detection patterns
# ---------------------------------------------------------------------------

# Tier 1 — High confidence (chapter-level)
_TIER1_PATTERNS: list[tuple[str, str, int]] = [
    # (regex, section_type, level)
    (
        r'^(?:chapter|chap\.?|ch\.?)\s+(?:\d+|[IVXLCDM]+|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve))\b',
        "chapter", 1,
    ),
    (
        r'^(?:part|book)\s+(?:\d+|[IVXLCDM]+|(?:one|two|three|four|five))\b',
        "part", 1,
    ),
    (
        r'^(?:prologue|epilogue|introduction|conclusion|preface|foreword|afterword|appendix)\b',
        "front_matter", 1,
    ),
    (
        r'^[IVXLCDM]+\.\s',
        "chapter", 1,
    ),
]

# Tier 2 — Medium confidence (section-level)
_TIER2_PATTERNS: list[tuple[str, str, int]] = [
    (
        r'^(?:section)\s+\d+(?:\.\d+)*\b',
        "section", 2,
    ),
    (
        r'^\d+\.\d+\.\d+(?:\.\d+)*\s+\S',
        "subsection", 3,
    ),
    (
        r'^\d+\.\d+\s+\S',
        "section", 2,
    ),
    (
        r'^\d+\.\s+\S',
        "section", 2,
    ),
    (
        r'^(?:annex|appendix)\s+[A-Z0-9]+',
        "appendix", 1,
    ),
]

# Tier 3 — Heuristic patterns
_TIER3_PATTERNS: list[tuple[str, str, int]] = [
    # Markdown headings
    (r'^#{1,3}\s+.+', "markdown", 1),
    # ALL CAPS lines (5+ chars, mostly letters)
    (r'^[A-Z][A-Z\s:;,.\-]{4,}$', "heading", 1),
]

# False positive filters: lines that end with periods are body text
_BODY_TEXT_RE = re.compile(r'[.!?]\s*$')
# Lines > 100 chars are body text
_BODY_LENGTH = 100
# ALL CAPS lines < 5 chars are likely abbreviations
_ABBREV_MIN_LEN = 5
# TOC threshold: >5 headings within 2000 chars with <200 chars between them
_TOC_MIN_HEADINGS = 5
_TOC_WINDOW = 2000
_TOC_MIN_GAP = 200


def _extract_number(match_text: str) -> str | None:
    """Extract a section number from the matched heading text."""
    # Try to grab a number after the keyword
    m = re.search(r'(?:chapter|chap\.?|ch\.?|part|section)\s+(\d+|[IVXLCDM]+)', match_text, re.IGNORECASE)
    if m:
        return m.group(1)
    # Try "2.1" style numbers
    m = re.match(r'^(\d+\.\d+(?:\.\d+)*)', match_text)
    if m:
        return m.group(1)
    # Try single digit at start
    m = re.match(r'^(\d+)\.', match_text)
    if m:
        return m.group(1)
    return None


def _is_body_text(line: str) -> bool:
    """Return True if the line is likely body text, not a heading."""
    stripped = line.strip()
    if not stripped:
        return True
    if len(stripped) > _BODY_LENGTH:
        return True
    if _BODY_TEXT_RE.search(stripped):
        return True
    if stripped.isdigit():
        return True
    # ALL CAPS but too short (abbreviation)
    if stripped.isupper() and len(stripped) < _ABBREV_MIN_LEN:
        return True
    return False


def _find_headings(text: str, patterns: list[tuple[str, str, int]]) -> list[dict]:
    """
    Scan text line-by-line for headings matching the given patterns.
    Returns a list of {title, section_type, level, char_start, line_end}.
    """
    headings = []
    lines = text.split("\n")
    char_offset = 0

    for line in lines:
        line_start = char_offset
        line_end = char_offset + len(line) + 1  # +1 for newline

        stripped = line.strip()
        if stripped and not _is_body_text(stripped):
            for pattern, section_type, level in patterns:
                if re.match(pattern, stripped, re.IGNORECASE | re.MULTILINE):
                    headings.append({
                        "title": stripped,
                        "section_type": section_type,
                        "level": level,
                        "char_start": line_start,
                        "char_end": line_end,
                    })
                    break  # First matching pattern wins

        char_offset = line_end

    return headings


def _filter_toc(headings: list[dict]) -> list[dict]:
    """
    Remove table-of-contents entries: >N headings within a window
    with <M chars of body text between them.
    """
    if len(headings) <= _TOC_MIN_HEADINGS:
        return headings

    # Check if headings cluster in the first part of the document
    toc_end = headings[_TOC_MIN_HEADINGS]["char_start"]
    if toc_end <= _TOC_WINDOW:
        # Count body text between first few headings
        gaps = []
        for i in range(1, min(_TOC_MIN_HEADINGS + 1, len(headings))):
            gap = headings[i]["char_start"] - headings[i - 1]["char_end"]
            gaps.append(gap)

        # If average gap is very small, it's likely a TOC
        if gaps and sum(gaps) / len(gaps) < _TOC_MIN_GAP:
            # Skip TOC region: filter headings that fall within the TOC window
            # with small gaps, keep the rest
            filtered = []
            in_toc = False
            toc_start = headings[0]["char_start"]
            for i, h in enumerate(headings):
                if i > 0:
                    gap = h["char_start"] - headings[i - 1]["char_end"]
                    if gap < _TOC_MIN_GAP and h["char_start"] - toc_start <= _TOC_WINDOW:
                        in_toc = True
                    else:
                        in_toc = False
                        toc_start = h["char_start"]
                if not in_toc:
                    filtered.append(h)
            return filtered if filtered else headings[:1]

    return headings


def _build_sections(
    headings: list[dict],
    text: str,
) -> list[Section]:
    """Build Section objects from detected headings, splitting text at boundaries."""
    sections = []

    for i, h in enumerate(headings):
        char_start = h["char_start"]
        char_end = headings[i + 1]["char_start"] if i + 1 < len(headings) else len(text)

        # Extract the section body (skip the heading line itself)
        body_start = h["char_end"]
        body_text = text[body_start:char_end].strip()

        # Build title with number if available
        title = h["title"]
        number = _extract_number(title)

        sections.append(Section(
            title=title,
            level=h["level"],
            section_type=h["section_type"],
            number=number,
            char_start=char_start,
            char_end=char_end,
            text=body_text,
            text_preview=body_text[:200] if body_text else "",
        ))

    return sections


def _make_flat_section(text: str) -> Section:
    """Create a single section containing the entire text."""
    preview = text[:200] if text else ""
    return Section(
        title="Full Text",
        level=1,
        section_type="full",
        number=None,
        char_start=0,
        char_end=len(text),
        text=text,
        text_preview=preview,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_text_structure(text: str) -> DocumentStructure:
    """
    Detect document structure in plain text.

    Tries tiered detection:
    1. Chapter-level patterns (Chapter 1, Part I, Prologue, etc.)
    2. Section-level patterns (Section 2.1, 3.2 Title, etc.)
    3. Heuristic patterns (ALL CAPS, markdown headings)

    If no structure is detected, returns doc_type="flat" with the full text.
    """
    total_chars = len(text)

    if not text or not text.strip():
        return DocumentStructure(
            sections=[_make_flat_section(text)],
            doc_type="flat",
            total_chars=total_chars,
            detection_method="none",
        )

    # --- Tier 1: Chapter-level patterns ---
    tier1_headings = _find_headings(text, _TIER1_PATTERNS)
    tier1_headings = _filter_toc(tier1_headings)

    if len(tier1_headings) >= 2:
        sections = _build_sections(tier1_headings, text)
        # Check if Tier 2 also found subsections for hierarchical mode
        tier2_headings = _find_headings(text, _TIER2_PATTERNS)
        has_subsections = any(h["level"] >= 2 for h in tier2_headings)

        return DocumentStructure(
            sections=sections,
            doc_type="hierarchical" if has_subsections else "chapters",
            total_chars=total_chars,
            detection_method="regex_tier1",
        )

    # --- Tier 2: Section-level patterns ---
    tier2_headings = _find_headings(text, _TIER2_PATTERNS)
    tier2_headings = _filter_toc(tier2_headings)

    if len(tier2_headings) >= 2:
        sections = _build_sections(tier2_headings, text)
        return DocumentStructure(
            sections=sections,
            doc_type="sections",
            total_chars=total_chars,
            detection_method="regex_tier2",
        )

    # --- Tier 3: Heuristic patterns ---
    tier3_headings = _find_headings(text, _TIER3_PATTERNS)
    tier3_headings = _filter_toc(tier3_headings)

    if len(tier3_headings) >= 2:
        sections = _build_sections(tier3_headings, text)
        return DocumentStructure(
            sections=sections,
            doc_type="sections",
            total_chars=total_chars,
            detection_method="heuristic",
        )

    # --- Fallback: flat document ---
    return DocumentStructure(
        sections=[_make_flat_section(text)],
        doc_type="flat",
        total_chars=total_chars,
        detection_method="none",
    )
