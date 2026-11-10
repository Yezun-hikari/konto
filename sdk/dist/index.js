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
import { createClient } from '@supabase/supabase-js';
import { AuthFailure, fail, functionErrorCode, functionFailure, MSG, NOT_CONFIGURED } from './errors.js';
import { checkPassword, MIN_PASSWORD, normalizeRecoveryEmail, normalizeUsername, toEmail, USERNAME_RE } from './rules.js';
import { buildAccountUrl, DEFAULT_ACCOUNT_URL, safeReturnUrl } from './return-url.js';
export { AuthFailure, NOT_CONFIGURED, MIN_PASSWORD, USERNAME_RE, safeReturnUrl };
export { MAX_PASSWORD } from './rules.js';
const STORAGE_KEY = 'yezun-games-auth'; // shared by all sites on yezun.de – never change
let config = null;
let client = null;
let clientConfig = null;
let loaded = null;
let session = null;
/**
 * Build-time config of a Vite build. Each access is a literal `import.meta.env.X`, so Vite replaces it
 * statically; when it is not replaced (prebuilt dependency, non-Vite bundler, Node) `import.meta.env` is
 * undefined and the access throws – then the value counts as missing.
 */
function envConfig() {
    let url;
    let anonKey;
    try {
        url = import.meta.env.VITE_SUPABASE_URL;
    }
    catch {
        /* not bundled by Vite */
    }
    try {
        anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    }
    catch {
        /* not bundled by Vite */
    }
    return typeof url === 'string' && url && typeof anonKey === 'string' && anonKey ? { url, anonKey } : null;
}
function envDev() {
    try {
        return import.meta.env.DEV === true;
    }
    catch {
        return false;
    }
}
// Dev only: `?authslot=2` gives the tab its own session, to play against yourself locally.
function storageKey(cfg) {
    const dev = cfg.devAuthSlot ?? envDev();
    const slot = dev && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('authslot') : null;
    return STORAGE_KEY + (slot && /^\w{1,8}$/.test(slot) ? '-' + slot : '');
}
/**
 * Sets the Supabase project explicitly (alternative to the VITE_SUPABASE_* build variables).
 * Call it before any other SDK function, at the top of the entry module. Calling it again with the same
 * values is a no-op; different values after the client was created throw.
 */
export function configure(opts) {
    if (!opts || typeof opts.url !== 'string' || !opts.url || typeof opts.anonKey !== 'string' || !opts.anonKey) {
        throw new Error('@yezun/konto: configure() braucht url und anonKey.');
    }
    const next = { ...opts };
    if (client && clientConfig) {
        if (clientConfig.url === next.url && clientConfig.anonKey === next.anonKey) {
            config = { ...clientConfig, ...next };
            return;
        }
        throw new Error('@yezun/konto: configure() muss vor der ersten Nutzung des SDK aufgerufen werden.');
    }
    config = next;
}
/** Creates the client on first use. Returns null when no configuration is available. */
function init() {
    if (client)
        return client;
    const cfg = config ?? envConfig();
    if (!cfg)
        return null;
    const c = createClient(cfg.url, cfg.anonKey, { auth: { storageKey: storageKey(cfg) } });
    client = c;
    clientConfig = cfg;
    c.auth.onAuthStateChange((_e, s) => (session = s));
    loaded = c.auth.getSession().then(({ data }) => {
        session = data.session;
        if (session)
            dropDeadSession().catch(() => { });
    });
    return c;
}
/** Resolves once the stored session of the (lazily created) client has been loaded. */
const whenLoaded = () => (init(), loaded ?? Promise.resolve());
export const isConfigured = () => init() !== null;
/** The shared supabase-js client (for database reads, Realtime, Edge Functions). Throws if not configured. */
export function getClient() {
    const c = init();
    if (!c)
        throw new AuthFailure(NOT_CONFIGURED);
    return c;
}
/**
 * Resolves once the stored session has been loaded, so currentUser() is reliable after it.
 * Waits one macrotask first, so a configure() call in the importing module is picked up.
 */
export const ready = new Promise((r) => setTimeout(r, 0)).then(whenLoaded);
/**
 * Asks the server whether the stored session's user still exists (e.g. account deleted on another device).
 * If not, signs out locally so the next ensureSession() starts a fresh guest. Network errors keep the session.
 */
