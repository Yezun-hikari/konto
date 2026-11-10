# Vertrag: Pflicht-E-Mail bei Registrierung + Google-Login

Branch `claude/konto-email-google` (Basis: `claude/konto-ui`). Backend-Agent besitzt `supabase/**`,
Frontend-Agent besitzt `sdk/**` und `app/**`. Niemand committet, der Orchestrator committet.

## Benutzernamen (einheitlich für alle Konten)
- Neue Tabelle `public.konto_usernames(user_id uuid pk → auth.users on delete cascade, username text unique
  check (username ~ '^[a-z0-9_]{3,20}$'), created_at)`. Keine Client-Grants.
- Migration befüllt sie aus allen bestehenden synthetischen E-Mails (`<name>@users.yezun-games.invalid`).
- Trigger `BEFORE INSERT OR UPDATE OF email ON auth.users`: bei synthetischer E-Mail wird der Name in
  `konto_usernames` eingetragen (oder aktualisiert). Ist der Name schon von einem ANDEREN Nutzer belegt →
  `raise exception 'username_taken'`. Außerdem setzt der Trigger
  `new.raw_app_meta_data = raw_app_meta_data || {"username": <name>}`.
- Damit steht der Name für JEDES Konto im JWT unter `app_metadata.username`.

## Google-Konten
- `enforce_synthetic_email` wird angepasst: Echte E-Mails sind erlaubt, wenn
  `new.raw_app_meta_data->'providers'` den Eintrag `"google"` enthält oder `->>'provider' = 'google'`.
  Für alle anderen gilt weiter nur die synthetische Adresse.
- Google-Konten haben anfangs keinen Benutzernamen. Neue Edge Function `set-username` (verify_jwt=true),
  Body `{username}`:
  - nur für nicht-anonyme Nutzer ohne `app_metadata.username`;
  - Name prüfen, in `konto_usernames` eintragen (Name belegt → 409 mit `{error:'username_taken'}`);
  - per Admin-API `app_metadata.username` setzen;
  - Antwort `{username}`.
- `delete-account`: Nutzer ohne Passwort-Identität (keine `email`-Identität, nur `google`) müssen kein
  Passwort angeben. Stattdessen muss die Anmeldung frisch sein: JWT-Claim `iat` höchstens 10 Minuten alt.
  Sonst 401 `{error:'reauth_required'}` mit deutscher `message`. Body darf dann `{confirm: <username>}`
  enthalten, der Server prüft die Übereinstimmung.
- Recovery-E-Mail und Passwort-Reset gelten nur für Passwort-Konten. `recovery-email-set` gibt für
  Google-Konten 400 `{error:'not_password_account'}` zurück.

## SDK (`@yezun/konto`)
- Client mit `flowType: 'pkce'`, `detectSessionInUrl: true`.
- `AuthUser = { id, username: string | null, isGuest, provider: 'password' | 'google' | 'anonymous', needsUsername: boolean }`.
  - `username` kommt aus `app_metadata.username`, sonst aus der synthetischen E-Mail.
  - `needsUsername = !isGuest && !username`.
- `register(username, password, email)`: E-Mail ist Pflicht.
  1. E-Mail clientseitig prüfen, sonst `AuthFailure('Bitte eine gültige E-Mail-Adresse angeben.')`.
  2. Gast-Upgrade wie bisher, danach `refreshSession`.
  3. `setRecoveryEmail(password, email)` aufrufen. Scheitert dieser Schritt, bleibt das Konto trotzdem
     bestehen. Dann `AuthFailure` mit der Meldung „Konto erstellt, aber die E-Mail-Adresse konnte nicht
     gespeichert werden: … Bitte unter Konto erneut eintragen.“. Erkennbar über `err.accountCreated = true`.
  4. Datenbankfehler mit `username_taken` → „Dieser Benutzername ist schon vergeben.“
- `signInWithGoogle(returnTo?: string)`:
  - Bei aktueller Gast-Session `linkIdentity({provider:'google', options:{redirectTo}})`. Der Gast wird so
    zum Google-Konto, Elo und Daten bleiben erhalten.
  - Scheitert das, weil die Google-Identität schon zu einem anderen Konto gehört, oder ohne Session:
    `signInWithOAuth({provider:'google', options:{redirectTo}})`.
  - `redirectTo` ist `https://yezun.de/konto/?return=<sicher>` (Query, nicht Hash). Den alten Gast löscht
    nach erfolgreicher Anmeldung derselbe Mechanismus wie bei `login()`: Gast-Token vor dem Redirect in
    sessionStorage merken.
- `setUsername(username)` ruft `set-username` auf und danach `refreshSession`.
- `deleteAccount(passwordOrConfirm)`:
  - Passwort-Konten: wie bisher.
  - Google-Konten: `{confirm: username}`. Bei `reauth_required` erscheint die deutsche Meldung, und es
    gibt die Hilfsfunktion `reauthWithGoogle()`.

