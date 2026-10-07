import type { Section } from "@/components/ChapterSelector";

/**
 * Long-fold splitting for Vercel-safe TTS generation.
 *
 * POST /api/tts/fold is synchronous (edge-tts + ffmpeg in-request) and the
 * FastAPI function is capped at 300s on Vercel. Folds whose audio would run
 * past ~4 minutes blow that budget and die mid-request. Before sections enter
 * reader state, any section estimated longer than TARGET_FOLD_AUDIO_SECONDS is
 * split at sentence boundaries into continuation folds — "Title (cont.)",
 * "Title (cont. 2)", … — so every fold request stays under the cap.
 *
 * Expansion happens at section-creation time (not inside useDocumentTTS)
 * because fold_index is consumed as 1:1 with the sections arrays held in
 * TextReader / MobileReader / SaveOrigamiButton. Growing the sections list
 * itself keeps every consumer, and saved origamis, consistent.
 */

/** ~4 minutes — the deployed failure line; hard cap on any single fold. */
export const MAX_FOLD_AUDIO_SECONDS = 240;
/** Pack split parts to ~3.5 min — margin under the cap, since chars/15 is rough. */
const TARGET_FOLD_AUDIO_SECONDS = 210;
/**
 * Hard character cap per part. The backend chunks internally at 2500 chars
 * and merges multi-chunk audio with ffmpeg — staying under that keeps every
 * fold a single edge-tts request (no merge step): faster, and immune to
 * runtimes without ffmpeg. A single over-long sentence may still exceed it;
 * the backend's merge path handles that.
 */
const PART_MAX_CHARS = 2400;

/** Same sentence regex as tts_chunks.py / tts.py on the backend. */
const SENTENCE_SPLIT_RE = /(?<=[.!?])(?:"|'|\)|\])*\s+(?=[A-Z"'(\[])/;

/**
 * Estimated audio seconds for a text at a playback speed.
 * Matches the UI's chars/15 heuristic at 1.0× (TextReader / FoldList).
 */
export function estimateFoldAudioSeconds(text: string, speed: number): number {
  const safeSpeed = speed > 0 ? speed : 1;
  return text.length / (15 * safeSpeed);
}

/** Split text into sentences at the same boundaries edge-tts chunking uses. */
function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Greedy-pack sentences into parts each targeting ≤ TARGET_FOLD_AUDIO_SECONDS
 * estimated audio. Never splits mid-sentence: a single over-long sentence
 * becomes its own part. A tiny trailing remainder merges into the previous
 * part when the result stays under the hard cap.
 */
function packSentences(sentences: string[], speed: number): string[] {
  const parts: string[] = [];
  let current: string[] = [];
  let currentSeconds = 0;
  let currentChars = 0;
  const safeSpeed = speed > 0 ? speed : 1;
  // Whichever is tighter: the audio-duration target, or the single-request
  // char cap (see PART_MAX_CHARS).
  const charBudget = Math.min(
    PART_MAX_CHARS,
    Math.max(1, Math.round(TARGET_FOLD_AUDIO_SECONDS * 15 * safeSpeed)),
  );

  for (const sentence of sentences) {
    const sentenceSeconds = estimateFoldAudioSeconds(sentence, speed);
    const addedChars = sentence.length + (current.length > 0 ? 1 : 0);
    if (
      current.length > 0 &&
      (currentSeconds + sentenceSeconds > TARGET_FOLD_AUDIO_SECONDS ||
        currentChars + addedChars > charBudget)
    ) {
      parts.push(current.join(" "));
      current = [];
      currentSeconds = 0;
      currentChars = 0;
    }
    current.push(sentence);
    currentSeconds += sentenceSeconds;
    currentChars += sentence.length + (current.length > 1 ? 1 : 0);
  }
  if (current.length > 0) parts.push(current.join(" "));

  // Fold a tiny remainder back into the previous part when that stays legal.
  if (parts.length >= 2) {
    const prev = parts[parts.length - 2];
    const last = parts[parts.length - 1];
    if (
      estimateFoldAudioSeconds(`${prev} ${last}`, speed) <=
      MAX_FOLD_AUDIO_SECONDS
    ) {
      parts.splice(parts.length - 2, 2, `${prev} ${last}`);
    }
  }

  return parts;
}

/** "Title", "Title (cont.)", "Title (cont. 2)", … */
function continuationTitle(base: string, partIndex: number): string {
  if (partIndex === 0) return base;
  // Untitled sections keep part 1 empty (useDocumentTTS falls back to
  // "Fold NN" by index); continuations still need a visible marker.
  if (!base) return partIndex === 1 ? "(cont.)" : `(cont. ${partIndex})`;
  if (partIndex === 1) return `${base} (cont.)`;
  return `${base} (cont. ${partIndex})`;
}

/**
 * Expand sections whose estimated audio exceeds the fold cap into
 * continuation folds. Sections at or under the target pass through
 * unchanged (same object references — safe for memo comparisons).
 */
export function expandSectionsForTTS(
  sections: Section[],
  speed: number,
): Section[] {
  const out: Section[] = [];

  for (const section of sections) {
    const text = (section.text || "").trim();
    if (!text) {
      out.push(section);
      continue;
    }

    const parts =
      estimateFoldAudioSeconds(text, speed) <= TARGET_FOLD_AUDIO_SECONDS
        ? [text]
        : packSentences(splitSentences(text), speed);

    if (parts.length === 1) {
      out.push(section);
      continue;
    }

    // Subdivide the parent's char range across parts, proportionally to
    // split-text length. Last part takes the remainder so offsets stay
    // monotonic and end exactly at the parent's char_end (FoldList duration
    // chips and TextReader's time→fold detection rely on this).
    const totalChars = parts.reduce((n, p) => n + p.length, 0) || 1;
    const parentChars = Math.max(section.char_end - section.char_start, 1);
    let cursor = section.char_start;

    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      const share = Math.round((part.length / totalChars) * parentChars);
      const charStart = cursor;
      const charEnd = isLast ? section.char_end : cursor + share;
      cursor = charEnd;

      out.push({
        ...section,
        title: continuationTitle((section.title || "").trim(), i),
        text: part,
        text_preview: part.slice(0, 200),
        char_start: charStart,
        char_end: charEnd,
        // Split parts are independent folds; nested children would not match
        // the sliced text, so continuation parts carry none.
        children: [],
      });
    });
  }

  return out;
}
