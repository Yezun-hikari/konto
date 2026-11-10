// Pure helpers for the Konto Edge Functions (recovery email, password reset). No Deno/Node APIs, so vitest and the
// frontend type-check can use them too.

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72;
/** Synthetic auth.users address (see trigger enforce_synthetic_email). */
export const SYNTHETIC_DOMAIN = '@users.yezun-games.invalid';
/** 32 random bytes, base64url without padding. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const KONTO_URL = 'https://yezun.de/konto/';
export const MAIL_FROM = 'Yezun Konto <konto@yezun.de>';

const LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
// reserved / non-deliverable TLDs (RFC 2606, RFC 6761); `.invalid` also keeps the synthetic addresses out
const RESERVED_TLD = new Set(['invalid', 'test', 'example', 'localhost', 'local']);

/** Trimmed address with lower-cased domain, or null if it is not a plain deliverable ASCII address. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (s.length < 3 || s.length > 254) return null;
  const at = s.lastIndexOf('@');
  if (at < 1 || at !== s.indexOf('@')) return null;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1).toLowerCase();
  if (local.length > 64 || !LOCAL_RE.test(local)) return null;
  const labels = domain.split('.');
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) return null;
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,63}$/.test(tld) && !/^xn--[a-z0-9-]{1,59}$/.test(tld)) return null;
  if (RESERVED_TLD.has(tld)) return null;
  return `${local}@${domain}`;
}

/** Lower-cased, trimmed username, or null if it cannot be one. */
export function normalizeUsername(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const u = input.trim().toLowerCase();
  return USERNAME_RE.test(u) ? u : null;
}

/** Username from the synthetic auth email, or null. */
export function usernameFromEmail(email: string | undefined | null): string | null {
  if (!email || !email.endsWith(SYNTHETIC_DOMAIN)) return null;
  const u = email.slice(0, -SYNTHETIC_DOMAIN.length);
  return USERNAME_RE.test(u) ? u : null;
}

