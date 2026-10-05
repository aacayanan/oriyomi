// Shared types for Supabase-backed features.

/** A saved fold session ("Origami") — chapter text + analyzed sections + prefs. */
export interface Origami {
  id: string;
  user_id: string;
  title: string;
  text: string;
  /** Serialized Section[] from /api/analyze */
  sections: unknown[];
  voice: string | null;
  speed: number;
  created_at: string;
  updated_at: string;
}

/** Shape sent when saving a new Origami. */
export interface OrigamiInsert {
  title: string;
  text: string;
  sections: unknown[];
  voice?: string | null;
  speed?: number;
}

/** Global stats row. */
export interface Stats {
  words_folded: number;
}
