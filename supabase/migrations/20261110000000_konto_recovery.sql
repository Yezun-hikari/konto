-- Konto: optional recovery email + password reset (yezun.de/konto).
--
-- auth.users keeps only the synthetic address (trigger enforce_synthetic_email stays). The real address lives in
-- konto_recovery_emails, which no client can read or write: everything goes through the Edge Functions
-- recovery-email-set / -remove / -verify and password-reset-request / -confirm (service_role) and the
-- security definer functions below. Tokens are stored only as sha256 (hex); the raw token exists only in the mail.

create table public.konto_recovery_emails (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  verified_at timestamptz, -- null = pending (confirmation link sent, not clicked yet)
  created_at timestamptz not null default now()
);

create table public.konto_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('verify_email', 'reset_password')),
  email text not null, -- address the link was sent to
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz -- set when consumed or superseded; a token works only while null
);
create index konto_tokens_user_kind on public.konto_tokens (user_id, kind, created_at);
create index konto_tokens_expires_at on public.konto_tokens (expires_at);

-- RLS on and no policies: invisible to anon/authenticated even if a grant slipped in later.
alter table public.konto_recovery_emails enable row level security;
alter table public.konto_tokens enable row level security;

revoke all on public.konto_recovery_emails, public.konto_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.konto_recovery_emails, public.konto_tokens to service_role;

-- Sets (or replaces) the caller's recovery address as pending, invalidates all their open tokens (a link to the
-- old address must not verify or reset anything any more) and stores the new verify_email token (24 h).
-- Rate limit: at most p_max_per_hour verify tokens per user and hour; when exceeded nothing changes and false is
-- returned. The password check happens in the Edge Function before.
create function public.konto_set_recovery_email(p_user_id uuid, p_email text, p_token_hash text, p_max_per_hour int)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('konto-token:verify_email:' || p_user_id::text));
  if (select count(*) from public.konto_tokens
       where user_id = p_user_id and kind = 'verify_email'
         and created_at > clock_timestamp() - interval '1 hour') >= p_max_per_hour then
    return false;
  end if;
  insert into public.konto_recovery_emails (user_id, email, verified_at, created_at)
  values (p_user_id, p_email, null, now())
  on conflict (user_id) do update set email = excluded.email, verified_at = null, created_at = excluded.created_at;
  update public.konto_tokens set used_at = clock_timestamp() where user_id = p_user_id and used_at is null;
  insert into public.konto_tokens (token_hash, user_id, kind, email, created_at, expires_at)
  values (p_token_hash, p_user_id, 'verify_email', p_email, clock_timestamp(), clock_timestamp() + interval '24 hours');
  return true;
end $$;

