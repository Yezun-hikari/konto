/**
 * @yezun/konto – shared account SDK for all sites on https://yezun.de/ (one Supabase project, one session).
 * Successor of xox `src/auth/index.ts`: same behaviour, same German messages, same storage key.
 * Framework-free. See sdk/README.md.
 *
 * Password accounts are username + password. The username is mapped to a synthetic email under a reserved
 * domain that can never receive mail. Registration requires a real address, stored as *recovery email*
 * (kept server-side in its own table, never in auth.users) to allow a password reset.
 * Google accounts sign in via OAuth (PKCE, redirect back to the account page) and pick a username afterwards;
 * for every account the username is in the JWT under `app_metadata.username`.
 * Every function throws `AuthFailure` with a German, user-presentable message on failure.
 *
 * Configuration: `configure({ url, anonKey })` before first use, or – when this source is bundled by
 * Vite – the build-time variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. The client is created lazily
 * on first use, so `configure()` only has to run before the first SDK call (top of the entry module).
 */
import { createClient } from '@supabase/supabase-js';
import { AuthFailure, fail, functionErrorInfo, functionFailure, MSG, NOT_CONFIGURED } from './errors.js';
import { checkPassword, EMAIL_DOMAIN, MIN_PASSWORD, normalizeRecoveryEmail, normalizeUsername, toEmail, USERNAME_RE } from './rules.js';
import { buildAccountUrl, DEFAULT_ACCOUNT_URL, safeReturnUrl } from './return-url.js';
export { AuthFailure, NOT_CONFIGURED, MIN_PASSWORD, USERNAME_RE, safeReturnUrl };
export { MAX_PASSWORD } from './rules.js';
const STORAGE_KEY = 'yezun-games-auth'; // shared by all sites on yezun.de – never change
let config = null;
let client = null;
let clientConfig = null;
let loaded = null;
let session = null;
let callback = null;
function captureCallback() {
    if (typeof location === 'undefined')
        return null;
    const q = new URLSearchParams(location.search);
    // GoTrue may put redirect errors into the fragment ("#error=…&error_code=…"); app routes look like "#/…".
    const rawHash = location.hash.replace(/^#/, '');
    const h = rawHash.startsWith('/') ? new URLSearchParams() : new URLSearchParams(rawHash);
    const get = (k) => q.get(k) ?? h.get(k);
    const error = get('error');
    const errorCode = get('error_code');
    if (!q.has('code') && !error && !errorCode)
        return null;
    return { error, errorCode, returnParam: q.get('return') };
}
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
    callback = captureCallback();
    const c = createClient(cfg.url, cfg.anonKey, {
        auth: { storageKey: storageKey(cfg), flowType: 'pkce', detectSessionInUrl: true },
    });
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
const SYNTHETIC_SUFFIX = '@' + EMAIL_DOMAIN;
/** Maps a supabase-js user to AuthUser. Exported for tests only. */
export function toAuthUser(u) {
    if (!u)
        return null;
    const email = (u.email ?? '').toLowerCase();
    const isGuest = u.is_anonymous === true || !email;
    const meta = (u.app_metadata ?? {});
    const synthetic = email.endsWith(SYNTHETIC_SUFFIX) ? email.slice(0, -SYNTHETIC_SUFFIX.length) : '';
    let username = null;
    if (!isGuest) {
        if (typeof meta.username === 'string' && USERNAME_RE.test(meta.username))
            username = meta.username;
        else if (USERNAME_RE.test(synthetic))
            username = synthetic;
    }
    const providers = Array.isArray(meta.providers) ? meta.providers : [];
    const google = meta.provider === 'google' || providers.includes('google');
    const provider = isGuest ? 'anonymous' : synthetic || !google ? 'password' : 'google';
    // only an explicit `false` blocks: legacy accounts / tokens issued before the claim existed stay usable
    const emailVerified = !isGuest && (meta.email_verified !== false || meta.legacy === true);
    const status = isGuest ? 'guest' : emailVerified ? 'active' : 'unverified';
    return { id: u.id, username, isGuest, provider, needsUsername: !isGuest && !username, emailVerified, status };
}
const toUser = (s) => toAuthUser(s?.user);
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
/** GoTrue reports exceptions of the auth.users trigger (`raise exception 'username_taken'`) as a database error. */
function isUsernameTaken(e) {
    if (!e)
        return false;
    if (/username_taken/.test(`${e.code ?? ''} ${e.message ?? ''}`))
        return true;
    // the original exception text is not passed through; for synthetic emails the only trigger exception is username_taken
    return (e.status ?? 0) >= 500 && /database error (saving new|updating) user/i.test(e.message ?? '');
}
/** Reloads the session (new JWT claims) and updates the cached one. */
async function refresh(c) {
    const { data } = await c.auth.refreshSession();
    if (data?.session)
        session = data.session;
}
/**
 * Creates a password account. `email` is required and is stored as recovery address (a confirmation link is sent).
 * The new account has `status 'unverified'` until the link is opened (verifyRecoveryEmail()).
 * A guest is upgraded in place (same user id, so ratings are kept); without a session a fresh account is created.
 * If only storing the email fails, the account exists anyway: the AuthFailure then has `accountCreated = true`.
 */
export async function register(username, password, email) {
    const c = getClient();
    let e;
    try {
        e = normalizeRecoveryEmail(typeof email === 'string' ? email : '');
    }
    catch {
        throw new AuthFailure('Bitte eine gültige E-Mail-Adresse angeben.');
    }
    const u = normalizeUsername(username);
    checkPassword(password);
    await whenLoaded();
    const { data } = await c.auth.getSession();
    const s = data.session;
    if (s && !toUser(s).isGuest)
        throw new AuthFailure('Du bist bereits angemeldet.');
    const taken = (err) => isUsernameTaken(err) ? new AuthFailure(MSG.usernameTaken, { code: 'username_taken' }) : fail(err);
    if (s) {
        const { data: d, error } = await c.auth.updateUser({ email: toEmail(u), password });
        if (error || !d.user)
            throw taken(error);
    }
    else {
        const { data: d, error } = await c.auth.signUp({ email: toEmail(u), password });
        if (error)
            throw taken(error);
        if (d?.session)
            session = d.session;
    }
    // updateUser does not always refresh the cached session's user; refresh so is_anonymous=false (and the
    // username claim) is visible
    await refresh(c);
    try {
        await setRecoveryEmail(password, e);
    }
    catch (err) {
        const why = err instanceof AuthFailure ? err.message : MSG.unknown;
        throw new AuthFailure(`Konto erstellt, aber die E-Mail-Adresse konnte nicht gespeichert werden: ${why} Bitte unter Konto erneut eintragen.`, { accountCreated: true, code: err instanceof AuthFailure ? err.code : undefined });
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
    const { data: signedIn, error } = await c.auth.signInWithPassword({ email: toEmail(u), password });
    if (signedIn?.session)
        session = signedIn.session;
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
 * - Guests: no argument.
 * - Password accounts: the password (checked server-side).
 * - Google accounts: `{ confirm: username }` (or the username as string). The sign-in must be fresh (at most
 *   10 minutes old); otherwise the AuthFailure has `code = 'reauth_required'` → reauthWithGoogle().
 * Running matches count as lost.
 */
export async function deleteAccount(passwordOrConfirm) {
    const c = getClient();
    await whenLoaded();
    const me = currentUser();
    if (!me)
        return;
    let body = {};
    if (me.provider === 'google') {
        const confirm = (typeof passwordOrConfirm === 'string' ? passwordOrConfirm : passwordOrConfirm?.confirm ?? '').trim().toLowerCase();
        if (me.username) {
            if (confirm !== me.username)
                throw new AuthFailure('Der Benutzername stimmt nicht überein.', { code: 'confirm_mismatch' });
            body = { confirm };
        }
    }
    else if (!me.isGuest) {
        const password = typeof passwordOrConfirm === 'string' ? passwordOrConfirm : '';
        if (!password)
            throw new AuthFailure(MSG.wrongPassword);
        body = { password };
    }
    // the server verifies password / confirmation; running matches are scored as a loss before deletion
    const { error } = await c.functions.invoke('delete-account', { body });
    if (error) {
        const info = await functionErrorInfo(error);
        if (info === null)
            throw new AuthFailure(MSG.network);
        if (info.code === 'wrong_password')
            throw new AuthFailure(MSG.wrongPassword, { code: info.code });
        if (info.code === 'rate_limited')
            throw new AuthFailure(MSG.rateLimited, { code: info.code });
        if (info.code === 'reauth_required')
            throw new AuthFailure(info.message ?? MSG.reauthRequired, { code: info.code });
        if (info.code === 'confirm_mismatch' || info.code === 'username_mismatch') {
            throw new AuthFailure('Der Benutzername stimmt nicht überein.', { code: 'confirm_mismatch' });
        }
        throw new AuthFailure('Löschen fehlgeschlagen. Bitte erneut versuchen.', { code: info.code });
    }
    await c.auth.signOut({ scope: 'local' });
}
/**
 * Chooses the username of a signed-in account that has none yet (Google accounts after the first sign-in).
 * Edge Function `set-username`, then refreshSession() so `app_metadata.username` is in the JWT.
 */
export async function setUsername(username) {
    const c = getClient();
    const u = normalizeUsername(username);
    await whenLoaded();
    const me = currentUser();
    if (!me || me.isGuest)
        throw new AuthFailure(MSG.notSignedIn);
    if (me.username)
        throw new AuthFailure('Für dieses Konto ist bereits ein Benutzername festgelegt.');
    await invoke('set-username', { username: u }, 'Speichern fehlgeschlagen. Bitte erneut versuchen.', {
        username_taken: MSG.usernameTaken,
    });
    await refresh(c);
    return currentUser();
}
const pendingKey = () => (clientConfig ? storageKey(clientConfig) : STORAGE_KEY) + '-oauth';
const PENDING_TTL = 30 * 60 * 1000;
function savePending(p) {
    try {
        sessionStorage.setItem(pendingKey(), JSON.stringify({ ...p, at: Date.now() }));
    }
    catch {
        /* no sessionStorage: the guest is simply not cleaned up */
    }
}
function takePending() {
    try {
        const raw = sessionStorage.getItem(pendingKey());
        sessionStorage.removeItem(pendingKey());
        const p = raw ? JSON.parse(raw) : null;
        if (!p || typeof p.at !== 'number' || Date.now() - p.at > PENDING_TTL)
            return null;
        if (p.mode !== 'link' && p.mode !== 'signin' && p.mode !== 'reauth')
            return null;
        return p;
    }
    catch {
        return null;
    }
}
/** `https://yezun.de/konto/?return=<safe>` – query, not hash, so GoTrue can append `code`. */
function oauthRedirect(returnTo) {
    const base = new URL(accountBase().split('#')[0], currentHref());
    base.search = '';
    const safe = safeReturnUrl(returnTo, currentOrigin());
    if (safe)
        base.searchParams.set('return', safe);
    return base.href;
}
const isTransient = (e) => !!e && (e.status === 429 || e.code === 'over_request_rate_limit' || e.name === 'AuthRetryableFetchError' || e.status === 0);
/** signInWithOAuth; a current guest is remembered so handleOAuthReturn() can delete it afterwards. */
async function oauthSignIn(c, returnTo, mode, guest) {
    const g = guest && toUser(guest).isGuest ? guest : null;
    savePending(g ? { mode, guestId: g.user.id, guestToken: g.access_token } : { mode });
    const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: oauthRedirect(returnTo) } });
    if (error) {
        takePending();
        throw fail(error, MSG.googleFailed);
    }
}
/**
 * Signs in with Google (redirects the browser to Google, back to the account page with `?code`; the account page
 * calls handleOAuthReturn()). A current guest is linked to the Google identity (same user id: rating and data are
 * kept). If the Google identity already belongs to another account, or there is no session, it signs in normally;
 * the abandoned guest is then deleted after the redirect, like login() does.
 */