export function validPassword(p: unknown): p is string {
  return typeof p === 'string' && p.length >= MIN_PASSWORD && p.length <= MAX_PASSWORD;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function verifyLink(token: string): string {
  return `${KONTO_URL}#/verify-email?token=${encodeURIComponent(token)}`;
}

export function resetLink(token: string): string {
  return `${KONTO_URL}#/reset?token=${encodeURIComponent(token)}`;
}

export interface Mail {
  subject: string;
  text: string;
  html: string;
}

function render(subject: string, paragraphs: string[], link: { url: string; label: string }, after: string[]): Mail {
  const text = [...paragraphs, link.url, ...after, `Yezun Konto\n${KONTO_URL}`].join('\n\n') + '\n';
  const p = (t: string) => `<p style="margin:0 0 16px">${escapeHtml(t)}</p>`;
  const url = escapeHtml(link.url);
  const html =
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>' + escapeHtml(subject) + '</title></head>' +
    '<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
    'font-size:16px;line-height:1.5;color:#1a1a1a;background:#ffffff">' +
    '<div style="max-width:560px;margin:0 auto">' +
    paragraphs.map(p).join('') +
    `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:6px;` +
    `background:#1a56db;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(link.label)}</a></p>` +
    `<p style="margin:0 0 16px;font-size:14px;color:#555">Falls der Knopf nicht funktioniert, diesen Link kopieren:<br>` +
    `<a href="${url}" style="color:#1a56db;word-break:break-all">${url}</a></p>` +
    after.map(p).join('') +
    `<p style="margin:24px 0 0;font-size:14px;color:#555">Yezun Konto · ` +
    `<a href="${escapeHtml(KONTO_URL)}" style="color:#555">${escapeHtml(KONTO_URL)}</a></p>` +
    '</div></body></html>';
  return { subject, text, html };
}

export function verifyMail(username: string, token: string): Mail {
  return render(
    'Wiederherstellungs-E-Mail bestätigen',
    [
      `Hallo ${username},`,
      `diese Adresse wurde als Wiederherstellungs-E-Mail für das Yezun-Konto „${username}“ eingetragen. ` +
        'Damit kannst du dein Passwort zurücksetzen, falls du es vergisst.',
      'Bitte bestätige die Adresse über diesen Link (24 Stunden gültig):',
    ],
    { url: verifyLink(token), label: 'E-Mail-Adresse bestätigen' },
    ['Warst du das nicht? Dann ignoriere diese E-Mail. Ohne Bestätigung wird die Adresse nicht verwendet.'],
  );
}

export function resetMail(username: string, token: string): Mail {
  return render(
    'Passwort zurücksetzen',
    [
      `Hallo ${username},`,
      `für das Yezun-Konto „${username}“ wurde ein neues Passwort angefordert.`,
      'Über diesen Link kannst du ein neues Passwort festlegen (1 Stunde gültig, nur einmal verwendbar):',
    ],
    { url: resetLink(token), label: 'Neues Passwort festlegen' },
    [
      'Hast du das nicht angefordert? Dann ignoriere diese E-Mail. Dein Passwort bleibt unverändert.',
      'Nach dem Zurücksetzen wirst du auf allen Geräten abgemeldet.',
    ],
  );
}

/** The parts of a GoTrue user the account helpers look at (structurally compatible with supabase-js `User`). */
export interface AccountLike {
  is_anonymous?: boolean;
  email?: string | null;
  identities?: { provider: string }[] | null;
  app_metadata?: Record<string, unknown> | null;
}

/**
 * - 'anonymous': guest.
 * - 'password': has an email identity (username + password). The synthetic address counts as well, in case the
 *   identities are missing from the user object.
 * - 'google': registered, no password, signs in with Google.
 * - 'other': registered, neither (e.g. the bot); treated like a password-less account.
 */
export type AccountKind = 'anonymous' | 'password' | 'google' | 'other';

export function accountKind(user: AccountLike): AccountKind {
  if (user.is_anonymous) return 'anonymous';
  const providers = (user.identities ?? []).map((i) => i.provider);
  if (providers.includes('email') || usernameFromEmail(user.email)) return 'password';
  if (providers.includes('google')) return 'google';
  return 'other';
}

/** app_metadata.username (set by the database for every registered account), or null. */
export function accountUsername(user: AccountLike): string | null {
  const u = user.app_metadata?.username;
  return typeof u === 'string' && USERNAME_RE.test(u) ? u : usernameFromEmail(user.email);
}

/** True when the account has a confirmed email (app_metadata.email_verified, see the email_verified migration). */
export function isEmailVerified(user: AccountLike): boolean {
  return user.app_metadata?.email_verified === true;
}

/** Payload of a JWT (signature NOT checked: only for tokens already verified elsewhere), or null. */
export function jwtClaims(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split('.')[1] ?? '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    return typeof claims === 'object' && claims !== null && !Array.isArray(claims) ? claims : null;
  } catch {
    return null;
  }
}

/** Maximum age of the sign-in for operations without a password (delete-account of Google accounts). */
export const FRESH_LOGIN_SECONDS = 10 * 60;

/**
 * Whether the sign-in behind these access-token claims is at most maxAge seconds old. Both must hold:
 * - `iat` (issue time of this token) is recent;
 * - the newest `amr[].timestamp` (time of the actual sign-in; GoTrue keeps it across token refreshes, unlike
 *   `iat`) is recent, if the token carries `amr`.
 * Up to 60 s clock skew into the future is tolerated.
 */
export function isFreshLogin(
  claims: Record<string, unknown> | null,
  nowSeconds: number,
  maxAge = FRESH_LOGIN_SECONDS,
): boolean {
  if (!claims) return false;
  const recent = (t: unknown) =>
    typeof t === 'number' && Number.isFinite(t) && t >= nowSeconds - maxAge && t <= nowSeconds + 60;
  if (!recent(claims.iat)) return false;
  if (Array.isArray(claims.amr)) {
    const times = claims.amr
      .map((a) => (typeof a === 'object' && a !== null ? (a as { timestamp?: unknown }).timestamp : undefined))
      .filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
    if (times.length && !recent(Math.max(...times))) return false;
  }
  return true;
}
