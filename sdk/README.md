# `@yezun/konto` – Client-SDK

Gemeinsames Login für alle Seiten auf `https://yezun.de/` (ein Supabase-Projekt, eine Sitzung).
Nachfolger von xox `src/auth/` – gleiches Verhalten, gleiche deutschen Meldungen, gleicher
`localStorage`-Key `yezun-games-auth`. Framework-frei, einzige Abhängigkeit `@supabase/supabase-js`.

Quelle: `sdk/src/` · Build: `sdk/dist/` (**wird committet**, damit die Git-Dependency ohne Build-Schritt funktioniert;
`npm run build:sdk` nach jeder Änderung an `sdk/src`, CI prüft das mit `npm run check:sdk`).

## API

```ts
import {
  configure, isConfigured, getClient, ready, ensureSession, currentUser, isGuest, onAuthChange,
  register, login, logout, changePassword, deleteAccount, dropDeadSession,
  signInWithGoogle, reauthWithGoogle, isOAuthReturn, handleOAuthReturn, setUsername,
  resendVerification, refreshUser,
  loginUrl, accountUrl, safeReturnUrl,
  setRecoveryEmail, removeRecoveryEmail, getRecoveryEmailStatus,
  requestPasswordReset, confirmPasswordReset, verifyRecoveryEmail,
  AuthFailure, NOT_CONFIGURED, USERNAME_RE, MIN_PASSWORD, MAX_PASSWORD,
} from '@yezun/konto';

configure({ url, anonKey });      // optional, siehe unten; vor allem anderen aufrufen
await ready;                      // gespeicherte Sitzung geladen → currentUser() verlässlich
await ensureSession();            // Gast-Sitzung (anonym), falls noch keine existiert
currentUser();                    // { id, username | null, isGuest, provider, needsUsername, emailVerified, status } | null
onAuthChange((u) => ...);         // sofort + bei jedem An-/Abmelden; gibt unsubscribe zurück
await register('name', 'pw', 'ich@example.org'); // E-Mail Pflicht; Gast wird in-place aufgewertet (gleiche user id),
                                  // danach refreshSession() + Bestätigungslink; Ergebnis: status 'unverified'
await login('name', 'pw');        // wechselt das Konto; der vorherige Gast wird gelöscht
await logout();                   // nur dieses Gerät
await changePassword('alt', 'neu'); // serverseitig geprüft; meldet alle anderen Geräte ab
await deleteAccount('pw');        // Passwort-Konten: Passwort; Gäste: nichts
await deleteAccount({ confirm: 'name' }); // Google-Konten: Benutzername; err.code 'reauth_required' → reauthWithGoogle()

await signInWithGoogle(returnTo); // Redirect zu Google; Gast wird per linkIdentity zum Google-Konto (Daten bleiben),
                                  // gehört das Google-Konto schon jemandem: signInWithOAuth, der Gast wird danach gelöscht
await handleOAuthReturn();        // nur Konto-Seite: nach dem Redirect zurück (?code) → signed_in | redirecting | error
await setUsername('name');        // Google-Konten ohne Namen (needsUsername), danach refreshSession()
await resendVerification();       // Bestätigungslink erneut an die offene Adresse
await refreshUser();              // Sitzung neu laden (z. B. nach Bestätigung in einem anderen Tab)
getClient().from('…');            // der gemeinsame supabase-js-Client

loginUrl();                       // https://yezun.de/konto/#/login?return=<aktuelle Seite>
accountUrl('https://yezun.de/xox/'); // https://yezun.de/konto/#/konto?return=…
safeReturnUrl(raw, location.origin); // string | null – nur https://yezun.de/… bzw. gleicher Origin

await setRecoveryEmail('pw', 'ich@example.org'); // speichert unbestätigt + schickt Bestätigungslink
await removeRecoveryEmail('pw');
await getRecoveryEmailStatus();   // { email: 'ic***@example.org' | null, verified }
await requestPasswordReset('name');            // antwortet immer gleich (keine Enumeration)
const { username } = await confirmPasswordReset(token, 'neu'); // danach login(username, 'neu') möglich
await verifyRecoveryEmail(token);
```

### Kontostatus

| `status`     | Bedeutung |
| ------------ | --------- |
| `guest`      | anonyme Sitzung (`isGuest`) |
| `unverified` | registriert, E-Mail-Link noch nicht geöffnet (`app_metadata.email_verified === false`) |
| `active`     | nutzbares Konto (bestätigt, Google, oder Bestandskonto ohne bzw. mit `legacy`-Claim) |

**Nur `status === 'active'` ist ein nutzbares Konto.** Bei `unverified` kontogebundene Funktionen wie für einen Gast
behandeln und „Bitte bestätige zuerst deine E-Mail-Adresse“ mit Link auf `accountUrl()` zeigen.
`username` kommt aus `app_metadata.username`, sonst aus der künstlichen Adresse; `provider` ist
`'password' | 'google' | 'anonymous'`; `needsUsername = !isGuest && !username`.

