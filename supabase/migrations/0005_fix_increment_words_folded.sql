-- Make the words-folded counter safe under pg-safeupdate.
--
-- This Supabase project loads pg-safeupdate, which rejects any UPDATE or
-- DELETE whose statement has no WHERE clause — including ones inside
-- plpgsql functions. The original increment_words_folded did an unfiltered
-- UPDATE on the single-row stats table, so every RPC call failed with
-- "UPDATE requires a WHERE clause" (SQLSTATE 21000) and the deployed
-- counter never left 0.
--
-- The WHERE clause below is required, not cosmetic. The stats table is a
-- single-row counter (seeded in 0001); we target that row explicitly and
-- recreate it if the seed row was ever deleted.

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
  where id = (select id from public.stats order by id limit 1)
  returning words_folded into new_count;

  -- Empty table (seed row deleted): recreate the counter row.
  if new_count is null then
    insert into public.stats (words_folded)
    values (n)
    returning words_folded into new_count;
  end if;

  return new_count;
end;
$$;

-- Same visibility the function had by default; stated explicitly so a
-- future ALTER DEFAULT PRIVILEGES change can't silently break the counter.
grant execute on function public.increment_words_folded(bigint)
  to anon, authenticated, service_role;
