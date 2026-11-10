# Konto – zentrales Konto für yezun.de

Ein Konto für alle Seiten auf <https://yezun.de/> (xox, handwriting, …). Ein Supabase-Projekt, eine Sitzung:
Alle Seiten liegen auf demselben Origin und teilen die Anmeldung über den `localStorage`-Key `yezun-games-auth`.

| Ordner | Inhalt |
|---|---|
| `sdk/` | Client-SDK **`@yezun/konto`** (Quelle `sdk/src`, gebaut in `sdk/dist` – wird committet). Doku: [`sdk/README.md`](sdk/README.md) |
| `app/` | Konto-Webseite unter <https://yezun.de/konto/>: Anmelden/Registrieren, Konto, Passwort ändern/zurücksetzen, Wiederherstellungs-E-Mail, Konto löschen |
| `supabase/` | Alle Migrationen und Edge Functions des gemeinsamen Projekts (Einrichtung: [`supabase/README.md`](supabase/README.md)) |
| `.github/workflows/` | `deploy.yml` (Seite auf GitHub Pages), `supabase.yml` (DB + Functions), `keepalive.yml` |
| `CONTRACT.md` | Verbindliche Schnittstellen zwischen SDK, Seite und Backend |

## Entwicklung

```sh
npm install
cp .env.example .env.local   # Projekt-URL + anon key eintragen (nur öffentliche Werte!)
npm run dev                  # http://localhost:5173/konto/
npm test                     # vitest: SDK + supabase/functions/_shared
npm run build                # Typprüfung, SDK-Build (sdk/dist), Seite nach dist/
```

**Nach jeder Änderung an `sdk/src`:** `npm run build:sdk` und `sdk/dist` mit committen.
Die CI (`npm run check:sdk`) bricht ab, wenn `sdk/dist` nicht zum Quelltext passt.

## Seiten der Konto-Webseite

| Route | Zweck |
|---|---|
| `#/login?return=…` | Tabs Anmelden / Registrieren. Gäste werden beim Registrieren übernommen (gleiche ID). Danach Weiterleitung zu `return` |
| `#/konto?return=…` | Status, Passwort ändern, Wiederherstellungs-E-Mail, Abmelden, Konto löschen |
| `#/reset-request` | Benutzername → Link per E-Mail (immer dieselbe Antwort) |
| `#/reset?token=…` | Neues Passwort setzen (Link aus der E-Mail, 1 h gültig), danach automatisch angemeldet |
| `#/verify-email?token=…` | Wiederherstellungs-E-Mail bestätigen |

`return` wird nur akzeptiert, wenn es auf `https://yezun.de/…` (oder denselben Origin) zeigt – sonst bleibt man
auf der Konto-Seite (kein Open Redirect).

## Deployment

GitHub Pages über `.github/workflows/deploy.yml` bei jedem Push auf `main`:
Repo → Settings → Pages → Source **GitHub Actions**; unter Settings → Secrets and variables → Actions →
**Variables** `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` anlegen (öffentliche Werte, keine Secrets).
Die Seite ist dann unter `https://yezun.de/konto/` erreichbar (Custom Domain des Pages-Accounts).

## Das SDK in einem anderen Projekt verwenden

1. In der `package.json` des Projekts (Tag auf eine veröffentlichte Version setzen):

   ```json
   "dependencies": {
     "@yezun/konto": "github:Yezun-hikari/konto#v0.1.0"
   }
   ```

   oder `npm i github:Yezun-hikari/konto#v0.1.0`. `@supabase/supabase-js` kommt automatisch als Abhängigkeit mit.
   Es wird nichts gebaut: das Paket enthält fertiges JS + `.d.ts` aus `sdk/dist`.

2. Konfiguration – eine der beiden Varianten:

   - **Vite-Projekt (empfohlen):** `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` beim Build setzen
     (lokal `.env.local`, in der CI als Actions-Variablen wie in `deploy.yml`). Fertig.
   - **Explizit (jeder Bundler)** – ganz oben im Einstiegsmodul, vor jeder anderen SDK-Funktion:

     ```ts
     import { configure } from '@yezun/konto';
     configure({
       url: import.meta.env.VITE_SUPABASE_URL,
       anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
       // accountUrl: 'http://localhost:5173/konto/',  // optional, z. B. für lokale Entwicklung
     });
     ```

3. `tsconfig.json`: `"moduleResolution": "bundler"` (oder `node16`/`nodenext`) und `"skipLibCheck": true`
   (die Typen von supabase-js verweisen auf Node-Typen).

4. Verwenden:

   ```ts
   import { ready, currentUser, onAuthChange, loginUrl, accountUrl, getClient } from '@yezun/konto';

   await ready;
   const user = currentUser();             // null | { id, username, isGuest }
   link.href = user && !user.isGuest ? accountUrl() : loginUrl();  // Rücksprung auf die aktuelle Seite
   onAuthChange((u) => render(u));
   const { data } = await getClient().from('handwriting_glyphs').select('*');
   ```

   Ein eigenes Login-Formular braucht kein Projekt mehr: auf `loginUrl()` verlinken, die Konto-Seite leitet
   nach der Anmeldung zurück, und die Sitzung ist dank gemeinsamem `localStorage` sofort da.

## Ein neues Projekt anbinden

1. SDK wie oben einbinden, auf `https://yezun.de/<projekt>/` deployen (gleicher Origin ⇒ gleiche Sitzung).
2. Eigene Tabellen als Migration **in diesem Repo** unter `supabase/migrations/` anlegen, mit Projekt-Präfix
   (`<projekt>_…`), `user_id … references auth.users on delete cascade` (damit „Konto löschen“ alles entfernt),
   RLS mit eigenen Zeilen und ausdrücklichen Grants für `authenticated` (siehe `handwriting_*` als Vorlage).
   Nur registrierte Nutzer? In der Policy `coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false`.
3. Eigene Edge Functions ebenfalls hier unter `supabase/functions/`; `supabase.yml` deployt sie.
4. Kein `innerHTML` mit Nutzerdaten – eine XSS-Lücke in einem Projekt gefährdet alle Konten.
5. Neue SDK-Version: `sdk/src` ändern, `npm run build:sdk`, committen, Tag `vX.Y.Z` pushen, im Projekt den Tag anheben.
