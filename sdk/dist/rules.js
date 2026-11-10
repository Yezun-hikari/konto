// Pure username / password / email rules. No Supabase, no DOM: unit-tested in sdk/test.
import { AuthFailure } from './errors.js';
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const MIN_PASSWORD = 8;
/** bcrypt only uses the first 72 bytes. */
export const MAX_PASSWORD = 72;
/** RFC 2606 reserved TLD: such an address can never be a real mailbox. */
export const EMAIL_DOMAIN = 'users.yezun-games.invalid';
/** Lowercases and validates a username for registration. Throws AuthFailure. */
export function normalizeUsername(username) {
    const u = username.trim().toLowerCase();
    if (!USERNAME_RE.test(u))
        throw new AuthFailure('Benutzername: 3–20 Zeichen, nur a–z, 0–9 und _.');
    return u;
}
/** Password length rules (8–72). Throws AuthFailure. */
export function checkPassword(pw) {
    if (pw.length < MIN_PASSWORD)
        throw new AuthFailure(`Passwort: mindestens ${MIN_PASSWORD} Zeichen.`);
    if (pw.length > MAX_PASSWORD)
        throw new AuthFailure('Passwort: höchstens 72 Zeichen.'); // bcrypt limit
}
/** Synthetic login address for a (normalized) username. */
export const toEmail = (username) => `${username}@${EMAIL_DOMAIN}`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Trims and validates a real (recovery) email address. Throws AuthFailure. The server re-checks. */
export function normalizeRecoveryEmail(email) {
    const e = email.trim();
    if (e.length > 254 || !EMAIL_RE.test(e) || e.toLowerCase().endsWith('.invalid')) {
        throw new AuthFailure('Bitte eine gültige E-Mail-Adresse eingeben.');
    }
    return e;
}
