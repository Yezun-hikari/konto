// POST { username } -> { username } | error not_registered | email_unverified | invalid_username |
// username_already_set | username_taken | rate_limited
// For registered accounts without a username (Google sign-in). Claims the name in konto_usernames and writes
// app_metadata.username (+ email_verified) in one transaction (konto_set_username); the client calls
// refreshSession() afterwards to get the name into its JWT. Password accounts already have a name (already_set).
// At most 10 calls per account in 15 minutes (enumeration of taken names).
import { normalizeUsername } from '../_shared/konto.ts';
import { check, HttpError, serve } from '../_server/http.ts';
import { NOT_REGISTERED, RATE_LIMITED, requireVerified } from '../_server/konto.ts';

const MAX_ATTEMPTS = 10;
const WINDOW = '15 minutes';

serve(async ({ userId, user, body, db }) => {
  requireVerified(user);
  if (typeof user.app_metadata?.username === 'string') throw ALREADY_SET();
  const username = normalizeUsername(body.username);
  if (!username) throw new HttpError(400, 'invalid_username', 'Benutzername: 3–20 Zeichen, nur a–z, 0–9 und _.');

  const result = check(
    await db.rpc('konto_set_username', {
      p_user_id: userId,
      p_username: username,
      p_max: MAX_ATTEMPTS,
      p_window: WINDOW,
    }),
  ) as string;
  switch (result) {
    case 'ok':
      return { username };
    case 'taken':
      throw new HttpError(409, 'username_taken', 'Dieser Benutzername ist schon vergeben.');
    case 'already_set':
      throw ALREADY_SET();
    case 'rate_limited':
      throw RATE_LIMITED();
    case 'not_allowed':
      throw NOT_REGISTERED();
    default:
      throw new Error(`konto_set_username: unexpected result ${result}`);
  }
});

function ALREADY_SET() {
  return new HttpError(409, 'username_already_set', 'Für dieses Konto ist bereits ein Benutzername festgelegt.');
}