export async function dropDeadSession() {
    const c = getClient();
    const { error } = await c.auth.getUser();
    if (error?.status && error.status >= 400 && error.status < 500)
        await c.auth.signOut({ scope: 'local' });
}
const toUser = (s) => {
    const u = s?.user;
    if (!u)
        return null;
    const isGuest = u.is_anonymous === true || !u.email;
    return { id: u.id, isGuest, username: isGuest ? null : (u.email ?? '').split('@')[0] };
};
export const currentUser = () => toUser(session);
/** True when there is no account yet or the session is anonymous. */
export const isGuest = () => currentUser()?.isGuest ?? true;
/** Calls cb now and on every sign-in / sign-out / user change. Returns an unsubscribe function. */
export function onAuthChange(cb) {
    const c = init();
    if (!c) {
        cb(null);
        return () => { };
    }
    const { data } = c.auth.onAuthStateChange((_e, s) => setTimeout(() => cb(toUser(s)))); // no await inside callback
    return () => data.subscription.unsubscribe();
}
let pending = null;
/** Returns the current user, signing in anonymously (as guest) if there is no session yet. */
export function ensureSession() {
    pending ??= (async () => {
        const c = getClient();
        await whenLoaded();
        const { data } = await c.auth.getSession();
        if (data.session)
            return toUser(data.session);
        const { data: d, error } = await c.auth.signInAnonymously();
        if (error || !d.session)
            throw fail(error);
        return toUser(d.session);
    })().finally(() => (pending = null));
    return pending;
}
/**
 * Creates an account. A guest is upgraded in place (same user id, so ratings are kept);
 * without a session a fresh account is created.
 */
export async function register(username, password) {
    const c = getClient();
    const u = normalizeUsername(username);
    checkPassword(password);
    await whenLoaded();
    const { data } = await c.auth.getSession();
    const s = data.session;
    if (s && !toUser(s).isGuest)
        throw new AuthFailure('Du bist bereits angemeldet.');
    if (s) {
        const { data: d, error } = await c.auth.updateUser({ email: toEmail(u), password });
        if (error || !d.user)
            throw fail(error);
        // updateUser does not always refresh the cached session's user; refresh so is_anonymous=false is visible
        await c.auth.refreshSession();
    }
    else {
        const { error } = await c.auth.signUp({ email: toEmail(u), password });
        if (error)
            throw fail(error);
    }
    return currentUser();
}
/**
 * Signs in to an existing account. A current guest session is abandoned: its rating stays with the guest
 * and the guest's data is deleted (best effort) so no orphaned data lingers.
 */
export async function login(username, password) {
    const c = getClient();
    const u = username.trim().toLowerCase();
    // Same message for malformed names as for wrong credentials: never reveal whether a name exists.
    if (!USERNAME_RE.test(u) || !password)
        throw new AuthFailure('Benutzername oder Passwort falsch.');
    await whenLoaded();
    const guest = (await c.auth.getSession()).data.session;
    const guestToken = guest && toUser(guest).isGuest ? guest.access_token : null;
    const { error } = await c.auth.signInWithPassword({ email: toEmail(u), password });
    if (error) {
        if (error.status === 429 || error.name === 'AuthRetryableFetchError')
            throw fail(error);
        throw new AuthFailure('Benutzername oder Passwort falsch.');
    }
    if (guestToken) {
        c.functions
            .invoke('delete-account', { body: {}, headers: { Authorization: `Bearer ${guestToken}` } })
            .catch(() => { });
    }
    return currentUser();
}
/** Signs out on this device. A later ensureSession() starts a new guest. */
export async function logout() {
    const { error } = await getClient().auth.signOut({ scope: 'local' });
    if (error)
        throw fail(error);
}
/**
 * Changes the password of the signed-in (non-guest) user. The current password is verified server-side (Edge
 * Function password-change, at most 5 wrong attempts per 15 minutes); afterwards all OTHER sessions of the account
 * are signed out, this one stays signed in.
 */
export async function changePassword(currentPassword, newPassword) {
    getClient();
    await whenLoaded();
    requireAccount();
    checkPassword(newPassword);
    if (!currentPassword)
        throw new AuthFailure(MSG.wrongPassword);
    await invoke('password-change', { password: currentPassword, newPassword }, 'Passwort konnte nicht geändert werden. Bitte erneut versuchen.');
}
/**
 * Permanently deletes the account and all its data (all sites sharing the project, recovery email included).
 * Registered users must confirm with their password (checked server-side); guests need none.
 * Running matches count as lost.
 */
