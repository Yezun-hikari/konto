// Error mapping to German, user-presentable AuthFailure messages. Unit-tested with fake errors.
import { FunctionsHttpError, type AuthError } from '@supabase/supabase-js';

export const NOT_CONFIGURED = 'Online-Modus nicht konfiguriert';
const MIN_PASSWORD = 8; // duplicated from rules.ts to keep this module import-free of it

/** Every SDK function rejects with this; `message` is German and safe to show. */
export class AuthFailure extends Error {}

export const MSG = {
  unknown: 'Unbekannter Fehler. Bitte erneut versuchen.',
  rateLimited: 'Zu viele Versuche. Bitte später erneut.',
  network: 'Keine Verbindung zum Server.',
  wrongPassword: 'Aktuelles Passwort ist falsch.',
  badLink: 'Der Link ist ungültig oder abgelaufen.',
  badEmail: 'Bitte eine gültige E-Mail-Adresse eingeben.',
  notSignedIn: 'Nicht angemeldet.',
} as const;

/** Maps a GoTrue error (supabase.auth.*) to an AuthFailure. Identical to xox src/auth. */
export function fail(e: AuthError | null | undefined, fallback: string = MSG.unknown): AuthFailure {
  if (!e) return new AuthFailure(fallback);
  if (e.status === 429 || e.code === 'over_request_rate_limit') return new AuthFailure(MSG.rateLimited);
  if (e.name === 'AuthRetryableFetchError' || e.status === 0) return new AuthFailure(MSG.network);
  switch (e.code) {
    case 'user_already_exists':
    case 'email_exists':
      return new AuthFailure('Dieser Benutzername ist bereits vergeben.');
    case 'weak_password':
      return new AuthFailure(`Passwort zu schwach (mindestens ${MIN_PASSWORD} Zeichen).`);
    case 'same_password':
      return new AuthFailure('Das neue Passwort muss sich vom alten unterscheiden.');
    case 'anonymous_provider_disabled':
    case 'signup_disabled':
      return new AuthFailure('Anmeldung ist derzeit deaktiviert.');
  }
  return new AuthFailure(fallback);
}

/** `{ error: <code> }` bodies of the account Edge Functions → German message. */
const FUNCTION_MESSAGES: Record<string, string> = {
  wrong_password: MSG.wrongPassword,
  rate_limited: MSG.rateLimited,
  invalid: 'Ungültige Eingabe.',
  invalid_email: MSG.badEmail,
  email_invalid: MSG.badEmail,
  invalid_token: MSG.badLink,
  token_invalid: MSG.badLink,
  token_expired: MSG.badLink,
  expired: MSG.badLink,
  token_used: MSG.badLink,
  used: MSG.badLink,
  weak_password: `Passwort: ${MIN_PASSWORD}–72 Zeichen.`,
  invalid_password: `Passwort: ${MIN_PASSWORD}–72 Zeichen.`,
  same_password: 'Das neue Passwort muss sich vom alten unterscheiden.',
  unauthorized: 'Sitzung abgelaufen. Bitte erneut anmelden.',
  not_registered: 'Nur für registrierte Konten möglich.',
  guest: 'Nur für registrierte Konten möglich.',
  mail_failed: 'Die E-Mail konnte nicht gesendet werden. Bitte später erneut.',
  mail_unavailable: 'Der E-Mail-Versand ist derzeit nicht eingerichtet.',
  send_failed: 'Die E-Mail konnte nicht gesendet werden. Bitte später erneut.',
};

export interface FunctionErrorInfo {
  code: string;
  /** German, user-presentable text sent by the server (`{ error, message }`), if any. */
  message: string | null;
}

/** Reads `{ error, message? }` of a failed `functions.invoke`; null for network/relay errors. */
export async function functionErrorInfo(error: unknown): Promise<FunctionErrorInfo | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
  const res = error.context as Response | undefined;
  let code: string | undefined;
  let message: string | null = null;
  try {
    const body = (await res?.json()) as { error?: unknown; message?: unknown } | undefined;
    if (typeof body?.error === 'string' && body.error) code = body.error;
    if (typeof body?.message === 'string' && body.message.trim()) message = body.message.trim().slice(0, 300);
  } catch {
    /* no JSON body */
  }
  if (!code && res?.status === 429) code = 'rate_limited';
  if (!code && res?.status === 401) code = 'unauthorized';
  return { code: code ?? 'internal', message };
}

/** Only the `error` code of a failed `functions.invoke`; null for network/relay errors. */
export const functionErrorCode = async (error: unknown): Promise<string | null> =>
  (await functionErrorInfo(error))?.code ?? null;

/**
 * Maps the error of a failed `functions.invoke` to an AuthFailure.
 * Order: `overrides[code]`, the server's own German `message`, the SDK's message for the code, `fallback`.
 */
export async function functionFailure(
  error: unknown,
  fallback: string = MSG.unknown,
  overrides: Record<string, string> = {},
): Promise<AuthFailure> {
  const info = await functionErrorInfo(error);
  if (info === null) return new AuthFailure(MSG.network);
  return new AuthFailure(overrides[info.code] ?? info.message ?? FUNCTION_MESSAGES[info.code] ?? fallback);
}
