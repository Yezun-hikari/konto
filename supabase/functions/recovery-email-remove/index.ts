// POST { password } -> { status: 'removed' } | error not_registered | not_password_account | wrong_password |
// rate_limited
// Password accounts only (Google accounts: 400 not_password_account, checked in verifyPassword). Verifies the
// password server-side, deletes the recovery address and invalidates all open confirmation and reset links. Idempotent (no address: also 'removed').
import { check, serve } from '../_server/http.ts';
import { verifyPassword } from '../_server/konto.ts';

serve(async ({ userId, user, body, db }) => {
  await verifyPassword(user, body.password, db);
  check(await db.rpc('konto_remove_recovery_email', { p_user_id: userId }));
  return { status: 'removed' };
});