## Konto-Seite (`app/`)
- **Registrieren:** Felder E-Mail, Benutzername, Passwort und Passwort wiederholen, alle Pflicht. Darunter
  der Hinweis, dass ein Bestätigungslink kommt. Danach erscheint „Bitte bestätige deine E-Mail-Adresse“
  auf der Konto-Seite.
- **Anmelden und Registrieren:** jeweils ein Button „Mit Google anmelden“, als schlichter Rahmen-Button
  mit Text. Kein buntes Logo-Gewimmel; das kleine offizielle „G“ ist erlaubt.
- **Zurück vom OAuth-Redirect** (`?code=…`): Session übernehmen, `?code` aus der URL entfernen.
  - Bei `needsUsername` folgt die Route `#/benutzername` mit dem Formular „Wähle deinen Benutzernamen“.
  - Danach geht es weiter zum `return`-Ziel.
- **Konto-Ansicht für Google-Konten:** Anzeige „Angemeldet mit Google als <username>“. Die Abschnitte
  Passwort und Recovery-E-Mail entfallen. „Konto löschen“ funktioniert mit Eingabe des Benutzernamens und
  bei Bedarf einer erneuten Google-Anmeldung.
- **Bestehende Passwort-Konten ohne bestätigte Recovery-E-Mail:** deutlicher, ruhiger Hinweis oben
  „Hinterlege eine E-Mail-Adresse, damit du dein Passwort zurücksetzen kannst“.
- Gestaltung wie auf dem Branch `claude/konto-ui`, also ruhig, mit feinen Linien.

## NACHTRAG: E-Mail muss bestätigt sein, bevor das Konto benutzt werden kann
- Neuer Kontostatus im JWT: `app_metadata.email_verified` (boolean).
  - `recovery-email-verify` setzt bei Erfolg per Admin-API `email_verified: true`. Danach muss der Client
    `refreshSession()` aufrufen.
  - Google-Konten bekommen `email_verified: true` automatisch. Das setzt der Trigger bzw. `set-username`,
    weil Google die Adresse schon bestätigt hat.
  - **Bestandskonten** (Passwort-Konten, die vor dieser Migration existieren) bekommen
    `app_metadata.legacy: true` und `email_verified: true`. Sie werden nicht gesperrt, sehen aber den Hinweis,
    eine E-Mail nachzutragen.
  - Ein neu registriertes Passwort-Konto hat `email_verified: false`, bis der Link angeklickt wurde.
  - Ändert jemand später seine Recovery-Adresse, bleibt `email_verified` true. Das Konto ist ja schon
    bestätigt, nur die neue Adresse ist noch offen.
- Serverseitig erzwingen:
  - RLS der Handschrift-Tabellen verlangt zusätzlich `(auth.jwt()->'app_metadata'->>'email_verified')::boolean is true`.
  - `set-username` und `password-change` verlangen ebenfalls ein bestätigtes Konto (403 `{error:'email_unverified'}`).
  - `recovery-email-set`, `recovery-email-verify` und `delete-account` bleiben ohne Bestätigung erlaubt.
    Damit kann man die Adresse korrigieren, den Link neu senden oder das Konto löschen.
- SDK: `AuthUser.status: 'guest' | 'unverified' | 'active'`, dazu `emailVerified: boolean`.
  - `isGuest` bleibt bestehen. Für Apps gilt: Nur `status === 'active'` ist ein nutzbares Konto.
    Bei `unverified` behandeln Apps den Nutzer bei kontogebundenen Funktionen wie einen Gast und zeigen den
    Hinweis „Bitte bestätige zuerst deine E-Mail-Adresse“ mit Link zur Konto-Seite.
  - `register()` endet in `status 'unverified'`. `login()` mit einem unbestätigten Konto ist erlaubt, liefert
    aber `status 'unverified'`.
  - Neue Funktion `resendVerification()`: Sie sendet erneut an die hinterlegte, noch offene Adresse. Dafür
    gibt es einen neuen Body-Modus von `recovery-email-set`, `{resend: true}`, der kein Passwort braucht,
    aber die bestehenden Rate-Limits nutzt.
- Konto-Seite: Ist `status === 'unverified'`, zeigt jede Route außer `#/verify-email` nur die Ansicht
  „Bestätige deine E-Mail-Adresse“: maskierte Adresse, „Link erneut senden“, „Adresse ändern“ (mit
  Passwort), „Abmelden“ und „Konto löschen“. Nach dem Klick auf den Link (`#/verify-email`) folgen
  `refreshSession` und die Weiterleitung zum `return`-Ziel.
