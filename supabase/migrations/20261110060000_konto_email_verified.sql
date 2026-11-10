-- Konto: a registered account is usable only with a confirmed email (app_metadata.email_verified, see
-- 20261110050000_konto_usernames_google.sql for how the key is kept).

-- Same as before (20261110000000_konto_recovery.sql), plus: a successful confirmation marks the ACCOUNT verified
-- (app_metadata.email_verified = true, in the JWT after the next refreshSession). Done in the same transaction as
-- consuming the token, so a used link always means a verified account. Changing the recovery address later keeps
-- email_verified true (only the new address is pending).
create or replace function public.konto_verify_recovery_email(p_token_hash text) returns boolean
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
  if not found then
    return false;
  end if;
  update auth.users u
     set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"email_verified": true}'::jsonb
   where u.id = t.user_id
     and (u.raw_app_meta_data -> 'email_verified') is distinct from 'true'::jsonb;
  return true;
end $$;
revoke execute on function public.konto_verify_recovery_email(text) from public, anon, authenticated;
grant execute on function public.konto_verify_recovery_email(text) to service_role;

-- Handwriting: own rows only, registered AND verified accounts only.
drop policy handwriting_glyphs_own on public.handwriting_glyphs;
drop policy handwriting_settings_own on public.handwriting_settings;

create policy handwriting_glyphs_own on public.handwriting_glyphs
  for all to authenticated
  using (user_id = (select auth.uid())
         and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
         and (((select auth.jwt()) -> 'app_metadata' ->> 'email_verified')::boolean) is true)
  with check (user_id = (select auth.uid())
         and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
         and (((select auth.jwt()) -> 'app_metadata' ->> 'email_verified')::boolean) is true);

create policy handwriting_settings_own on public.handwriting_settings
  for all to authenticated
  using (user_id = (select auth.uid())
         and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
         and (((select auth.jwt()) -> 'app_metadata' ->> 'email_verified')::boolean) is true)
  with check (user_id = (select auth.uid())
         and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
         and (((select auth.jwt()) -> 'app_metadata' ->> 'email_verified')::boolean) is true);
