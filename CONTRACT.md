# Konto – interne Schnittstellen (Arbeitsvertrag zwischen Teilprojekten)

Zentrales Konto für alle Seiten auf https://yezun.de/. Dieses Repo heißt `konto` und wird über
GitHub Pages unter https://yezun.de/konto/ ausgeliefert (vite base `/konto/`).
Ein Supabase-Projekt für alle Seiten. Alle Seiten liegen auf demselben Origin und teilen die Session
über localStorage-Key `yezun-games-auth` (NICHT ändern, sonst sind alle Nutzer ausgeloggt).

## Repo-Aufbau
- `supabase/`         ALLE Migrationen + Edge Functions des Projekts (umgezogen aus xox, Timestamps unverändert!)
- `sdk/`              Das Client-SDK (`@yezun/konto`), Nachfolger von xox `src/auth/`. Wird von anderen
                      Projekten als git-Dependency `"@yezun/konto": "github:Yezun-hikari/konto#<tag>"` eingebunden
                      und muss so installierbar sein (gebautes JS + .d.ts, `prepare`-Script oder committed build).
- `app/`              Konto-Webseite (Login, Registrieren, Konto, Passwort ändern/zurücksetzen, Recovery-E-Mail,
                      Konto löschen). Vanilla TS + Vite wie xox. Deutsch. Kein innerHTML mit Nutzerdaten.
- `.github/workflows/` deploy.yml (Pages), supabase.yml (db push + functions deploy), keepalive.yml

## SDK-API (`@yezun/konto`) – abwärtskompatibel zu xox `src/auth/index.ts`, plus:
```ts
// unverändert aus xox: isConfigured, getClient, ready, ensureSession, currentUser, isGuest, onAuthChange,
// register, login, logout, changePassword, deleteAccount, dropDeadSession, AuthFailure, USERNAME_RE, MIN_PASSWORD
configure(opts: { url: string; anonKey: string }): void   // Alternative zu VITE_SUPABASE_* env (für Konsumenten)
loginUrl(returnTo?: string): string        // https://yezun.de/konto/#/login?return=<encoded>
accountUrl(returnTo?: string): string      // https://yezun.de/konto/#/konto?return=<encoded>
// Recovery / Passwort-Reset
setRecoveryEmail(password: string, email: string): Promise<void>   // sendet Bestätigungslink
removeRecoveryEmail(password: string): Promise<void>
getRecoveryEmailStatus(): Promise<{ email: string | null; verified: boolean }>  // via RPC konto_recovery_email_status()
requestPasswordReset(username: string): Promise<void>  // antwortet immer gleich (keine Enumeration)
confirmPasswordReset(token: string, newPassword: string): Promise<{ username: string }>
verifyRecoveryEmail(token: string): Promise<void>
```
`return`-Parameter: nur URLs auf https://yezun.de/ (bzw. localhost im Dev) akzeptieren – kein Open Redirect.

## Edge Functions (neu, verify_jwt wie angegeben)
- `recovery-email-set`      (jwt) body {password, email}  → prüft Passwort serverseitig, speichert pending, mailt Link
- `recovery-email-remove`   (jwt) body {password}
- `password-change`         (jwt) body {password (aktuell), newPassword} → prüft Passwort serverseitig (max. 5 Fehlversuche/15 min/Konto),
                            admin.updateUserById, beendet alle ANDEREN Sitzungen (eigene `session_id` aus dem JWT bleibt)
- `recovery-email-verify`   (no jwt) body {token}
- `password-reset-request`  (no jwt) body {username} → nur wenn verifizierte Recovery-Mail; immer 200 + gleiche Antwort; Rate-Limit
- `password-reset-confirm`  (no jwt) body {token, password} → admin.updateUserById, Token einmalig, 1h gültig
- `delete-account`          bestehend, bleibt; zusätzlich Recovery-Daten weg (Cascade)
Mailversand über Resend HTTP API, Secret `RESEND_API_KEY`, Absender `Yezun Konto <konto@yezun.de>`,
Links auf `https://yezun.de/konto/#/reset?token=…` bzw. `#/verify-email?token=…`. Token nur gehasht (sha256) speichern.
Der Trigger `enforce_synthetic_email` auf auth.users BLEIBT: die echte Mail liegt NICHT in auth.users,
sondern in einer eigenen Tabelle ohne Client-Zugriff.

## Tabellen (neu)
- `konto_recovery_emails`  (user_id pk → auth.users on delete cascade, email, verified_at, created_at) – kein Client-Grant
- `konto_tokens`           (token_hash pk, user_id, kind 'verify_email'|'reset_password', email, expires_at, used_at)
- `handwriting_glyphs`     (user_id → auth.users cascade, char text 1..4 Zeichen, variant smallint 0..2,
                            strokes jsonb (Größe begrenzen), advance real, updated_at; pk(user_id,char,variant));
                            höchstens 500 Zeilen pro Nutzer (Trigger `handwriting_glyphs_quota`)
                            RLS: eigene Zeilen select/insert/update/delete, nur NICHT-anonyme Nutzer
                            (`coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false`), grants für authenticated.
- `handwriting_settings`   (user_id pk cascade, settings jsonb, updated_at) – gleiche RLS
Konvention: Tabellen je Projekt mit Präfix (`xox`-Tabellen bleiben aus Kompatibilität ohne Präfix).
