export declare const USERNAME_RE: RegExp;
export declare const MIN_PASSWORD = 8;
/** bcrypt only uses the first 72 bytes. */
export declare const MAX_PASSWORD = 72;
/** RFC 2606 reserved TLD: such an address can never be a real mailbox. */
export declare const EMAIL_DOMAIN = "users.yezun-games.invalid";
/** Lowercases and validates a username for registration. Throws AuthFailure. */
export declare function normalizeUsername(username: string): string;
/** Password length rules (8–72). Throws AuthFailure. */
export declare function checkPassword(pw: string): void;
/** Synthetic login address for a (normalized) username. */
export declare const toEmail: (username: string) => string;
/** Trims and validates a real (recovery) email address. Throws AuthFailure. The server re-checks. */
export declare function normalizeRecoveryEmail(email: string): string;
