// POST { password, newPassword } -> { status: 'changed', revokedSessions } | error not_registered | wrong_password |
// rate_limited | weak_password | same_password
// Registered users only. Verifies the CURRENT password server-side (verifyPassword: at most 5 wrong attempts per
// user in 15 minutes), sets the new one via the admin API and then ends all OTHER sessions of the user (other
// devices are signed out; their refresh tokens die, already issued access tokens expire within jwt_expiry = 1 h).
// The caller's own session (JWT claim `session_id`) is kept, so the page stays signed in.
import { validPassword } from '../_shared/konto.ts';
import { check, HttpError, serve } from '../_server/http.ts';
import { NOT_REGISTERED, sessionIdOf, verifyPassword } from '../_server/konto.ts';

const WEAK = () => new HttpError(400, 'weak_password', 'Das Passwort muss 8 bis 72 Zeichen lang sein.');
const SAME = () => new HttpError(400, 'same_password', 'Das neue Passwort muss sich vom alten unterscheiden.');

serve(async ({ userId, user, token, body, db }) => {
  if (user.is_anonymous || !user.email) throw NOT_REGISTERED();
  const { password, newPassword } = body;
  if (!validPassword(newPassword)) throw WEAK();
  await verifyPassword(user, password, db);
  if (newPassword === password) throw SAME();

  const { error } = await db.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) {
    if (error.status === 422 || error.code === 'weak_password') throw WEAK();
    throw error;
  }

  const revoked = check(
    await db.rpc('konto_revoke_other_sessions', { p_user_id: userId, p_keep_session: sessionIdOf(token) }),
  ) as number;
  return { status: 'changed', revokedSessions: revoked };
});
