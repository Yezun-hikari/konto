// POST { password, email } -> { status: 'pending' } | error not_registered | wrong_password | invalid_email |
// rate_limited | mail_unavailable | mail_failed
// Registered users only. Verifies the password server-side, stores the address as pending (replacing any previous
// one and invalidating its links) and mails a confirmation link (24 h). At most 5 confirmation mails per hour.
import { normalizeEmail, usernameFromEmail, verifyMail } from '../_shared/konto.ts';
import { check, HttpError, serve } from '../_server/http.ts';
import { NOT_REGISTERED, newToken, RATE_LIMITED, requireMailConfig, sendMail, verifyPassword } from '../_server/konto.ts';

const MAX_PER_HOUR = 5;

serve(async ({ userId, user, body, db }) => {
  const username = usernameFromEmail(user.email);
  if (user.is_anonymous || !username) throw NOT_REGISTERED();
  const email = normalizeEmail(body.email);
  if (!email) throw new HttpError(400, 'invalid_email', 'Bitte eine gültige E-Mail-Adresse angeben.');
  requireMailConfig();
  await verifyPassword(user, body.password, db);

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
