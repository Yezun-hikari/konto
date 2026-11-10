import { currentUser, handleOAuthReturn, onAuthChange, ready, setUsername } from '../../../sdk/src/index.ts';
import { announce } from '../announce.ts';
import { el, form, linkBtn, note, panel, returnTarget, section, shortUrl } from '../dom.ts';
import { href, navigate, type Screen } from '../router.ts';
import { done, notConfigured, usernameField } from './common.ts';

const loading = (text: string): HTMLElement =>
  el('div', { className: 'loading' }, el('div', { className: 'spinner', attrs: { 'aria-hidden': 'true' } }), el('p', { text }));

/** Removes `?code` / `?error…` / `?return` of the OAuth redirect from the address bar (keeps the hash route). */
function cleanSearch(): void {
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
}

/** #/anmeldung – target of the redirect back from Google. */
export const oauthReturnScreen: Screen = {
  title: 'Anmeldung',
  mount(root, params) {
    if (notConfigured(root, 'Anmeldung')) return;
    const body = el('div', { className: 'stack' }, loading('Anmeldung wird abgeschlossen …'));
    panel(root, 'Anmeldung mit Google', body);
    let alive = true;
    void handleOAuthReturn().then(
      (r) => {
        if (!alive) return;
        if (r?.status === 'redirecting') {
          // the Google account already exists: one more round trip to sign in to it
          body.replaceChildren(loading('Weiter zu Google …'));
          return;
        }
        cleanSearch();
        const ret = r?.returnTo ?? returnTarget(params);
        if (!r) return navigate('konto', { return: ret }, true);
        if (r.status === 'error') {
          announce(r.message);
          body.replaceChildren(
            section(
              'Nicht angemeldet',
              note(r.message, 'warn'),
              el('div', { className: 'actions' }, linkBtn('Zur Anmeldung', href('login', { return: ret }), true), linkBtn('Zum Konto', href('konto', { return: ret }))),
            ),
          );
          return;
        }
        announce('Angemeldet.');
        if (r.user.needsUsername) return navigate('benutzername', { return: ret }, true);
        if (r.mode === 'reauth') return navigate('konto', { loeschen: '1', return: ret }, true);
        if (ret) location.replace(ret);
        else navigate('konto', {}, true);
      },
      () => {
        if (!alive) return;
        cleanSearch();
        body.replaceChildren(note('Anmeldung mit Google fehlgeschlagen. Bitte erneut versuchen.', 'warn'), linkBtn('Zur Anmeldung', href('login'), true));
      },
    );
    return () => {
      alive = false;
    };
  },
};

/** #/benutzername – Google accounts choose their username after the first sign-in. */
export const usernameScreen: Screen = {
  title: 'Benutzername',
  mount(root, params) {
    if (notConfigured(root, 'Benutzername')) return;
    const ret = returnTarget(params);
    const body = el('div', { className: 'stack' }, el('p', { className: 'muted', text: 'Lädt …' }));
    panel(root, 'Wähle deinen Benutzernamen', body);
    let gen = 0;

    async function render(): Promise<void> {
      const my = ++gen;
      await ready;
      if (my !== gen) return;
      const user = currentUser();
      body.replaceChildren();
      if (!user || user.isGuest) {
        body.append(note('Du bist nicht angemeldet.'), linkBtn('Zur Anmeldung', href('login', { return: ret }), true));
        return;
      }
      if (!user.needsUsername) {
        body.append(
          el('p', {}, 'Dein Benutzername ist ', el('strong', { text: user.username ?? '' }), '.'),
          linkBtn(ret ? `Weiter zu ${shortUrl(ret)}` : 'Zum Konto', ret ?? href('konto'), true),
        );
        return;
      }
      body.append(
        note('Mit diesem Namen erscheinst du auf allen Seiten von yezun.de, zum Beispiel in Ranglisten. Er lässt sich später nicht ändern. Deine Google-Adresse bleibt unsichtbar.'),
        form([usernameField(true)], 'Benutzernamen speichern', async (f) => {
          await setUsername(f.u);
          announce('Benutzername gespeichert.');
          done(ret);
        }),
      );
    }

    let shown: string | undefined;
    const unsub = onAuthChange((u) => {
      const key = u ? `${u.id}:${u.username}` : '';
      if (key !== shown) (shown = key), void render();
    });
    return () => {
      gen++;
      unsub();
    };
  },
};