-- Removes the recovery address and invalidates all open tokens.
create function public.konto_remove_recovery_email(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.konto_recovery_emails where user_id = p_user_id;
  update public.konto_tokens set used_at = now() where user_id = p_user_id and used_at is null;
end $$;

-- Rate-limited token issue (password-reset-request): at most p_max_per_hour tokens of this kind per user and hour
-- (counted from konto_tokens, including used/superseded ones). Older open tokens of the same kind are superseded, so only the
-- newest link works. The lock makes the check race-free. Returns false when rate limited (nothing stored).
create function public.konto_issue_token(
  p_user_id uuid, p_kind text, p_email text, p_token_hash text, p_ttl interval, p_max_per_hour int
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('konto-token:' || p_kind || ':' || p_user_id::text));
  if (select count(*) from public.konto_tokens
       where user_id = p_user_id and kind = p_kind
         and created_at > clock_timestamp() - interval '1 hour') >= p_max_per_hour then
    return false;
  end if;
  update public.konto_tokens set used_at = clock_timestamp()
   where user_id = p_user_id and kind = p_kind and used_at is null;
  insert into public.konto_tokens (token_hash, user_id, kind, email, created_at, expires_at)
  values (p_token_hash, p_user_id, p_kind, p_email, clock_timestamp(), clock_timestamp() + p_ttl);
  return true;
end $$;

-- Consumes a verify_email token and marks the address verified. Only works if the address is still the one the
-- link was sent to. Returns false for unknown, used, expired or stale tokens.
create function public.konto_verify_recovery_email(p_token_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  t public.konto_tokens;
begin
  update public.konto_tokens set used_at = now()
   where token_hash = p_token_hash and kind = 'verify_email' and used_at is null and expires_at > now()
  returning * into t;
  if t.token_hash is null then
    return false;
  end if;
  update public.konto_recovery_emails set verified_at = now()
   where user_id = t.user_id and email = t.email;
  return found;
end $$;

-- Who gets a reset mail for this username: a registered (non-anonymous) user with a VERIFIED recovery address.
-- No row otherwise. Username → synthetic address as in the SDK.
create function public.konto_reset_target(p_username text)
returns table (user_id uuid, email text)
language sql stable security definer set search_path = '' as $$
  select u.id, r.email
    from auth.users u
    join public.konto_recovery_emails r on r.user_id = u.id
   where u.email = p_username || '@users.yezun-games.invalid'
     and not u.is_anonymous
     and r.verified_at is not null;
$$;

-- Consumes a reset_password token. Returns the user id, or null for unknown, used, expired or stale tokens
-- (stale = the recovery address changed or lost its verification since the mail was sent).
create function public.konto_consume_reset_token(p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t public.konto_tokens;
begin
  update public.konto_tokens set used_at = now()
   where token_hash = p_token_hash and kind = 'reset_password' and used_at is null and expires_at > now()
  returning * into t;
  if t.token_hash is null then
    return null;
  end if;
  if not exists (select 1 from public.konto_recovery_emails r
                  where r.user_id = t.user_id and r.email = t.email and r.verified_at is not null) then
    return null;
  end if;
  return t.user_id;
end $$;

-- Undo for konto_consume_reset_token when the password update itself failed afterwards (token stays usable).
create function public.konto_release_reset_token(p_token_hash text) returns void
language sql security definer set search_path = '' as $$
  update public.konto_tokens set used_at = null
   where token_hash = p_token_hash and kind = 'reset_password' and expires_at > now();
$$;

-- After a password reset: end every session of the user (all devices). Deleting auth.sessions cascades to
-- auth.refresh_tokens, which is what GoTrue's own global logout does. Already issued access tokens stay valid
-- until they expire (jwt_expiry, 1 h). Returns the number of ended sessions.
create function public.konto_revoke_sessions(p_user_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- For the SDK (getRecoveryEmailStatus): the caller's own address, masked ("ma***@example.com"), and whether it is
-- verified. No row = no recovery address. The only client-callable function of this migration.
create function public.konto_recovery_email_status()
returns table (email text, verified boolean)
language sql stable security definer set search_path = '' as $$
  select left(split_part(r.email, '@', 1), least(2, greatest(char_length(split_part(r.email, '@', 1)) - 1, 1)))
           || '***@' || split_part(r.email, '@', 2),
         r.verified_at is not null
    from public.konto_recovery_emails r
   where r.user_id = (select auth.uid());
$$;

revoke execute on function public.konto_set_recovery_email(uuid, text, text, int) from public, anon, authenticated;
revoke execute on function public.konto_remove_recovery_email(uuid) from public, anon, authenticated;
revoke execute on function public.konto_issue_token(uuid, text, text, text, interval, int) from public, anon, authenticated;
revoke execute on function public.konto_verify_recovery_email(text) from public, anon, authenticated;
revoke execute on function public.konto_reset_target(text) from public, anon, authenticated;
revoke execute on function public.konto_consume_reset_token(text) from public, anon, authenticated;
revoke execute on function public.konto_release_reset_token(text) from public, anon, authenticated;
revoke execute on function public.konto_revoke_sessions(uuid) from public, anon, authenticated;
revoke execute on function public.konto_recovery_email_status() from public, anon;

grant execute on function public.konto_set_recovery_email(uuid, text, text, int) to service_role;
grant execute on function public.konto_remove_recovery_email(uuid) to service_role;
grant execute on function public.konto_issue_token(uuid, text, text, text, interval, int) to service_role;
grant execute on function public.konto_verify_recovery_email(text) to service_role;
grant execute on function public.konto_reset_target(text) to service_role;
grant execute on function public.konto_consume_reset_token(text) to service_role;
grant execute on function public.konto_release_reset_token(text) to service_role;
grant execute on function public.konto_revoke_sessions(uuid) to service_role;
grant execute on function public.konto_recovery_email_status() to authenticated;

-- Retention: expired tokens are deleted hourly (the rate limit only looks at the last hour, every token lives at
-- least 1 h, so nothing the limit needs is lost). pg_cron ships with hosted Supabase and the local image. If it is
-- missing, skip scheduling instead of failing: then enable pg_cron (Dashboard → Database → Extensions) and re-run
-- the block below in the SQL editor.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('purge-expired-konto-tokens', '41 * * * *',
      'delete from public.konto_tokens where expires_at < now()');
  else
    raise notice 'pg_cron not available: purge-expired-konto-tokens not scheduled';
  end if;
end $$;
