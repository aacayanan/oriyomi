-- Origamis persist audio and speed again: loading a saved origami
-- hydrates the reader directly with no TTS reprocessing.
-- Idempotent — safe whether or not 0003 was applied.

alter table public.origamis
  add column if not exists fold_audio jsonb not null default '[]'::jsonb;

alter table public.origamis
  add column if not exists speed numeric not null default 1.0;
