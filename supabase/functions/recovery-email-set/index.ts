// POST { password, email } | { resend: true } -> { status: 'pending' } | error not_registered |
// not_password_account | wrong_password | invalid_email | nothing_pending | rate_limited | mail_unavailable |
// mail_failed
// Password accounts only (Google accounts: 400 not_password_account). Allowed without a confirmed email, so an
// unverified account can correct its address or get a new link.
// - { password, email }: verifies the password server-side, stores the address as pending (replacing any previous
//   one and invalidating its links) and mails a confirmation link (24 h).
// - { resend: true }: no password; sends a new link to the address that is already stored and still pending (the
//   older links stop working). Same limits.
// Limits (konto_set_recovery_email): 5 confirmation mails per account and hour, 3 per address and day, 200 per day.
import { accountKind, normalizeEmail, usernameFromEmail, verifyMail } from '../_shared/konto.ts';
import { check, HttpError, serve } from '../_server/http.ts';
import {
  NOT_PASSWORD_ACCOUNT,
  NOT_REGISTERED,
  newToken,
  RATE_LIMITED,
  requireMailConfig,
  sendMail,
  verifyPassword,
} from '../_server/konto.ts';

const MAX_PER_HOUR = 5;

serve(async ({ userId, user, body, db }) => {
  if (user.is_anonymous) throw NOT_REGISTERED();
  if (accountKind(user) !== 'password') throw NOT_PASSWORD_ACCOUNT();
  const username = usernameFromEmail(user.email);
  if (!username) throw NOT_REGISTERED();

  let email: string | null;
  if (body.resend === true) {
    const row = check(
      await db.from('konto_recovery_emails').select('email, verified_at').eq('user_id', userId).maybeSingle(),
    ) as { email: string; verified_at: string | null } | null;
    email = row && !row.verified_at ? row.email : null;
    if (!email) {
      throw new HttpError(400, 'nothing_pending', 'Es ist keine unbestätigte E-Mail-Adresse hinterlegt.');
    }
    requireMailConfig();
  } else {
    email = normalizeEmail(body.email);
    if (!email) throw new HttpError(400, 'invalid_email', 'Bitte eine gültige E-Mail-Adresse angeben.');
    requireMailConfig();
    await verifyPassword(user, body.password, db);
  }

  const { token, hash } = await newToken();
  const stored = check(
    await db.rpc('konto_set_recovery_email', {
      p_user_id: userId,
      p_email: email,
      p_token_hash: hash,
      p_max_per_hour: MAX_PER_HOUR,
    }),
  ) as boolean;
  if (!stored) throw RATE_LIMITED();

  await sendMail(email, verifyMail(username, token));
  return { status: 'pending' };
});
