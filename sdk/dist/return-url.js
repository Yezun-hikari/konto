// Validation of the `return` parameter of the account page (no open redirect). Pure, unit-tested.
/** Production origin of all sites. */
export const PROD_ORIGIN = 'https://yezun.de';
/** Default address of the account page. */
export const DEFAULT_ACCOUNT_URL = 'https://yezun.de/konto/';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/**
 * Returns the absolute URL if `raw` may be used as a redirect target, else null.
 * Allowed: https://yezun.de/… (default port, no credentials) and URLs on `currentOrigin`.
 * When the page itself runs on localhost (dev), any http(s)://localhost:<port>/… is allowed too.
 * Relative values are resolved against `currentOrigin`.
 */
export function safeReturnUrl(raw, currentOrigin) {
    if (typeof raw !== 'string')
        return null;
    const value = raw.trim();
    if (!value || value.length > 2048)
        return null;
    // control characters / backslashes are a classic way to confuse URL parsers
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f\\]/.test(value))
        return null;
    let base;
    try {
        base = currentOrigin ? new URL(currentOrigin) : undefined;
    }
    catch {
        base = undefined;
    }
    let u;
    try {
        u = base ? new URL(value, base) : new URL(value);
    }
    catch {
        return null;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:')
        return null;
    if (u.username || u.password)
        return null;
    if (u.origin === PROD_ORIGIN)
        return u.href;
    if (base && (base.protocol === 'https:' || base.protocol === 'http:')) {
        if (u.origin === base.origin)
            return u.href;
        if (LOCAL_HOSTS.has(base.hostname) && LOCAL_HOSTS.has(u.hostname))
            return u.href;
    }
    return null;
}
/** `<accountBase>#/<route>` plus `?return=<encoded>` when `returnTo` is a safe URL. */
export function buildAccountUrl(accountBase, route, returnTo, currentOrigin) {
    const base = accountBase.split('#')[0];
    const safe = safeReturnUrl(returnTo, currentOrigin);
    return `${base}#/${route}` + (safe ? `?return=${encodeURIComponent(safe)}` : '');
}
