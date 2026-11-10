// POST { token, password } -> { status: 'reset', username } | error invalid_token | weak_password
// No login needed (verify_jwt = false). The token (from the reset mail) is single use and valid 1 h, and only while
// the recovery address it was sent to is still the user's verified one. Sets the new password via the admin API,
// then ends ALL sessions of the user (auth.sessions deleted → refresh tokens die; access tokens already issued
// expire within jwt_expiry = 1 h). The username is returned so the page can sign in with the new password.
import { TOKEN_RE, usernameFromEmail, validPassword } from '../_shared/konto.ts';
import { check, HttpError, servePublic } from '../_server/http.ts';
import { INVALID_TOKEN, sha256Hex } from '../_server/konto.ts';

const WEAK = () => new HttpError(400, 'weak_password', 'Das Passwort muss 8 bis 72 Zeichen lang sein.');

servePublic(async ({ body, db }) => {
  const { token, password } = body;
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw INVALID_TOKEN();
  if (!validPassword(password)) throw WEAK();

  const hash = await sha256Hex(token);
  const userId = check(await db.rpc('konto_consume_reset_token', { p_token_hash: hash })) as string | null;
  if (!userId) throw INVALID_TOKEN();

  const { data, error } = await db.auth.admin.updateUserById(userId, { password });
  if (error || !data.user) {
    // keep the link usable: the password change itself did not happen
    await db.rpc('konto_release_reset_token', { p_token_hash: hash });
    if (error?.status === 422 || error?.code === 'weak_password') throw WEAK();
    throw error ?? new Error('updateUserById returned no user');
  }

  check(await db.rpc('konto_revoke_sessions', { p_user_id: userId }));
  return { status: 'reset', username: usernameFromEmail(data.user.email) };
});
