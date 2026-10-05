-- Oriyomi Supabase schema
-- Run this in the Supabase SQL editor or via `supabase db push`.

-- ─── Global stats counter ───────────────────────────────────────────

create table if not exists public.stats (
  id uuid primary key default gen_random_uuid(),
  words_folded bigint not null default 0
);

-- Seed a single row so increments always have a target.
insert into public.stats (words_folded) values (0) on conflict do nothing;

-- Atomic increment — called by the FastAPI backend after successful TTS.
create or replace function public.increment_words_folded(n bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count bigint;
begin
  update public.stats
  set words_folded = words_folded + n
  returning words_folded into new_count;
  return new_count;
end;
$$;

-- ─── Origami library ────────────────────────────────────────────────
-- An "Origami" is a saved fold session: the entire chapter text,
-- its analyzed sections, and the voice/speed prefs used to read it.
-- Audio is NOT stored — TTS regenerates on load.

create table if not exists public.origamis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Untitled',
  text text not null,
  sections jsonb not null default '[]'::jsonb,
  voice text,
  speed numeric not null default 1.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists origamis_user_id_idx
  on public.origamis (user_id, created_at desc);

-- ─── Row Level Security ─────────────────────────────────────────────

alter table public.stats enable row level security;
alter table public.origamis enable row level security;

-- Stats: readable by anyone, writable only via service role (backend).
create policy "Anyone can read stats"
  on public.stats for select
  using (true);

-- Origamis: each user sees and manages only their own.
create policy "Users can select own origamis"
  on public.origamis for select
  using (auth.uid() = user_id);

create policy "Users can insert own origamis"
  on public.origamis for insert
  with check (auth.uid() = user_id);

create policy "Users can update own origamis"
  on public.origamis for update
  using (auth.uid() = user_id);

create policy "Users can delete own origamis"
  on public.origamis for delete
  using (auth.uid() = user_id);
