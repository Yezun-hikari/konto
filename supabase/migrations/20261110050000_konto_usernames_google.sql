-- Konto: one username table for every account (password and Google) and Google sign-in.
--
-- * public.konto_usernames holds the username of every registered account. Password accounts get it from their
--   synthetic address <name>@users.yezun-games.invalid (trigger below), Google accounts choose it once through the
--   Edge Function set-username (konto_set_username). No client access: RLS on, no policies, no grants.
-- * Every account carries its name in raw_app_meta_data.username, so it is in the JWT as app_metadata.username.
--   konto_usernames is the source of truth; the trigger keeps app_metadata in line with it.
-- * app_metadata.email_verified: a registered account is usable only once true. Password accounts start with false
--   and get true from recovery-email-verify (20261110060000), Google accounts get true right away, accounts that
--   existed before this migration get legacy = true and email_verified = true.
-- * enforce_synthetic_email now lets Google accounts keep the (real) address GoTrue takes from Google.
--
-- How GoTrue (supabase/auth, internal/api/external.go, identity.go, verify.go, models/user.go) touches auth.users
-- here, and why the triggers are built as they are:
-- * New Google user (signInWithOAuth): INSERT with email = Google address and
--   raw_app_meta_data = {"provider":"google","providers":["google"]}; the identity row is inserted afterwards.
-- * Guest links Google (linkIdentity): the google row in auth.identities is inserted FIRST, then
--   `UPDATE auth.users SET email = <Google address>` (only that column, raw_app_meta_data still says
--   provider "anonymous"), then is_anonymous = false, then providers are rewritten. So enforce_synthetic_email must
--   also look at auth.identities, not only at app metadata.
-- * GoTrue rewrites raw_app_meta_data from its in-memory copy (UpdateAppMetaDataProviders on every OAuth sign-in,
--   admin updates). That copy does not know the username a trigger put in, so the trigger also runs on
--   `update of raw_app_meta_data` and puts the username back from konto_usernames.
-- * Sign-ins, token refreshes and last_sign_in_at updates touch neither email nor raw_app_meta_data (UpdateOnly with
--   other columns): no trigger work there.
--
-- Trigger order (BEFORE triggers fire in name order): enforce_synthetic_email (validation) runs before
-- konto_account_meta (taken check + app_metadata). The konto_usernames row itself is written AFTER the row change
-- (konto_username_store): on INSERT the auth.users row does not exist yet in a BEFORE trigger, so the foreign key
-- would fail there.