export async function signInWithGoogle(returnTo) {
    const c = getClient();
    await whenLoaded();
    const s = (await c.auth.getSession()).data.session;
    const me = toUser(s);
    if (me && !me.isGuest)
        throw new AuthFailure('Du bist bereits angemeldet.');
    if (s && me?.isGuest) {
        savePending({ mode: 'link' });
        const { error } = await c.auth.linkIdentity({ provider: 'google', options: { redirectTo: oauthRedirect(returnTo) } });
        if (!error)
            return;
        takePending();
        if (isTransient(error))
            throw fail(error, MSG.googleFailed);
        // e.g. identity_already_exists / manual_linking_disabled: sign in to the Google account instead
    }
    await oauthSignIn(c, returnTo, 'signin', s);
}
/** Fresh Google sign-in of the current Google account (needed by deleteAccount() after 10 minutes). */
export async function reauthWithGoogle(returnTo) {
    const c = getClient();
    await whenLoaded();
    if (currentUser()?.provider !== 'google')
        throw new AuthFailure('Nur für Google-Konten möglich.');
    await oauthSignIn(c, returnTo, 'reauth', null);
}
/** True when this page load is the redirect back from an OAuth provider (`?code=…` or an OAuth error). */
export function isOAuthReturn() {
    init();
    return callback !== null;
}
function oauthErrorMessage(cb) {
    switch (cb.errorCode ?? cb.error) {
        case 'access_denied':
            return 'Die Anmeldung mit Google wurde abgebrochen.';
        case 'identity_already_exists':
            return 'Dieses Google-Konto gehört bereits zu einem anderen Konto.';
        case 'signup_disabled':
        case 'provider_disabled':
            return 'Anmeldung ist derzeit deaktiviert.';
        case 'flow_state_expired':
        case 'flow_state_not_found':
        case 'bad_code_verifier':
            return 'Die Anmeldung ist abgelaufen. Bitte erneut versuchen.';
    }
    return MSG.googleFailed;
}
/**
 * Finishes an OAuth redirect (call once on the account page, after isOAuthReturn()). supabase-js has already
 * exchanged `?code` for a session; this deletes an abandoned guest, falls back from a failed guest link to a normal
 * Google sign-in (another redirect), and reports the outcome. Returns null when the page load was no OAuth return.
 * It does not touch the URL: the caller removes `code` / `error*` / `return`.
 */
