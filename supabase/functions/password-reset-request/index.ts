// POST { username } -> always { status: 'ok' } (or mail_unavailable when mail is not configured at all).
// No login needed (verify_jwt = false). The answer and its timing never depend on the username: lookup, token and
// mail run after the response (EdgeRuntime.waitUntil). A mail is sent only to a registered user's VERIFIED
// recovery address, at most 3 per user and hour (counted in konto_tokens); each new link supersedes older ones.
import { normalizeUsername, resetMail } from '../_shared/konto.ts';
import { check, servePublic } from '../_server/http.ts';
import { inBackground, newToken, requireMailConfig, sendMail } from '../_server/konto.ts';

const MAX_PER_HOUR = 3;

servePublic(async ({ body, db }) => {
  requireMailConfig(); // independent of the username, so it reveals nothing
  const username = normalizeUsername(body.username);
  if (username) {
    await inBackground(async () => {
      const rows = check(await db.rpc('konto_reset_target', { p_username: username })) as
        { user_id: string; email: string }[];
      const target = rows[0];
      if (!target) return;
      const { token, hash } = await newToken();
      const issued = check(
        await db.rpc('konto_issue_token', {
          p_user_id: target.user_id,
          p_kind: 'reset_password',
          p_email: target.email,
          p_token_hash: hash,
          p_ttl: '1 hour',
          p_max_per_hour: MAX_PER_HOUR,
        }),
      ) as boolean;
      if (!issued) return; // rate limited: silently, same answer
      await sendMail(target.email, resetMail(username, token));
    });
  }
  return { status: 'ok' };
});
