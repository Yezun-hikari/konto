// POST { password? , confirm? } -> { status: 'deleted' } | error wrong_password | rate_limited | reauth_required |
// confirm_mismatch
// Deletes the caller's auth user; ON DELETE CASCADE removes profile, ratings, queue entry, username and every match
// they played in (GDPR erasure). Works without a confirmed email (an unverified account can always be deleted).
// - Guests: nothing needed.
// - Password accounts: `password`, verified here with verifyPassword (incl. its per-user limit on failed attempts).
// - Accounts without a password (Google): `confirm` must be the account's username (if it has one yet), and the
//   sign-in must be fresh: JWT `iat` and the sign-in time in `amr` at most 10 minutes old (isFreshLogin), else
//   401 reauth_required → the client signs in with Google again and retries.
// Active matches are first settled as a loss for the caller, so deleting mid-game never dodges an Elo loss.
import { accountKind, accountUsername, isFreshLogin, jwtClaims, normalizeUsername } from '../_shared/konto.ts';
import { check, HttpError, serve } from '../_server/http.ts';
import { verifyPassword } from '../_server/konto.ts';

serve(async ({ userId, user, token, body, db }) => {
  const kind = accountKind(user);
  if (kind === 'password') {
    await verifyPassword(user, body.password, db);
  } else if (kind !== 'anonymous') {
    const username = accountUsername(user);
    if (username && normalizeUsername(body.confirm) !== username) {
      throw new HttpError(400, 'confirm_mismatch', 'Der Benutzername stimmt nicht überein.');
    }
    if (!isFreshLogin(jwtClaims(token), Math.floor(Date.now() / 1000))) {
      throw new HttpError(
        401,
        'reauth_required',
        'Bitte melde dich zur Sicherheit erneut mit Google an und lösche das Konto danach innerhalb von 10 Minuten.',
      );
    }
  }

  const active = check(
    await db.from('matches').select('id, x_id, o_id').eq('status', 'active').or(`x_id.eq.${userId},o_id.eq.${userId}`),
  ) as { id: string; x_id: string; o_id: string }[];
  for (const m of active) {
    check(await db.rpc('finish_match', { p_match_id: m.id, p_winner_id: m.x_id === userId ? m.o_id : m.x_id }));
  }

  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw error;
  return { status: 'deleted' };
});