export async function handleOAuthReturn() {
    const c = getClient();
    await whenLoaded();
    const cb = callback;
    if (!cb)
        return null;
    callback = null;
    const pending = takePending();
    const returnTo = safeReturnUrl(cb.returnParam, currentOrigin());
    if (cb.error || cb.errorCode) {
        if (cb.errorCode === 'identity_already_exists' && pending?.mode === 'link') {
            // the Google identity already has an account: sign in to it; the guest is deleted afterwards
            const s = (await c.auth.getSession()).data.session;
            try {
                await oauthSignIn(c, returnTo, 'signin', s);
            }
            catch (e) {
                return { status: 'error', message: e instanceof AuthFailure ? e.message : MSG.googleFailed, returnTo };
            }
            return { status: 'redirecting', returnTo };
        }
        return { status: 'error', message: oauthErrorMessage(cb), returnTo };
    }
    const me = currentUser();
    if (!me || me.isGuest)
        return { status: 'error', message: MSG.googleFailed, returnTo };
    if (pending?.guestToken && pending.guestId !== me.id) {
        c.functions
            .invoke('delete-account', { body: {}, headers: { Authorization: `Bearer ${pending.guestToken}` } })
            .catch(() => { });
    }
    return { status: 'signed_in', user: me, mode: pending?.mode ?? 'signin', returnTo };
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
    const me = currentUser();
    if (!me || me.isGuest)
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
/**
 * Confirms a recovery address with the token from the confirmation link. Afterwards the session is refreshed, so a
 * signed-in, unverified account becomes `status 'active'` right away (the link also works without a session).
 */
export async function verifyRecoveryEmail(token) {
    if (typeof token !== 'string' || !token.trim())
        throw new AuthFailure(MSG.badLink);
    await invoke('recovery-email-verify', { token: token.trim() }, 'Bestätigung fehlgeschlagen. Bitte erneut versuchen.');
    if (session && !toUser(session)?.isGuest)
        await refresh(getClient()).catch(() => { });
}
/**
 * Sends the confirmation link again to the stored, not yet confirmed address (`recovery-email-set` with
 * `{ resend: true }`, no password, rate-limited server-side).
 */
export async function resendVerification() {
    getClient();
    await whenLoaded();
    requireAccount();
    await invoke('recovery-email-set', { resend: true }, 'Senden fehlgeschlagen. Bitte erneut versuchen.');
}
/** Reloads the signed-in user from the server (e.g. after the email was confirmed in another tab). */
export async function refreshUser() {
    const c = getClient();
    await whenLoaded();
    if (!session)
        return null;
    const { data, error } = await c.auth.refreshSession();
    if (error)
        throw fail(error);
    if (data?.session)
        session = data.session;
    return currentUser();
}
