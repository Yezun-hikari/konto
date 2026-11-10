// Deno-only helpers for the Konto Edge Functions: password check, tokens, mail via Resend.
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { accountKind, base64url, isEmailVerified, jwtClaims, MAIL_FROM, type Mail, MAX_PASSWORD } from '../_shared/konto.ts';
import { check, HttpError, UUID } from './http.ts';

export const NOT_REGISTERED = () =>
  new HttpError(403, 'not_registered', 'Nur mit einem registrierten Konto möglich (nicht als Gast).');
export const WRONG_PASSWORD = () => new HttpError(403, 'wrong_password', 'Aktuelles Passwort ist falsch.');
export const RATE_LIMITED = () => new HttpError(429, 'rate_limited', 'Zu viele Versuche. Bitte später erneut.');
export const NOT_PASSWORD_ACCOUNT = () =>
  new HttpError(400, 'not_password_account', 'Nur für Konten mit Passwort möglich (nicht bei Anmeldung mit Google).');
export const EMAIL_UNVERIFIED = () =>
  new HttpError(403, 'email_unverified', 'Bitte bestätige zuerst deine E-Mail-Adresse.');
export const INVALID_TOKEN = () =>
  new HttpError(400, 'invalid_token', 'Der Link ist ungültig, abgelaufen oder wurde schon verwendet.');

/** Failed password checks per user before verifyPassword answers rate_limited, and the window they count in. */
export const MAX_PASSWORD_FAILURES = 5;
export const PASSWORD_FAILURE_WINDOW = '15 minutes';

/**
 * Verifies the caller's current password server-side, like delete-account. Uses a throwaway anon-key client; the
 * session the check creates is revoked right away. At most MAX_PASSWORD_FAILURES wrong passwords per user in
 * PASSWORD_FAILURE_WINDOW (counted in konto_password_failures), then rate_limited: GoTrue's own sign-in limit is
 * per IP, and here every request comes from the Edge Function, so it would not stop guessing for one account.
 *
 * Note: this protects the operations that go through the Edge Functions. A stolen access token can still call
 * GoTrue directly (PUT /auth/v1/user) as long as the project has "Secure password change" off, see README.
 */
export async function verifyPassword(user: User, password: unknown, db: SupabaseClient): Promise<void> {
  if (user.is_anonymous) throw NOT_REGISTERED();
  if (accountKind(user) !== 'password') throw NOT_PASSWORD_ACCOUNT();
  const allowed = check(
    await db.rpc('konto_password_check_allowed', {
      p_user_id: user.id,
      p_max: MAX_PASSWORD_FAILURES,
      p_window: PASSWORD_FAILURE_WINDOW,
    }),
  ) as boolean;
  if (!allowed) throw RATE_LIMITED();
  const wrong = async () => {
    check(await db.rpc('konto_note_password_failure', { p_user_id: user.id }));
    return WRONG_PASSWORD();
  };
  if (typeof password !== 'string' || !password || password.length > MAX_PASSWORD || !user.email) {
    throw await wrong();
  }
  const verifier = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await verifier.auth.signInWithPassword({ email: user.email, password });
  if (error) throw error.status === 429 ? RATE_LIMITED() : await wrong();
  // ends only this throwaway session (scope local), not the user's real ones
  await verifier.auth.signOut({ scope: 'local' }).catch(() => {});
}

/** Registered account with a confirmed email (app_metadata.email_verified), else 403 not_registered/email_unverified. */
export function requireVerified(user: User): void {
  if (user.is_anonymous) throw NOT_REGISTERED();
  if (!isEmailVerified(user)) throw EMAIL_UNVERIFIED();
}

/** The `session_id` claim of an access token (already verified by db.auth.getUser in serve), or null. */
export function sessionIdOf(jwt: string): string | null {
  const id = jwtClaims(jwt)?.session_id;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}

export async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 32 random bytes as base64url (goes into the mail) and its sha256 (the only thing stored). */
export async function newToken(): Promise<{ token: string; hash: string }> {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  return { token, hash: await sha256Hex(token) };
}

/** Fails fast (503) when mail is not configured, before anything is stored. */
export function requireMailConfig(): string {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    console.error('RESEND_API_KEY is not set (supabase secrets set RESEND_API_KEY=...)');
    throw new HttpError(503, 'mail_unavailable', 'Der E-Mail-Versand ist derzeit nicht eingerichtet.');
  }
  return key;
}

/** Sends one mail through the Resend HTTP API. Never logs the recipient or the body (contains the token). */
export async function sendMail(to: string, mail: Mail): Promise<void> {
  const key = requireMailConfig();
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error('resend request failed', e instanceof Error ? e.name : e);
    throw mailFailed();
  }
  if (!res.ok) {
    console.error('resend responded', res.status, (await res.text().catch(() => '')).slice(0, 300));
    throw mailFailed();
  }
}

const mailFailed = () =>
  new HttpError(502, 'mail_failed', 'Die E-Mail konnte nicht gesendet werden. Bitte später erneut versuchen.');

/** Runs work after the response (constant timing for password-reset-request). Falls back to awaiting it. */
export async function inBackground(work: () => Promise<void>): Promise<void> {
  const p = work().catch((e) => console.error(e));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
  else await p;
}
