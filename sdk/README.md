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
  loginUrl, accountUrl, safeReturnUrl,
  setRecoveryEmail, removeRecoveryEmail, getRecoveryEmailStatus,
  requestPasswordReset, confirmPasswordReset, verifyRecoveryEmail,
  AuthFailure, NOT_CONFIGURED, USERNAME_RE, MIN_PASSWORD, MAX_PASSWORD,
} from '@yezun/konto';

configure({ url, anonKey });      // optional, siehe unten; vor allem anderen aufrufen
await ready;                      // gespeicherte Sitzung geladen → currentUser() verlässlich
await ensureSession();            // Gast-Sitzung (anonym), falls noch keine existiert
currentUser();                    // { id, username | null, isGuest } | null
onAuthChange((u) => ...);         // sofort + bei jedem An-/Abmelden; gibt unsubscribe zurück
await register('name', 'pw');     // Gast wird in-place aufgewertet (gleiche user id), danach refreshSession()
await login('name', 'pw');        // wechselt das Konto; der vorherige Gast wird gelöscht
await logout();                   // nur dieses Gerät
await changePassword('alt', 'neu'); // serverseitig geprüft; meldet alle anderen Geräte ab
await deleteAccount('pw');        // Passwort für registrierte Konten, keins für Gäste
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

Jeder Fehler ist ein `AuthFailure` mit deutscher, anzeigbarer `message`. Bei Edge-Function-Fehlern wird die
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
3. Auf **https://yezun.de** ohne 1. und 2.: die öffentlichen Standardwerte des gemeinsamen Projekts
   (`YEZUN_DEFAULT_CONFIG`). Ein neues Projekt auf yezun.de braucht damit gar keine Konfiguration.

Ohne Konfiguration ist `isConfigured()` `false` und jede Funktion wirft `AuthFailure('Online-Modus nicht konfiguriert')`.

`configure()` muss synchron im Einstiegsmodul laufen, bevor eine andere SDK-Funktion aufgerufen wird.
Ein zweiter Aufruf mit anderen Werten nach der ersten Nutzung wirft.

## Regeln

- Benutzername `^[a-z0-9_]{3,20}$` (Eingabe wird kleingeschrieben), Passwort 8–72 Zeichen.
- Der Benutzername wird zur künstlichen Adresse `<name>@users.yezun-games.invalid` (RFC 2606, nie zustellbar).
  Die echte Wiederherstellungs-E-Mail liegt **nicht** in `auth.users`, sondern serverseitig in
  `konto_recovery_emails` (kein Client-Zugriff).
- Passwort-Reset nur mit **bestätigter** Wiederherstellungs-E-Mail. Ohne sie: kein Reset. Vor der Registrierung sagen.
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
