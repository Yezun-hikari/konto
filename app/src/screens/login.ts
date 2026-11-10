import { AuthFailure, currentUser, login, logout, onAuthChange, ready, register } from '../../../sdk/src/index.ts';
import { announce } from '../announce.ts';
import { section, el, form, linkBtn, note, panel, returnTarget, shortUrl } from '../dom.ts';
import { href, navigate, type Screen } from '../router.ts';
import { currentPasswordField, newPasswordFields, notConfigured, usernameField } from './common.ts';

/** After a successful login/register: back to the validated `return` target, else the account page. */
function done(ret: string | null): void {
  if (ret) location.assign(ret);
  else navigate('konto');
}

export const loginScreen: Screen = {
  title: 'Anmelden',
  mount(root, params) {
    if (notConfigured(root, 'Anmelden')) return;
    const ret = returnTarget(params);
    const body = el('div', { className: 'stack' }, el('p', { className: 'muted', text: 'Lädt …' }));
    const heading = panel(root, 'Anmelden', body).querySelector('h1')!;
    let gen = 0;

    async function render(): Promise<void> {
      const my = ++gen;
      await ready;
      if (my !== gen) return;
      const user = currentUser();
      body.replaceChildren();

      if (ret) body.append(note(`Nach der Anmeldung geht es zurück zu ${shortUrl(ret)}.`));

      if (user && !user.isGuest) {
        heading.textContent = 'Angemeldet';
        const c = section('Du bist angemeldet', el('p', { text: `Angemeldet als ${user.username}.` }));
        const actions = el('div', { className: 'actions' });
        if (ret) actions.append(linkBtn(`Weiter zu ${shortUrl(ret)}`, ret, true));
        actions.append(linkBtn('Zum Konto', href('konto', { return: ret })));
        const out = el('button', { className: 'btn', text: 'Abmelden', attrs: { type: 'button' } });
        out.addEventListener('click', async () => {
          out.disabled = true;
          await logout().catch(() => {});
          announce('Abgemeldet.');
        });
        actions.append(out);
        c.append(actions);
        body.append(c);
        return;
      }
      heading.textContent = 'Anmelden';

      // tabs
      const initial = params.get('tab') === 'register' ? 1 : 0;
      const tablist = el('div', { className: 'tabs', attrs: { role: 'tablist', 'aria-label': 'Anmelden oder registrieren' } });
      const panels: HTMLElement[] = [];
      const tabs: HTMLButtonElement[] = [];

      const loginPanel = el('div', { className: 'tabpanel' });
      if (user?.isGuest) {
        loginPanel.append(
          note('Achtung: Wenn du dich in ein bestehendes Konto einloggst, wird dein aktuelles Gastkonto mit seinem Fortschritt gelöscht.', 'warn'),
        );
      }
      loginPanel.append(
        form([usernameField(false), currentPasswordField('Passwort', { name: 'p' })], 'Anmelden', async (f) => {
          await login(f.u, f.p);
          announce('Angemeldet.');
          done(ret);
        }),
        el('p', { className: 'small' }, el('a', { text: 'Passwort vergessen?', attrs: { href: href('reset-request', { return: ret }) } })),
      );

      const regPanel = el('div', { className: 'tabpanel' });
      regPanel.append(
        note(
          user?.isGuest
            ? 'Dein Gast-Fortschritt (z. B. Wertung und Spitzname) wird in das neue Konto übernommen.'
            : 'Mit einem Konto meldest du dich auf allen Seiten von yezun.de und auf anderen Geräten an.',
        ),
        note(
          'Wichtig: Ohne hinterlegte und bestätigte Wiederherstellungs-E-Mail kann ein vergessenes Passwort nicht zurückgesetzt werden. ' +
            'Du kannst die E-Mail nach der Registrierung unter „Konto“ hinterlegen.',
          'warn',
        ),
        form([usernameField(true), ...newPasswordFields()], 'Konto erstellen', async (f) => {
          if (f.p !== f.p2) throw new AuthFailure('Die Passwörter stimmen nicht überein.');
          await register(f.u, f.p);
          announce('Konto erstellt.');
          done(ret);
        }),
      );

      const defs: [string, HTMLElement][] = [
        ['Anmelden', loginPanel],
        ['Registrieren', regPanel],
      ];
      defs.forEach(([label, p], i) => {
        const tab = el('button', {
          className: 'tab',
          text: label,
          attrs: { type: 'button', role: 'tab', id: `tab-${i}`, 'aria-controls': `tabpanel-${i}` },
        });
        p.id = `tabpanel-${i}`;
        p.setAttribute('role', 'tabpanel');
        p.setAttribute('aria-labelledby', `tab-${i}`);
        tab.addEventListener('click', () => select(i, true));
        tab.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            select((i + 1) % 2, true);
          }
        });
        tabs.push(tab);
        panels.push(p);
        tablist.append(tab);
      });
      function select(i: number, focus: boolean): void {
        tabs.forEach((t, j) => {
          t.setAttribute('aria-selected', String(i === j));
          t.tabIndex = i === j ? 0 : -1;
          panels[j].hidden = i !== j;
        });
        heading.textContent = i === 1 ? 'Registrieren' : 'Anmelden';
        if (focus) tabs[i].focus();
      }
      body.append(tablist, ...panels);
      select(initial, false);
    }

    let shown: string | undefined;
    // token refreshes also fire auth events: only re-render (and wipe typed input) when the user really changed
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
