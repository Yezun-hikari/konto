# Supabase-Backend für alle Seiten auf yezun.de – Einrichtung

Ein Supabase-Projekt (`yezun-games`) für alle Seiten: zentrales Konto (yezun.de/konto), xox, handwriting, …
Dieses Verzeichnis enthält **alle** Migrationen und Edge Functions des Projekts.
Du brauchst: einen GitHub-Account, Node.js (für `npx`) und etwa 20 Minuten.

## Umzug aus xox (2026-11-10)

`supabase/` und die Workflows `supabase.yml` / `keepalive.yml` lagen bisher im Repo `xox` und sind
**unverändert** hierher umgezogen (Migrationsnamen und Timestamps identisch, damit `supabase db push` die
bestehenden Migrationen als bereits angewendet erkennt). Neu hinzugekommen:

- Migration `20261110000000_konto_recovery.sql`: Wiederherstellungs-E-Mail und Passwort-Reset
  (Tabellen `konto_recovery_emails`, `konto_tokens`, Cron-Job `purge-expired-konto-tokens`)
- Migration `20261110010000_handwriting.sql`: Tabellen `handwriting_glyphs`, `handwriting_settings`
- Edge Functions `recovery-email-set`, `recovery-email-remove`, `recovery-email-verify`,
  `password-reset-request`, `password-reset-confirm` (Helfer: `functions/_server/konto.ts`, `functions/_shared/konto.ts`)
- `config.toml`: Auth-URLs auf `/konto/` (xox-URLs bleiben erlaubt), `[functions.*]`-Einträge der neuen Functions

**Ab jetzt deployt nur noch dieses Repo nach Supabase.** Im Repo `xox` müssen `supabase/` und
`.github/workflows/supabase.yml` / `keepalive.yml` entfernt werden (sonst überschreiben sich zwei Repos
gegenseitig die Functions, und `db push` aus xox würde die neuen Migrationen als "remote only" bemängeln).
Die GitHub-Secrets/-Variablen aus Abschnitt 7 werden im Repo `konto` angelegt.

> Hinweis: `functions/_shared/` (Spielregeln, Profanity-Filter, Bot) wird vom xox-Frontend mitbenutzt. Nach dem
> Umzug muss xox diese Dateien selbst behalten (Kopie) – die Edge Functions hier nutzen ihre eigene Kopie.

> **Wichtig zur Sicherheit:** Der `service_role`-Schlüssel ("secret key") und das Datenbank-Passwort
> kommen **niemals** in eine Datei in diesem Repo, nicht in den Chat und nicht in eine GitHub-*Variable*.
> Öffentlich sein dürfen nur die Projekt-URL und der `anon`/"publishable"-Schlüssel.

## 1. Supabase-Projekt anlegen

1. Auf <https://supabase.com> mit GitHub anmelden.
2. **New project** → Name z. B. `yezun-games` (ein Projekt für alle Minispiele), Region **Central EU (Frankfurt)**.
3. Ein starkes **Database Password** erzeugen lassen und in deinem Passwort-Manager speichern
   (wird in Schritt 5 und 6 gebraucht).
4. Warten, bis das Projekt bereit ist.
5. Unter **Project Settings → General** die **Reference ID** notieren (z. B. `abcdefghijklmnop`).
6. Unter **Project Settings → API Keys** notieren:
   - die **Project URL** (`https://<reference-id>.supabase.co`)
   - den **anon / publishable key** (öffentlich, darf ins Frontend)

## 2. Einstellungen im Dashboard (manuell, einmalig)

Diese Einstellungen stehen zwar in `supabase/config.toml`, die Datei gilt aber **nur für die lokale
Entwicklung**. Im gehosteten Projekt musst du sie selbst setzen:

| Wo im Dashboard | Einstellung | Wert |
|---|---|---|
| Authentication → Sign In / Providers | **Allow anonymous sign-ins** | an |
| Authentication → Sign In / Providers → **Email** | Enable Email provider | an |
| Authentication → Sign In / Providers → **Email** | **Confirm email** | **aus** |
| Authentication → Sign In / Providers → **Email** | Secure email change | aus |
| Authentication → Sign In / Providers → **Email** | **Minimum password length** | **8** |
| Authentication → URL Configuration | Site URL | `https://yezun.de/konto/` |
| Authentication → URL Configuration | Redirect URLs | `https://yezun.de/konto/`, `http://localhost:5173/konto/`, `https://yezun.de/xox/`, `http://localhost:5173/xox/` |

### Härtung (Pflicht, einmalig)

