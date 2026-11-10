-- Konto: stricter limits for confirmation mails (recovery-email-set) and a safer token release.

-- Log of sent confirmation mails, independent of users and tokens: deleting the account (cascade on konto_tokens)
-- must not reset the per-recipient limit. Only a sha256 of the lower-cased address is stored. Purged after 2 days.
create table public.konto_mail_log (
  recipient_hash text not null check (recipient_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index konto_mail_log_recipient on public.konto_mail_log (recipient_hash, created_at);
create index konto_mail_log_created on public.konto_mail_log (created_at);
alter table public.konto_mail_log enable row level security;
revoke all on public.konto_mail_log from public, anon, authenticated;
grant select, insert, delete on public.konto_mail_log to service_role;

-- Same as before (see 20261110000000_konto_recovery.sql), plus: at most 3 confirmation mails per recipient address
-- and day (across all users) and at most 200 per day in total. Returns false (nothing changed) when any limit is hit.
-- Locks: per user first, then the global one (always this order, so no deadlocks).
create or replace function public.konto_set_recovery_email(p_user_id uuid, p_email text, p_token_hash text, p_max_per_hour int)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := encode(sha256(convert_to(lower(p_email), 'UTF8')), 'hex');
begin
  perform pg_advisory_xact_lock(hashtext('konto-token:verify_email:' || p_user_id::text));
  perform pg_advisory_xact_lock(hashtext('konto-mail-log'));
  if (select count(*) from public.konto_tokens
       where user_id = p_user_id and kind = 'verify_email'
         and created_at > clock_timestamp() - interval '1 hour') >= p_max_per_hour then
    return false;
  end if;
  if (select count(*) from public.konto_mail_log
       where recipient_hash = v_hash and created_at > clock_timestamp() - interval '1 day') >= 3 then
    return false;
  end if;
  if (select count(*) from public.konto_mail_log
       where created_at > clock_timestamp() - interval '1 day') >= 200 then
    return false;
  end if;
  insert into public.konto_mail_log (recipient_hash, created_at) values (v_hash, clock_timestamp());
  insert into public.konto_recovery_emails (user_id, email, verified_at, created_at)
  values (p_user_id, p_email, null, now())
  on conflict (user_id) do update set email = excluded.email, verified_at = null, created_at = excluded.created_at;
  update public.konto_tokens set used_at = clock_timestamp() where user_id = p_user_id and used_at is null;
  insert into public.konto_tokens (token_hash, user_id, kind, email, created_at, expires_at)
  values (p_token_hash, p_user_id, 'verify_email', p_email, clock_timestamp(), clock_timestamp() + interval '24 hours');
  return true;
end $$;

-- Undo for konto_consume_reset_token when the password update failed afterwards. Releases the token only if no
-- newer reset_password token of that user exists (otherwise an old link would come back to life after a newer
-- one was requested, and requesting a new link must always invalidate the old ones).
create or replace function public.konto_release_reset_token(p_token_hash text) returns void
language sql security definer set search_path = '' as $$
  update public.konto_tokens t set used_at = null
   where t.token_hash = p_token_hash and t.kind = 'reset_password' and t.expires_at > now()
     and not exists (select 1 from public.konto_tokens n
                      where n.user_id = t.user_id and n.kind = 'reset_password'
                        and n.token_hash <> t.token_hash and n.created_at >= t.created_at);
$$;

-- create or replace keeps the existing grants; repeated here for clarity.
revoke execute on function public.konto_set_recovery_email(uuid, text, text, int) from public, anon, authenticated;
revoke execute on function public.konto_release_reset_token(text) from public, anon, authenticated;
grant execute on function public.konto_set_recovery_email(uuid, text, text, int) to service_role;
grant execute on function public.konto_release_reset_token(text) to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('purge-konto-mail-log', '53 * * * *',
      $q$delete from public.konto_mail_log where created_at < now() - interval '2 days'$q$);
  else
    raise notice 'pg_cron not available: purge-konto-mail-log not scheduled';
  end if;
end $$;
