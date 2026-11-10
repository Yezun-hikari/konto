// POST { password } -> { status: 'removed' } | error not_registered | wrong_password | rate_limited
// Registered users only. Verifies the password server-side, deletes the recovery address and invalidates all open
// confirmation and reset links. Idempotent (no address: also 'removed').
import { check, serve } from '../_server/http.ts';
import { NOT_REGISTERED, verifyPassword } from '../_server/konto.ts';

serve(async ({ userId, user, body, db }) => {
  if (user.is_anonymous) throw NOT_REGISTERED();
  await verifyPassword(user, body.password, db);
  check(await db.rpc('konto_remove_recovery_email', { p_user_id: userId }));
  return { status: 'removed' };
});
