// POST { token } -> { status: 'verified' } | error invalid_token
// No login needed (verify_jwt = false): the link may be opened on another device. The token (from the mail) is
// single use, valid 24 h, and only verifies the address it was sent to. On success the account is marked verified
// (app_metadata.email_verified = true, same transaction in konto_verify_recovery_email); the client then calls
// refreshSession() to get it into its JWT.
import { TOKEN_RE } from '../_shared/konto.ts';
import { check, servePublic } from '../_server/http.ts';
import { INVALID_TOKEN, sha256Hex } from '../_server/konto.ts';

servePublic(async ({ body, db }) => {
  const token = body.token;
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw INVALID_TOKEN();
  const ok = check(await db.rpc('konto_verify_recovery_email', { p_token_hash: await sha256Hex(token) })) as boolean;
  if (!ok) throw INVALID_TOKEN();
  return { status: 'verified' };
});
