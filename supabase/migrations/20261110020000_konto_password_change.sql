-- Konto: server-side password change (Edge Function password-change) and a per-user limit for failed password
-- checks (all functions that verify the current password: password-change, delete-account, recovery-email-*).

-- Failed password checks, one row per failure. No client access (RLS on, no policies, no grants). Rows are purged
-- after a day (the limit only looks at the last 15 minutes).
create table public.konto_password_failures (
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index konto_password_failures_user on public.konto_password_failures (user_id, created_at);
alter table public.konto_password_failures enable row level security;
revoke all on public.konto_password_failures from public, anon, authenticated;
grant select, insert, delete on public.konto_password_failures to service_role;

-- True while the user has fewer than p_max failed password checks in the last p_window. Called before the check.
create function public.konto_password_check_allowed(p_user_id uuid, p_max int, p_window interval) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) < p_max from public.konto_password_failures
   where user_id = p_user_id and created_at > clock_timestamp() - p_window;
$$;

-- Records one failed password check.
create function public.konto_note_password_failure(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.konto_password_failures (user_id, created_at) values (p_user_id, clock_timestamp());
$$;

-- After a password change: end every session of the user EXCEPT the caller's own (p_keep_session = the
-- `session_id` claim of the caller's JWT; null ends all). Deleting auth.sessions cascades to auth.refresh_tokens.
-- Access tokens already issued for the other sessions stay valid until they expire (jwt_expiry, 1 h).
-- Returns the number of ended sessions.
create function public.konto_revoke_other_sessions(p_user_id uuid, p_keep_session uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  delete from auth.sessions where user_id = p_user_id and id is distinct from p_keep_session;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.konto_password_check_allowed(uuid, int, interval) from public, anon, authenticated;
revoke execute on function public.konto_note_password_failure(uuid) from public, anon, authenticated;
revoke execute on function public.konto_revoke_other_sessions(uuid, uuid) from public, anon, authenticated;
grant execute on function public.konto_password_check_allowed(uuid, int, interval) to service_role;
grant execute on function public.konto_note_password_failure(uuid) to service_role;
grant execute on function public.konto_revoke_other_sessions(uuid, uuid) to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('purge-konto-password-failures', '47 * * * *',
      $q$delete from public.konto_password_failures where created_at < now() - interval '1 day'$q$);
  else
    raise notice 'pg_cron not available: purge-konto-password-failures not scheduled';
  end if;
end $$;
