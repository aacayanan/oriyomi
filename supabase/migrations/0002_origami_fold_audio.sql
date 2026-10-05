-- Store generated fold audio with each origami so replays skip TTS.
-- fold_audio is an array of FoldAudio-shaped objects:
--   [{ fold_index, title, audio_base64, sentences, duration_ms }, ...]

alter table public.origamis
  add column if not exists fold_audio jsonb not null default '[]'::jsonb;
