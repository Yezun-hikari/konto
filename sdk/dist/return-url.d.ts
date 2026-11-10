/** Production origin of all sites. */
export declare const PROD_ORIGIN = "https://yezun.de";
/** Default address of the account page. */
export declare const DEFAULT_ACCOUNT_URL = "https://yezun.de/konto/";
/**
 * Returns the absolute URL if `raw` may be used as a redirect target, else null.
 * Allowed: https://yezun.de/… (default port, no credentials) and URLs on `currentOrigin`.
 * When the page itself runs on localhost (dev), any http(s)://localhost:<port>/… is allowed too.
 * Relative values are resolved against `currentOrigin`.
 */
export declare function safeReturnUrl(raw: string | null | undefined, currentOrigin?: string): string | null;
/** `<accountBase>#/<route>` plus `?return=<encoded>` when `returnTo` is a safe URL. */
export declare function buildAccountUrl(accountBase: string, route: string, returnTo: string | null | undefined, currentOrigin?: string): string;