| Wo im Dashboard | Einstellung | Wert |
|---|---|---|
| Realtime → Settings | **Allow public access** | **aus**. Folge: Live-Updates per Realtime verbinden sich nicht (Channels sind dann nur privat). Das ist gewollt, die Seite fragt den Spielstand stattdessen alle 3 Sekunden ab. Auf "an" stellen ist nur nötig, wenn Zugriff ohne Wartezeit wichtiger ist als diese Härtung. |
| Database → Extensions | `pg_graphql` | **deaktiviert** (wird nicht gebraucht, vergrößert nur die Angriffsfläche) |
| Database → Extensions | `pg_cron` | **aktiviert** (Migration macht das selbst; nur prüfen) |
| Authentication → Rate Limits | Anonyme Anmeldungen pro Stunde und IP | niedrig, z. B. **30** |

- `pg_cron` löscht täglich (03:17 UTC) Gastkonten, die seit 30 Tagen nicht aktiv waren und keine laufende
  Partie haben. Kontrolle: **Integrations → Cron** zeigt den Job `purge-stale-guests`. Fehlt er (z. B. weil
  `pg_cron` beim `db push` nicht verfügbar war), `pg_cron` aktivieren und im SQL Editor ausführen:
  `select cron.schedule('purge-stale-guests', '17 3 * * *', 'select public.purge_stale_guests()');`
- `pg_cron` löscht stündlich abgelaufene Konto-Links (Job `purge-expired-konto-tokens`). Fehlt der Job:
  `select cron.schedule('purge-expired-konto-tokens', '41 * * * *', 'delete from public.konto_tokens where expires_at < now()');`
- `pg_cron` löscht außerdem stündlich Chat-Nachrichten, die älter als 24 Stunden sind (Job `purge-old-chat-messages`).
  Fehlt der Job, genauso im SQL Editor nachholen:
  `select cron.schedule('purge-old-chat-messages', '23 * * * *', $$delete from public.match_messages where created_at < now() - interval '24 hours'$$);`
- Optional: Authentication → Attack Protection → CAPTCHA. Erst aktivieren, wenn das Frontend es unterstützt
  (sonst schlägt jede Gast-Anmeldung fehl).
- **Nach der Einrichtung einmal testen:** auf der Seite ein Konto registrieren und wieder löschen. Das prüft,
  dass das gehostete Projekt die künstliche Domain `.invalid` (`<name>@users.yezun-games.invalid`) annimmt.
  Die Datenbank lehnt jede andere E-Mail-Adresse ab (Trigger `enforce_synthetic_email`).

### E-Mail-Versand (Resend) für Wiederherstellungs-E-Mail und Passwort-Reset

Die Konto-Functions verschicken Mails selbst über die Resend-HTTP-API (nicht über Supabase-Auth-Mails; in
`auth.users` steht weiterhin nur die künstliche Adresse).

1. Auf <https://resend.com> die Domain `yezun.de` hinzufügen und die angezeigten DNS-Einträge (SPF/DKIM) beim
   Domain-Anbieter setzen, bis Resend "Verified" zeigt. Absender ist `Yezun Konto <konto@yezun.de>`.
2. API-Key erzeugen (Berechtigung "Sending access", nur Domain `yezun.de`).
3. Als **Function-Secret** setzen (nicht ins Repo, nicht als GitHub-Variable):
   ```sh
   npx supabase secrets set RESEND_API_KEY=re_... --project-ref <reference-id>
   ```
   (oder Dashboard → Edge Functions → Secrets). Ohne den Key antworten `recovery-email-set` und
   `password-reset-request` mit **503** `mail_unavailable` ("Der E-Mail-Versand ist derzeit nicht eingerichtet.").
   Lokal: `supabase/functions/.env` mit `RESEND_API_KEY=...` (von Git ignoriert), `npx supabase functions serve --env-file supabase/functions/.env`.

Ablauf und Regeln:
- Nur registrierte Konten (keine Gäste). Setzen/Entfernen verlangt das aktuelle Passwort (serverseitig geprüft).
- Die echte Adresse liegt in `konto_recovery_emails` (kein Client-Zugriff). Der Client sieht nur die maskierte
  Adresse über die RPC `konto_recovery_email_status()` (`{ email: 'ma***@example.com', verified }`, keine Zeile =
  keine Adresse).
