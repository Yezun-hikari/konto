// POST { password? } -> { status: 'deleted' }. Deletes the caller's auth user; ON DELETE CASCADE removes profile,
// ratings, queue entry and every match they played in (GDPR erasure).
// Registered users must send their password (verified here with verifyPassword, incl. its per-user limit on
// failed attempts); guests need none. Active matches are first settled as a loss for the caller, so deleting
// mid-game never dodges an Elo loss.
import { check, serve } from '../_server/http.ts';
import { verifyPassword } from '../_server/konto.ts';

serve(async ({ userId, user, body, db }) => {
  if (!user.is_anonymous) await verifyPassword(user, body.password, db);

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
