/**
 * @yezun/konto – shared account SDK for all sites on https://yezun.de/ (one Supabase project, one session).
 * Successor of xox `src/auth/index.ts`: same behaviour, same German messages, same storage key.
 * Framework-free. See sdk/README.md.
 *
 * Accounts are username + password. The username is mapped to a synthetic email under a reserved
 * domain that can never receive mail. A real address can optionally be stored as *recovery email*
 * (kept server-side in its own table, never in auth.users) to allow a password reset.
 * Every function throws `AuthFailure` with a German, user-presentable message on failure.
 *
 * Configuration: `configure({ url, anonKey })` before first use, or – when this source is bundled by
 * Vite – the build-time variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. The client is created lazily
 * on first use, so `configure()` only has to run before the first SDK call (top of the entry module).
 */
import { type SupabaseClient } from '@supabase/supabase-js';
import { AuthFailure, NOT_CONFIGURED } from './errors.js';
import { MIN_PASSWORD, USERNAME_RE } from './rules.js';
import { safeReturnUrl } from './return-url.js';
export { AuthFailure, NOT_CONFIGURED, MIN_PASSWORD, USERNAME_RE, safeReturnUrl };
export { MAX_PASSWORD } from './rules.js';
export interface AuthUser {
    id: string;
    /** null for guests (anonymous users). */
    username: string | null;
    isGuest: boolean;
}
export interface KontoConfig {
    /** Supabase project URL (public). */
    url: string;
    /** Supabase anon / publishable key (public). */
    anonKey: string;
    /** Address of the account page, default https://yezun.de/konto/ (e.g. http://localhost:5173/konto/ in dev). */
    accountUrl?: string;
    /** Allow `?authslot=N` (separate session per tab, for local testing). Default: Vite's import.meta.env.DEV. */
    devAuthSlot?: boolean;
}
export interface RecoveryEmailStatus {
    /** Possibly masked address (e.g. "a***@example.org"), null if none is stored. */
    email: string | null;
    verified: boolean;
}
/**
 * Sets the Supabase project explicitly (alternative to the VITE_SUPABASE_* build variables).
 * Call it before any other SDK function, at the top of the entry module. Calling it again with the same
 * values is a no-op; different values after the client was created throw.
 */
export declare function configure(opts: KontoConfig): void;
export declare const isConfigured: () => boolean;
/** The shared supabase-js client (for database reads, Realtime, Edge Functions). Throws if not configured. */
export declare function getClient(): SupabaseClient;
/**
 * Resolves once the stored session has been loaded, so currentUser() is reliable after it.
 * Waits one macrotask first, so a configure() call in the importing module is picked up.
 */
export declare const ready: Promise<void>;
/**
 * Asks the server whether the stored session's user still exists (e.g. account deleted on another device).
 * If not, signs out locally so the next ensureSession() starts a fresh guest. Network errors keep the session.
 */
export declare function dropDeadSession(): Promise<void>;
export declare const currentUser: () => AuthUser | null;
/** True when there is no account yet or the session is anonymous. */
export declare const isGuest: () => boolean;
/** Calls cb now and on every sign-in / sign-out / user change. Returns an unsubscribe function. */
export declare function onAuthChange(cb: (user: AuthUser | null) => void): () => void;
/** Returns the current user, signing in anonymously (as guest) if there is no session yet. */
export declare function ensureSession(): Promise<AuthUser>;
/**
 * Creates an account. A guest is upgraded in place (same user id, so ratings are kept);
 * without a session a fresh account is created.
 */
export declare function register(username: string, password: string): Promise<AuthUser>;
/**
 * Signs in to an existing account. A current guest session is abandoned: its rating stays with the guest
 * and the guest's data is deleted (best effort) so no orphaned data lingers.
 */
export declare function login(username: string, password: string): Promise<AuthUser>;
/** Signs out on this device. A later ensureSession() starts a new guest. */
export declare function logout(): Promise<void>;
/**
 * Changes the password of the signed-in (non-guest) user. The current password is verified server-side (Edge
 * Function password-change, at most 5 wrong attempts per 15 minutes); afterwards all OTHER sessions of the account
 * are signed out, this one stays signed in.
 */
export declare function changePassword(currentPassword: string, newPassword: string): Promise<void>;
/**
 * Permanently deletes the account and all its data (all sites sharing the project, recovery email included).
 * Registered users must confirm with their password (checked server-side); guests need none.
 * Running matches count as lost.
 */
export declare function deleteAccount(password?: string): Promise<void>;
/**
 * Link to the login page of the account site: https://yezun.de/konto/#/login?return=<encoded>.
 * `returnTo` defaults to the current page; it is only included if it is a URL on https://yezun.de/
 * (or the current origin), otherwise the link has no return parameter.
 */
export declare const loginUrl: (returnTo?: string | undefined) => string;
/** Link to the account page: https://yezun.de/konto/#/konto?return=<encoded>. Same return rules as loginUrl. */
export declare const accountUrl: (returnTo?: string | undefined) => string;
/**
 * Stores `email` as (not yet verified) recovery address and sends a confirmation link to it.
 * The password is verified server-side. Replaces a previous address.
 */
export declare function setRecoveryEmail(password: string, email: string): Promise<void>;
/** Removes the recovery address (password verified server-side). Afterwards no reset is possible. */
export declare function removeRecoveryEmail(password: string): Promise<void>;
/**
 * Recovery address of the signed-in user (masked, e.g. "ma***@example.org") and whether it has been confirmed.
 * Reads the RPC `konto_recovery_email_status()` (no row → no address).
 */
export declare function getRecoveryEmailStatus(): Promise<RecoveryEmailStatus>;
/**
 * Requests a reset link for `username`. It is only sent if the account has a verified recovery address,
 * but the call always resolves the same way (no account enumeration).
 */
export declare function requestPasswordReset(username: string): Promise<void>;
/**
 * Sets a new password with the one-time token from the reset link (valid 1 h). The server ends all sessions
 * of that account. Resolves with the account's username (null if the server did not send it), so the caller
 * can sign in right away with `login(username, newPassword)`.
 */
export declare function confirmPasswordReset(token: string, newPassword: string): Promise<{
    username: string | null;
}>;
/** Confirms a recovery address with the token from the confirmation link. */
export declare function verifyRecoveryEmail(token: string): Promise<void>;