export async function deleteAccount(password) {
    const c = getClient();
    await whenLoaded();
    const me = currentUser();
    if (!me)
        return;
    if (!me.isGuest && !password)
        throw new AuthFailure(MSG.wrongPassword);
    // the server verifies the password; running matches are scored as a loss before deletion
    const { error } = await c.functions.invoke('delete-account', { body: me.isGuest ? {} : { password } });
    if (error) {
        const code = await functionErrorCode(error);
        if (code === null)
            throw new AuthFailure(MSG.network);
        if (code === 'wrong_password')
            throw new AuthFailure(MSG.wrongPassword);
        if (code === 'rate_limited')
            throw new AuthFailure(MSG.rateLimited);
        throw new AuthFailure('Löschen fehlgeschlagen. Bitte erneut versuchen.');
    }
    await c.auth.signOut({ scope: 'local' });
}
// ---------- Account page links ----------
const currentOrigin = () => (typeof location !== 'undefined' ? location.origin : undefined);
const currentHref = () => (typeof location !== 'undefined' ? location.href : undefined);
const accountBase = () => config?.accountUrl ?? DEFAULT_ACCOUNT_URL;
/**
 * Link to the login page of the account site: https://yezun.de/konto/#/login?return=<encoded>.
 * `returnTo` defaults to the current page; it is only included if it is a URL on https://yezun.de/
 * (or the current origin), otherwise the link has no return parameter.
 */
export const loginUrl = (returnTo = currentHref()) => buildAccountUrl(accountBase(), 'login', returnTo, currentOrigin());
/** Link to the account page: https://yezun.de/konto/#/konto?return=<encoded>. Same return rules as loginUrl. */
export const accountUrl = (returnTo = currentHref()) => buildAccountUrl(accountBase(), 'konto', returnTo, currentOrigin());
// ---------- Recovery email / password reset (Edge Functions) ----------
async function invoke(fn, body, fallback, overrides) {
    const c = getClient();
    await whenLoaded();
    const { data, error } = await c.functions.invoke(fn, { body });
    if (error)
        throw await functionFailure(error, fallback, overrides);
    return data;
}
function requireAccount() {
    if (!currentUser()?.username)
        throw new AuthFailure(MSG.notSignedIn);
}
/**
 * Stores `email` as (not yet verified) recovery address and sends a confirmation link to it.
 * The password is verified server-side. Replaces a previous address.
 */
export async function setRecoveryEmail(password, email) {
    getClient();
    await whenLoaded();
    requireAccount();
    const e = normalizeRecoveryEmail(email);
    if (!password)
        throw new AuthFailure(MSG.wrongPassword);
    await invoke('recovery-email-set', { password, email: e }, 'Speichern fehlgeschlagen. Bitte erneut versuchen.');
}
/** Removes the recovery address (password verified server-side). Afterwards no reset is possible. */
export async function removeRecoveryEmail(password) {
    getClient();
    await whenLoaded();
    requireAccount();
    if (!password)
        throw new AuthFailure(MSG.wrongPassword);
    await invoke('recovery-email-remove', { password }, 'Entfernen fehlgeschlagen. Bitte erneut versuchen.');
}
/**
 * Recovery address of the signed-in user (masked, e.g. "ma***@example.org") and whether it has been confirmed.
 * Reads the RPC `konto_recovery_email_status()` (no row → no address).
 */
export async function getRecoveryEmailStatus() {
    const c = getClient();
    await whenLoaded();
    requireAccount();
    const { data, error } = await c.rpc('konto_recovery_email_status');
    if (error) {
        if (!error.code && /fetch|network/i.test(error.message ?? ''))
            throw new AuthFailure(MSG.network);
        throw new AuthFailure('Status konnte nicht geladen werden.');
    }
    const row = (Array.isArray(data) ? data[0] : data);
    const email = typeof row?.email === 'string' && row.email ? row.email : null;
    return { email, verified: email !== null && row?.verified === true };
}
/**
 * Requests a reset link for `username`. It is only sent if the account has a verified recovery address,
 * but the call always resolves the same way (no account enumeration).
 */
export async function requestPasswordReset(username) {
    const u = normalizeUsername(username);
    await invoke('password-reset-request', { username: u }, 'Anfrage fehlgeschlagen. Bitte erneut versuchen.');
}
/**
 * Sets a new password with the one-time token from the reset link (valid 1 h). The server ends all sessions
 * of that account. Resolves with the account's username (null if the server did not send it), so the caller
 * can sign in right away with `login(username, newPassword)`.
 */
export async function confirmPasswordReset(token, newPassword) {
    if (typeof token !== 'string' || !token.trim())
        throw new AuthFailure(MSG.badLink);
    checkPassword(newPassword);
    const data = await invoke('password-reset-confirm', { token: token.trim(), password: newPassword }, 'Zurücksetzen fehlgeschlagen. Bitte erneut versuchen.');
    const u = typeof data?.username === 'string' ? data.username : '';
    return { username: USERNAME_RE.test(u) ? u : null };
}
/** Confirms a recovery address with the token from the confirmation link. */
export async function verifyRecoveryEmail(token) {
    if (typeof token !== 'string' || !token.trim())
        throw new AuthFailure(MSG.badLink);
    await invoke('recovery-email-verify', { token: token.trim() }, 'Bestätigung fehlgeschlagen. Bitte erneut versuchen.');
}
