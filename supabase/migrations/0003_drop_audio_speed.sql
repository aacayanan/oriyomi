-- Origamis no longer persist audio or speed.
-- Loading an origami pastes its text and regenerates TTS on demand.

alter table public.origamis
  drop column if exists fold_audio;

alter table public.origamis
  drop column if exists speed;
