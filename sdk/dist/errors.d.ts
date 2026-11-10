import { type AuthError } from '@supabase/supabase-js';
export declare const NOT_CONFIGURED = "Online-Modus nicht konfiguriert";
/** Every SDK function rejects with this; `message` is German and safe to show. */
export declare class AuthFailure extends Error {
    /** Machine-readable reason where the caller may react to it (e.g. 'reauth_required', 'username_taken'). */
    code?: string;
    /** register(): true when the account exists although a later step (storing the email) failed. */
    accountCreated?: boolean;
    constructor(message: string, opts?: {
        code?: string;
        accountCreated?: boolean;
    });
}
export declare const MSG: {
    readonly unknown: 'Unbekannter Fehler. Bitte erneut versuchen.';
    readonly rateLimited: 'Zu viele Versuche. Bitte später erneut.';
    readonly network: 'Keine Verbindung zum Server.';
    readonly wrongPassword: 'Aktuelles Passwort ist falsch.';
    readonly badLink: 'Der Link ist ungültig oder abgelaufen.';
    readonly badEmail: 'Bitte eine gültige E-Mail-Adresse eingeben.';
    readonly notSignedIn: 'Nicht angemeldet.';
    readonly usernameTaken: 'Dieser Benutzername ist schon vergeben.';
    readonly reauthRequired: 'Bitte melde dich zur Bestätigung erneut mit Google an und versuche es dann noch einmal.';
    readonly googleFailed: 'Anmeldung mit Google fehlgeschlagen. Bitte erneut versuchen.';
};
/** Maps a GoTrue error (supabase.auth.*) to an AuthFailure. Identical to xox src/auth. */
export declare function fail(e: AuthError | null | undefined, fallback?: string): AuthFailure;
export interface FunctionErrorInfo {
    code: string;
    /** German, user-presentable text sent by the server (`{ error, message }`), if any. */
    message: string | null;
}
/** Reads `{ error, message? }` of a failed `functions.invoke`; null for network/relay errors. */
export declare function functionErrorInfo(error: unknown): Promise<FunctionErrorInfo | null>;
/** Only the `error` code of a failed `functions.invoke`; null for network/relay errors. */
export declare const functionErrorCode: (error: unknown) => Promise<string | null>;
/**
 * Maps the error of a failed `functions.invoke` to an AuthFailure.
 * Order: `overrides[code]`, the server's own German `message`, the SDK's message for the code, `fallback`.
 */
export declare function functionFailure(error: unknown, fallback?: string, overrides?: Record<string, string>): Promise<AuthFailure>;