- Links: `https://yezun.de/konto/#/verify-email?token=…` (24 h) bzw. `#/reset?token=…` (1 h). Token = 32 Zufallsbytes
  (base64url), gespeichert nur als sha256, einmalig verwendbar; ein neuer Link macht ältere ungültig, eine neue oder
  entfernte Adresse macht alle offenen Links ungültig.
- Rate-Limits (gezählt in `konto_tokens`): max. 5 Bestätigungsmails und max. 3 Reset-Mails pro Konto und Stunde.
- `password-reset-request` antwortet immer gleich (`{ status: 'ok' }`), auch zeitlich: Suche und Versand laufen
  nach der Antwort (`EdgeRuntime.waitUntil`). Mails gehen nur an **bestätigte** Adressen.
- Nach erfolgreichem Reset werden **alle Sitzungen** des Kontos beendet (`auth.sessions` gelöscht, damit sind alle
  Refresh-Tokens ungültig). Bereits ausgegebene Access-Tokens laufen spätestens nach `jwt_expiry` (1 h) ab.
- Fehler kommen als `{ error: <code>, message: <deutscher Text> }`.

**Regel für neue Migrationen:** Neue Tabellen, Sequenzen und Funktionen in `public` bekommen für `anon` und
`authenticated` **keine** Rechte mehr automatisch (Default Privileges sind entzogen). Jede neue Tabelle braucht
RLS und ein ausdrückliches `grant select … to authenticated`, jede Funktion, die ein Client aufrufen darf, ein
ausdrückliches `grant execute`. Was nicht freigegeben wird, bleibt zu.

Nicht manuell nötig (passiert automatisch durch Migration bzw. Deploy):
- Tabellen, RLS-Regeln, Realtime-Freigabe für `queue` und `matches`, Funktion `ping()`,
  E-Mail-Trigger und Cron-Job für alte Gastkonten.
- "Verify JWT" der Edge Functions (kommt aus `config.toml`).
- `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` für die Edge Functions (stellt Supabase selbst bereit).

## 3. Supabase CLI am eigenen Rechner anmelden

Im Projektordner (`konto`) im Terminal:

```sh
npx supabase login
```

Es öffnet sich der Browser, dort bestätigen.

## 4. Projekt verknüpfen

```sh
npx supabase link --project-ref <reference-id>
```

Nach dem Datenbank-Passwort fragen lassen und eingeben (nicht als Parameter in die Kommandozeile schreiben).

## 5. Datenbank einrichten (Migrationen)

```sh
npx supabase db push
```

Das legt die Tabellen `profiles`, `ratings`, `queue`, `matches`, `match_messages`, `konto_recovery_emails`,
`konto_tokens`, `handwriting_glyphs`, `handwriting_settings` mit allen Sicherheitsregeln an.
Kontrolle im Dashboard unter **Table Editor**: bei jeder Tabelle steht "RLS enabled".

## 6. Edge Functions hochladen

```sh
npx supabase functions deploy --project-ref <reference-id>
```

Danach sind unter **Edge Functions** vierzehn Funktionen sichtbar:
`set-nickname`, `matchmake`, `move`, `resign`, `claim-timeout`, `delete-account`, `bot-game`, `bot-move`, `chat-send`
(xox) und `recovery-email-set`, `recovery-email-remove`, `recovery-email-verify`, `password-reset-request`,
`password-reset-confirm` (Konto). Bei den letzten drei steht "Verify JWT" auf **aus** (aus `config.toml`, gewollt:
sie werden ohne Login aus Mail-Links aufgerufen und prüfen ihr Token selbst).

## 7. GitHub einrichten (automatisches Deployment)

Im GitHub-Repo → **Settings → Secrets and variables → Actions**.

**Secrets** (Tab "Secrets", geheim):

| Name | Wert | woher |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | persönlicher Token | supabase.com → Account → **Access Tokens** → Generate new token |
| `SUPABASE_DB_PASSWORD` | Datenbank-Passwort | aus Schritt 1.3 |

**Variables** (Tab "Variables", öffentlich sichtbar – nur öffentliche Werte!):

| Name | Wert |
|---|---|
| `SUPABASE_PROJECT_REF` | Reference ID aus Schritt 1.5 |
| `VITE_SUPABASE_URL` | Project URL aus Schritt 1.6 |
| `VITE_SUPABASE_ANON_KEY` | anon / publishable key aus Schritt 1.6 |

Außerdem: **Settings → Pages → Source: GitHub Actions**.