create table public.konto_usernames (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
alter table public.konto_usernames enable row level security;
revoke all on public.konto_usernames from public, anon, authenticated;
grant select, insert, update, delete on public.konto_usernames to service_role;

-- Failed and successful set-username calls, for the per-user limit (enumeration of taken names). Purged after a day.
create table public.konto_username_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index konto_username_attempts_user on public.konto_username_attempts (user_id, created_at);
alter table public.konto_username_attempts enable row level security;
revoke all on public.konto_username_attempts from public, anon, authenticated;
grant select, insert, delete on public.konto_username_attempts to service_role;

-- Backfill (before the triggers exist): every synthetic address, including the bot ("bot" stays reserved).
-- auth.users.email is unique for these accounts, so the names are unique too.
insert into public.konto_usernames (user_id, username, created_at)
select u.id, split_part(u.email, '@', 1), coalesce(u.created_at, now())
  from auth.users u
 where u.email ~ '^[a-z0-9_]{3,20}@users\.yezun-games\.invalid$'
on conflict do nothing;

-- Existing password accounts are not locked out by the new "verified email" rule: legacy = true and
-- email_verified = true (the Konto page still asks them to add a recovery address).
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
         || jsonb_build_object('username', k.username, 'legacy', true, 'email_verified', true)
  from public.konto_usernames k
 where k.user_id = u.id;

-- Real addresses only for Google accounts. Google = app metadata says so (new Google user: provider "google") or
-- the user has a google identity (guest that just linked Google, see above). Additionally a synthetic address never
-- turns into a real one: that would end the password login by username. email_change (pending change) stays
-- synthetic-only for everyone; Google accounts never need one.
create or replace function public.enforce_synthetic_email() returns trigger
language plpgsql set search_path = '' as $$
declare
  synthetic constant text := '^[a-z0-9_]{3,20}@users\.yezun-games\.invalid$';
begin
  if new.email is not null and new.email !~ synthetic then
    if not (
      coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
      or new.raw_app_meta_data ->> 'provider' = 'google'
      or exists (select 1 from auth.identities i where i.user_id = new.id and i.provider = 'google')
    ) then
      raise exception 'only synthetic emails are allowed' using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE' and old.email ~ synthetic then
      raise exception 'only synthetic emails are allowed' using errcode = 'check_violation';
    end if;
  end if;
  if coalesce(new.email_change, '') <> '' and new.email_change !~ synthetic then
    raise exception 'only synthetic emails are allowed' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_synthetic_email() from public, anon, authenticated;

-- BEFORE INSERT OR UPDATE OF email, raw_app_meta_data, is_anonymous: keeps the account keys of app_metadata right.
-- * username: refuses a synthetic name that another account already owns (e.g. a Google account chose it) and
--   writes app_metadata.username. konto_usernames decides; without a row (guests, Google accounts before
--   set-username) the key is removed, so nobody can fake a name via app metadata.
-- * email_verified / legacy: GoTrue may write back an in-memory copy without them (see top), so on UPDATE a missing
--   key is carried over from the old row (an explicit value is kept). A registered Google account is always
--   verified (Google confirmed the address). A password account without the key starts unverified (false) until
--   recovery-email-verify sets true. Guests get neither key.
create function public.konto_account_meta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_synthetic boolean := coalesce(new.email ~ '^[a-z0-9_]{3,20}@users\.yezun-games\.invalid$', false);
begin
  if v_synthetic then
    v_name := split_part(new.email, '@', 1);
    if (tg_op = 'INSERT' or new.email is distinct from old.email)
       and exists (select 1 from public.konto_usernames k where k.username = v_name and k.user_id <> new.id) then
      raise exception 'username_taken';
    end if;
  else
    select k.username into v_name from public.konto_usernames k where k.user_id = new.id;
  end if;
  if v_name is not null then
    v_meta := v_meta || jsonb_build_object('username', v_name);
  else
    v_meta := v_meta - 'username';
  end if;

  if tg_op = 'UPDATE' and old.raw_app_meta_data is not null then
    if not v_meta ? 'email_verified' and old.raw_app_meta_data ? 'email_verified' then
      v_meta := v_meta || jsonb_build_object('email_verified', old.raw_app_meta_data -> 'email_verified');
    end if;
    if not v_meta ? 'legacy' and old.raw_app_meta_data ? 'legacy' then
      v_meta := v_meta || jsonb_build_object('legacy', old.raw_app_meta_data -> 'legacy');
    end if;
  end if;
  if not coalesce(new.is_anonymous, false) then
    if coalesce(v_meta -> 'providers', '[]'::jsonb) ? 'google'
       or v_meta ->> 'provider' = 'google'
       or exists (select 1 from auth.identities i where i.user_id = new.id and i.provider = 'google') then
      v_meta := v_meta || '{"email_verified": true}'::jsonb;
    elsif v_synthetic and not v_meta ? 'email_verified' then
      v_meta := v_meta || '{"email_verified": false}'::jsonb;
    end if;
  end if;

  if v_meta is distinct from coalesce(new.raw_app_meta_data, '{}'::jsonb) then
    new.raw_app_meta_data := v_meta;
  end if;
  return new;
end $$;
revoke execute on function public.konto_account_meta() from public, anon, authenticated;

-- AFTER INSERT OR UPDATE OF email: stores the name of a synthetic address (new account or rename). A concurrent
-- claim of the same name loses on the unique index and gets username_taken as well.
create function public.konto_username_store() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if new.email is null or new.email !~ '^[a-z0-9_]{3,20}@users\.yezun-games\.invalid$' then
    return null;
  end if;
  v_name := split_part(new.email, '@', 1);
  begin
    insert into public.konto_usernames (user_id, username) values (new.id, v_name)
    on conflict (user_id) do update set username = excluded.username
      where public.konto_usernames.username is distinct from excluded.username;
  exception when unique_violation then
    raise exception 'username_taken';
  end;
  return null;
end $$;
revoke execute on function public.konto_username_store() from public, anon, authenticated;

create trigger konto_account_meta before insert or update of email, raw_app_meta_data, is_anonymous on auth.users
  for each row execute function public.konto_account_meta();
create trigger konto_username_store after insert or update of email on auth.users
  for each row execute function public.konto_username_store();

-- Edge Function set-username: a registered account without a name (Google) claims one. One transaction: per-user
-- lock, limit of p_max calls per p_window, insert (unique name), app_metadata.username (the BEFORE trigger above
-- confirms it from konto_usernames). Returns 'ok' | 'taken' | 'already_set' | 'not_allowed' | 'rate_limited'.
create function public.konto_set_username(p_user_id uuid, p_username text, p_max int, p_window interval)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_anon boolean;
begin
  if p_username is null or p_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid username' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('konto-username:' || p_user_id::text));
  select u.is_anonymous into v_anon from auth.users u where u.id = p_user_id;
  if v_anon is null or v_anon then
    return 'not_allowed';
  end if;
  if exists (select 1 from public.konto_usernames k where k.user_id = p_user_id) then
    return 'already_set';
  end if;
  if (select count(*) from public.konto_username_attempts a
       where a.user_id = p_user_id and a.created_at > clock_timestamp() - p_window) >= p_max then
    return 'rate_limited';
  end if;
  insert into public.konto_username_attempts (user_id, created_at) values (p_user_id, clock_timestamp());
  begin
    insert into public.konto_usernames (user_id, username) values (p_user_id, p_username);
  exception when unique_violation then
    return 'taken';
  end;
  update auth.users u
     set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
           || jsonb_build_object('username', p_username, 'email_verified', true)
   where u.id = p_user_id;
  return 'ok';
end $$;
revoke execute on function public.konto_set_username(uuid, text, int, interval) from public, anon, authenticated;
grant execute on function public.konto_set_username(uuid, text, int, interval) to service_role;

-- purge_stale_guests needs no change: it selects by is_anonymous only. Google accounts are never anonymous, and a
-- guest that links Google gets is_anonymous = false from GoTrue in the same request.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('purge-konto-username-attempts', '29 * * * *',
      $q$delete from public.konto_username_attempts where created_at < now() - interval '1 day'$q$);
  else
    raise notice 'pg_cron not available: purge-konto-username-attempts not scheduled';
  end if;
end $$;
