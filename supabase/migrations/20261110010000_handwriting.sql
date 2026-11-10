-- Handwriting (yezun.de/handwriting): a user's captured glyphs and settings, synced across devices.
-- Unlike the xox tables, clients write these directly (no game logic to protect): RLS allows each REGISTERED user
-- exactly their own rows. Guests (anonymous) get nothing, so their data cannot pile up on the server; their glyphs
-- stay local until they register. purge_stale_guests / account deletion remove rows via ON DELETE CASCADE.

create table public.handwriting_glyphs (
  user_id uuid not null references auth.users (id) on delete cascade,
  char text not null check (char_length(char) between 1 and 8),
  variant smallint not null check (variant between 0 and 9),
  strokes jsonb not null check (jsonb_typeof(strokes) = 'array' and pg_column_size(strokes) <= 65536),
  -- glyph space: 1.0 = one ruled-line pitch (see the handwriting repo's src/types.ts); rejects NaN/Infinity too
  advance real not null check (advance >= 0 and advance <= 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, char, variant)
);

create table public.handwriting_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 16384),
  updated_at timestamptz not null default now()
);

alter table public.handwriting_glyphs enable row level security;
alter table public.handwriting_settings enable row level security;

-- Default privileges are revoked (security_hardening): grant exactly what clients need, nothing to anon.
revoke all on public.handwriting_glyphs, public.handwriting_settings from public, anon, authenticated;
grant select, insert, update, delete on public.handwriting_glyphs, public.handwriting_settings to authenticated;
grant all on public.handwriting_glyphs, public.handwriting_settings to service_role;

-- Own rows only, registered users only (anonymous sign-ins carry is_anonymous = true in the JWT).
create policy handwriting_glyphs_own on public.handwriting_glyphs
  for all to authenticated
  using (user_id = (select auth.uid()) and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  with check (user_id = (select auth.uid()) and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

create policy handwriting_settings_own on public.handwriting_settings
  for all to authenticated
  using (user_id = (select auth.uid()) and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  with check (user_id = (select auth.uid()) and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

-- updated_at is server time on every write (sync compares it; a client clock must not decide).
create function public.handwriting_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.handwriting_touch_updated_at() from public, anon, authenticated;

create trigger handwriting_glyphs_touch before insert or update on public.handwriting_glyphs
  for each row execute function public.handwriting_touch_updated_at();
create trigger handwriting_settings_touch before insert or update on public.handwriting_settings
  for each row execute function public.handwriting_touch_updated_at();