Ab jetzt gilt:
- Push auf `main` mit Änderungen unter `supabase/` → Workflow *Deploy Supabase* spielt Migrationen und Functions ein.
- Push auf `main` → Workflow *Deploy to GitHub Pages* baut die Seite.
- Workflow *Keep Supabase awake* ruft alle 3 Tage `ping()` auf, damit das kostenlose Projekt nicht pausiert.
  Einmal manuell testen: **Actions → Keep Supabase awake → Run workflow**.

## Neues Projekt anbinden (eigene Tabellen)

1. Neue Migration hier anlegen: `npx supabase migration new <projekt>_<was>` (Timestamp muss nach dem neuesten
   liegen; bestehende Migrationen **nie** ändern oder umbenennen, sie sind live schon angewendet).
2. Tabellen mit Projekt-Präfix benennen (`handwriting_…`, `konto_…`; die xox-Tabellen bleiben aus Kompatibilität
   ohne Präfix). Jede Zeile hängt an `auth.users (id) on delete cascade` – so löschen Konto-Löschung und die
   Gast-Bereinigung alles mit.
3. `alter table … enable row level security;` und **ausdrücklich** freigeben, was Clients brauchen
   (Default Privileges sind entzogen, siehe oben). Muster:
   - nur lesen, Schreiben über Edge Function / `security definer`-Funktion: `grant select … to authenticated`
     (so xox);
   - direkt schreiben, nur eigene Zeilen, nur registrierte Nutzer: siehe `20261110010000_handwriting.sql`
     (Policy mit `user_id = (select auth.uid())` und
     `coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false`, grants
     `select, insert, update, delete … to authenticated`, nichts an `anon`);
   - Größe von `jsonb`-Spalten per `check (pg_column_size(...) <= …)` begrenzen.
4. `security definer`-Funktionen: `set search_path = ''`, `revoke execute … from public, anon, authenticated`, dann
   gezielt `grant execute` (meist nur `service_role`).
5. Edge Function: Ordner `functions/<name>/index.ts`, Helfer `serve` (mit Login) bzw. `servePublic` (ohne) aus
   `functions/_server/http.ts`, Eintrag `[functions.<name>]` mit `verify_jwt` in `config.toml`.
6. Push auf `main` → Workflow *Deploy Supabase* spielt alles ein.

## Lokal entwickeln (optional, braucht Docker Desktop)

```sh
npx supabase start            # startet Datenbank, Auth, Realtime, Functions lokal
npx supabase db reset         # optional: Datenbank leeren und alle Migrationen neu einspielen
npx supabase functions serve  # Edge Functions mit Hot-Reload
npx supabase stop             # alles wieder beenden
```

`npx supabase start` zeigt lokale URL und Schlüssel an. Diese Werte in eine eigene `.env.local`
(wird von Git ignoriert) als `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` eintragen
(`VITE_SUPABASE_URL=http://127.0.0.1:54321`, Schlüssel = `ANON_KEY`), dann `npx vite`.

Gegen sich selbst testen: zweiten Tab mit `?authslot=2` vor dem `#` öffnen
(z. B. `http://localhost:5173/xox/?authslot=2#/online`). Der Tab bekommt eine eigene Sitzung.
Funktioniert nur im Entwicklungsmodus, nicht auf der veröffentlichten Seite.

## Was wo liegt

- `migrations/` – Datenbankschema, RLS, SQL-Funktionen `finish_match`, `matchmake`, `ping`,
  `purge_stale_guests`, `send_match_message`, `konto_*`, Trigger `enforce_synthetic_email`
- `functions/<name>/index.ts` – die Edge Functions
- `functions/_shared/` – reiner TS-Code ohne Deno-APIs (`rules.ts`, `profanity.ts`, `bot.ts`, `konto.ts`), mit
  vitest-Tests (`*.test.ts`)
- `functions/_server/` – nur für Edge Functions (CORS, Login-Prüfung, Datenbankzugriff)

## Fehlersuche

- **Functions antworten mit 401**, obwohl man eingeloggt ist: Falls das Projekt die neuen
  "JWT Signing Keys" nutzt, kann die Gateway-Prüfung ("Verify JWT") Probleme machen. Dann in
  `config.toml` bei allen Functions `verify_jwt = false` setzen und neu deployen – die Functions
  prüfen den Login trotzdem selbst (`getUser`).
- **Projekt pausiert**: im Dashboard auf *Restore* klicken, dann den Keepalive-Workflow prüfen.
- **Benutzer löschen**: Spieler können ihr Konto selbst löschen (Konto → Konto löschen). Manuell: Authentication → Users → Benutzer löschen. Profil, Elo, Warteschlange und
  dessen Partien werden automatisch mitgelöscht.
