// Shared types for Supabase-backed features.

/** Origamis expire 24 hours after creation. */
export const ORIGAMI_TTL_MS = 24 * 60 * 60 * 1000;

/** One fold's generated audio, persisted with the origami. */
export interface OrigamiFoldAudio {
  fold_index: number;
  title: string;
  audio_base64: string;
  sentences: { index: number; text: string; start_ms: number; end_ms: number }[];
  duration_ms: number;
}

/** A saved fold session ("Origami") — chapter text, sections, prefs, and audio. */
export interface Origami {
  id: string;
  user_id: string;
  title: string;
  text: string;
  /** Serialized Section[] from /api/analyze */
  sections: unknown[];
  voice: string | null;
  speed: number;
  /** Generated fold audio, persisted at save time. Omitted in list responses. */
  fold_audio?: OrigamiFoldAudio[];
  created_at: string;
  updated_at: string;
}

/** Milliseconds until this origami expires, or 0 if already expired. */
export function msUntilExpiry(o: Origami, now = Date.now()): number {
  const created = new Date(o.created_at).getTime();
  return Math.max(0, created + ORIGAMI_TTL_MS - now);
}

/** Shape sent when saving a new Origami. */
export interface OrigamiInsert {
  title: string;
  text: string;
  sections: unknown[];
  voice?: string | null;
  speed?: number;
  fold_audio?: OrigamiFoldAudio[];
}

/** Global stats row. */
export interface Stats {
  words_folded: number;
}
