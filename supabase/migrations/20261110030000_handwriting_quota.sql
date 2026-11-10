-- Handwriting: tighter limits and a per-user quota, so a registered user cannot fill the database through the
-- direct table access (RLS lets clients write their own rows).
-- The app (handwriting repo, src/capture/charset.ts) uses 3 variants (0..2) and characters / ligatures of
-- 1..4 code points (parseLigatures); 90 base characters + at most 40 ligatures, 3 variants each = 390 rows max.
--
-- The new checks are NOT VALID: they apply to every new insert/update, existing rows are left untouched (a
-- migration must not fail on, or silently delete, data written under the old limits).

alter table public.handwriting_glyphs
  add constraint handwriting_glyphs_variant_max check (variant between 0 and 2) not valid,
  add constraint handwriting_glyphs_char_max check (char_length(char) between 1 and 4) not valid;

-- Quota: at most 500 glyph rows per user. The advisory lock (per user, held until commit) serialises concurrent
-- inserts of the same user, so parallel requests cannot all pass the count. An insert that hits an existing row
-- (upsert: INSERT ... ON CONFLICT DO UPDATE also fires BEFORE INSERT) is an update and always allowed.
create function public.handwriting_glyphs_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('handwriting-glyphs:' || new.user_id::text));
  if exists (select 1 from public.handwriting_glyphs
              where user_id = new.user_id and char = new.char and variant = new.variant) then
    return new;
  end if;
  if (select count(*) from public.handwriting_glyphs where user_id = new.user_id) >= 500 then
    raise exception 'Zu viele gespeicherte Zeichen (höchstens 500 pro Konto).'
      using errcode = 'check_violation', hint = 'handwriting_quota';
  end if;
  return new;
end $$;
revoke execute on function public.handwriting_glyphs_quota() from public, anon, authenticated;

create trigger handwriting_glyphs_quota before insert on public.handwriting_glyphs
  for each row execute function public.handwriting_glyphs_quota();