### Google

Client mit `flowType: 'pkce'` und `detectSessionInUrl: true`. Ziel des Redirects ist immer die Konto-Seite
(`https://yezun.de/konto/?return=<sicher>`, muss in Supabase unter *Redirect URLs* stehen); dort tauscht supabase-js
den `code` und `handleOAuthReturn()` räumt auf (Gast löschen, Fallback, Ergebnis). Der Gast-Token für das Löschen
liegt dafür kurz in `sessionStorage`. Ein fehlgeschlagener Link (`identity_already_exists`) wird erst nach dem
Redirect sichtbar; dann startet `handleOAuthReturn()` die normale Google-Anmeldung (zweiter Redirect).

Jeder Fehler ist ein `AuthFailure` mit deutscher, anzeigbarer `message` (bei Bedarf `code`, z. B.
`'reauth_required'`, `'username_taken'`; bei `register()` `accountCreated = true`, wenn nur das Speichern der E-Mail scheiterte). Bei Edge-Function-Fehlern wird die
deutsche `message` des Servers bevorzugt, sonst der `error`-Code übersetzt. Ein fehlgeschlagener Login sagt immer
„Benutzername oder Passwort falsch.“.

Backend: `recovery-email-set|remove|verify`, `password-reset-request|confirm`, `delete-account` (Edge Functions),
`konto_recovery_email_status()` (RPC). Siehe `supabase/` und `CONTRACT.md`.

## Konfiguration

Der Client wird erst beim ersten Gebrauch erzeugt. Quelle der Konfiguration, in dieser Reihenfolge:

1. `configure({ url, anonKey, accountUrl?, devAuthSlot? })` – funktioniert mit jedem Bundler.
2. `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` – nur wenn das Projekt mit **Vite** baut
   (Vite 8 ersetzt die Werte auch im vorgebauten Paket, in `vite build` und im Dev-Server). Andere Bundler
   ersetzen `import.meta.env` nicht; dann gilt das Paket als nicht konfiguriert → `configure()` verwenden.

Ohne Konfiguration ist `isConfigured()` `false` und jede Funktion wirft `AuthFailure('Online-Modus nicht konfiguriert')`.

`configure()` muss synchron im Einstiegsmodul laufen, bevor eine andere SDK-Funktion aufgerufen wird.
Ein zweiter Aufruf mit anderen Werten nach der ersten Nutzung wirft.

## Regeln

- Benutzername `^[a-z0-9_]{3,20}$` (Eingabe wird kleingeschrieben), Passwort 8–72 Zeichen, E-Mail bei der Registrierung Pflicht.
- Der Benutzername wird zur künstlichen Adresse `<name>@users.yezun-games.invalid` (RFC 2606, nie zustellbar).
  Die echte Wiederherstellungs-E-Mail liegt **nicht** in `auth.users`, sondern serverseitig in
  `konto_recovery_emails` (kein Client-Zugriff).
- Passwort-Reset nur mit **bestätigter** Wiederherstellungs-E-Mail (nur Passwort-Konten). Google-Konten haben weder
  Passwort noch Recovery-E-Mail.
- `return`-Parameter der Konto-Seite: nur `https://yezun.de/…` (Standard-Port, ohne Zugangsdaten), derselbe Origin
  oder – wenn die Seite selbst auf localhost läuft – localhost. Kein Open Redirect.

## Sicherheit

- **Gemeinsamer `localStorage`:** Alle Seiten auf yezun.de teilen den Origin und damit das Sitzungs-Token.
  Eine XSS-Lücke in irgendeiner Seite gefährdet alle Konten. Nutzerdaten nie in `innerHTML` – nur
  `textContent` / `createElement`.
- Passwort ändern (`changePassword()`, Edge Function `password-change`), Kontolöschen und Recovery-E-Mail
  setzen/entfernen prüfen das aktuelle Passwort **serverseitig** (höchstens 5 Fehlversuche pro Konto in 15 Minuten).
  Nach einer Passwortänderung werden alle anderen Sitzungen beendet.
- Grenze: Solange im Dashboard "Secure password change" aus ist (nötig für das Gast-Upgrade, siehe
  `supabase/README.md`), kann ein gestohlenes Access-Token das Passwort trotzdem direkt bei GoTrue
  (`PUT /auth/v1/user`) ändern. Die serverseitige Prüfung schützt nur die Wege über die Edge Functions.

## Zwei Sitzungen lokal testen

`?authslot=2` (vor dem `#`) gibt dem Tab den eigenen Key `yezun-games-auth-2`. Aktiv nur, wenn
`import.meta.env.DEV` wahr ist (Vite-Dev) oder `configure({ …, devAuthSlot: true })`.
