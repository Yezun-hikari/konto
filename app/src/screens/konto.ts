import {
  AuthFailure,
  changePassword,
  currentUser,
  deleteAccount,
  getRecoveryEmailStatus,
  logout,
  onAuthChange,
  ready,
  removeRecoveryEmail,
  setRecoveryEmail,
  type AuthUser,
} from '../../../sdk/src/index.ts';
import { announce } from '../announce.ts';
import { section, el, errorText, field, form, linkBtn, note, panel, returnTarget, setMsg, shortUrl } from '../dom.ts';
import { href, type Screen } from '../router.ts';
import { currentPasswordField, newPasswordFields, notConfigured } from './common.ts';

export const kontoScreen: Screen = {
  title: 'Konto',
  mount(root, params) {
    if (notConfigured(root, 'Konto')) return;
    const ret = returnTarget(params);
    const body = el('div', { className: 'stack' }, el('p', { className: 'muted', text: 'Lädt …' }));
    panel(root, 'Konto', body);
    let gen = 0;

    async function render(): Promise<void> {
      const my = ++gen;
      await ready;
      if (my !== gen) return;
      const user = currentUser();
      body.replaceChildren();

      const status = section('Status');
      status.append(
        !user || user.isGuest
          ? el('p', { text: !user ? 'Nicht angemeldet.' : 'Gast (ohne Konto, nur auf diesem Gerät).' })
          : el('p', {}, 'Angemeldet als ', el('strong', { text: user.username ?? '' })),
      );
      const actions = el('div', { className: 'actions' });
      if (ret) actions.append(linkBtn(`Zurück zu ${shortUrl(ret)}`, ret, true));
      if (!user || user.isGuest) {
        actions.append(
          linkBtn('Anmelden', href('login', { return: ret }), !ret),
          linkBtn('Registrieren', href('login', { tab: 'register', return: ret })),
        );
      }
      if (actions.childElementCount) status.append(actions);
      body.append(status);

      if (user && !user.isGuest) {
        body.append(recoveryCard(() => my === gen), passwordCard(), sessionCard());
      }
      if (user) body.append(deleteCard(user));
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

function recoveryCard(alive: () => boolean): HTMLElement {
  const c = section('Wiederherstellungs-E-Mail');
  const state = el('p', { className: 'muted', text: 'Lädt …', attrs: { role: 'status' } });
  const content = el('div', { className: 'stack' });
  const flash = el('p', { className: 'msg ok', attrs: { role: 'status' } });
  c.append(
    note('Nur mit einer bestätigten E-Mail-Adresse kannst du ein vergessenes Passwort zurücksetzen. Sie wird nur dafür verwendet und ist für niemanden sichtbar.'),
    state,
    flash,
    content,
  );

  async function load(done = ''): Promise<void> {
    content.replaceChildren();
    flash.textContent = '';
    setMsg(state, 'Lädt …', false);
    state.className = 'muted';
    let s;
    try {
      s = await getRecoveryEmailStatus();
    } catch (e) {
      if (!alive()) return;
      setMsg(state, errorText(e), true);
      const retry = el('button', { className: 'btn', text: 'Erneut laden', attrs: { type: 'button' } });
      retry.addEventListener('click', () => void load());
      content.append(retry);
      return;
    }
    if (!alive()) return;
    flash.textContent = done;
    state.className = '';
    if (!s.email) {
      state.textContent = 'Keine E-Mail-Adresse hinterlegt. Ohne sie ist kein Zurücksetzen des Passworts möglich.';
      state.className = 'note warn';
    } else {
      state.className = 'email-state';
      state.replaceChildren(
        el('strong', { text: s.email }),
        el('span', {
          className: s.verified ? 'state ok' : 'state warn',
          text: s.verified ? 'bestätigt' : 'noch nicht bestätigt',
        }),
      );
      if (!s.verified) {
        content.append(note('Öffne den Bestätigungslink aus der E-Mail. Keine E-Mail bekommen? Prüfe den Spam-Ordner oder trage die Adresse unten erneut ein.'));
      }
    }

    content.append(
      el('h3', { text: s.email ? 'Adresse ändern' : 'Adresse hinterlegen' }),
      form(
        [
          field({ name: 'email', label: 'E-Mail-Adresse', type: 'email', autocomplete: 'email', maxlength: 254 }),
          currentPasswordField('Aktuelles Passwort zur Bestätigung'),
        ],
        'Bestätigungslink senden',
        async (f) => {
          await setRecoveryEmail(f.old, f.email);
          announce('Bestätigungslink gesendet.');
          void load(`Bestätigungslink an ${f.email.trim()} gesendet. Bitte öffne ihn, um die Adresse zu bestätigen.`);
        },
      ),
    );
    if (s.email) {
      content.append(
        el('h3', { text: 'Adresse entfernen' }),
        note('Danach kannst du ein vergessenes Passwort nicht mehr zurücksetzen.', 'warn'),
        form([currentPasswordField('Aktuelles Passwort zur Bestätigung')], 'E-Mail-Adresse entfernen', async (f) => {
          await removeRecoveryEmail(f.old);
          announce('E-Mail-Adresse entfernt.');
          void load('E-Mail-Adresse entfernt.');
        }, true),
      );
    }
  }
  void load();
  return c;
}

function passwordCard(): HTMLElement {
  return section(
    'Passwort ändern',
    form([currentPasswordField(), ...newPasswordFields('Neues Passwort')], 'Passwort ändern', async (f, formEl) => {
      if (f.p !== f.p2) throw new AuthFailure('Die Passwörter stimmen nicht überein.');
      await changePassword(f.old, f.p);
      formEl.reset();
      announce('Passwort geändert. Andere Geräte wurden abgemeldet.');
      return 'Passwort geändert. Andere Geräte wurden abgemeldet.';
    }),
  );
}

function sessionCard(): HTMLElement {
  const btn = el('button', { className: 'btn', text: 'Abmelden', attrs: { type: 'button' } });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await logout().catch(() => {});
    announce('Abgemeldet.');
  });
  return section('Sitzung', note('Meldet dich auf diesem Gerät auf allen Seiten von yezun.de ab.'), btn);
}

function deleteCard(user: AuthUser): HTMLElement {
  const btn = el('button', { className: 'btn danger', text: user.isGuest ? 'Gastdaten löschen …' : 'Konto löschen …', attrs: { type: 'button' } });
  btn.addEventListener('click', () => confirmDelete(!user.isGuest));
  const s = section(
    user.isGuest ? 'Gastdaten löschen' : 'Konto löschen',
    note('Löscht dein Konto und alle zugehörigen Daten auf allen Seiten von yezun.de (z. B. Spielstände, Wertungen, Wiederherstellungs-E-Mail) endgültig.'),
    btn,
  );
  s.classList.add('danger-zone');
  return s;
}

function confirmDelete(needsPassword: boolean): void {
  const title = el('h2', { text: 'Konto wirklich löschen?', attrs: { id: 'del-title' } });
  const msg = el('p', { className: 'msg', attrs: { role: 'status' } });
  const cancel = el('button', { className: 'btn', text: 'Abbrechen', attrs: { type: 'button', autofocus: '' } });
  const submit = el('button', { className: 'btn danger', text: 'Endgültig löschen', attrs: { type: 'submit' } });
  const pw = needsPassword ? [field({ name: 'p', label: 'Passwort zur Bestätigung', type: 'password', autocomplete: 'current-password', maxlength: 72 })] : [];
  const f = el(
    'form',
    { className: 'dialog-inner form' },
    title,
    el('p', { text: 'Das kann nicht rückgängig gemacht werden. Laufende Partien werden als verloren gewertet.' }),
    ...pw,
    msg,
    el('div', { className: 'actions end' }, cancel, submit),
  );
  const d = el('dialog', { className: 'dialog', attrs: { 'aria-labelledby': 'del-title' } }, f);
  cancel.addEventListener('click', () => d.close());
  d.addEventListener('close', () => d.remove());
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      await deleteAccount(needsPassword ? String(new FormData(f).get('p') ?? '') : undefined);
      d.close();
      announce('Konto gelöscht.');
    } catch (err) {
      setMsg(msg, errorText(err), true);
      submit.disabled = false;
    }
  });
  document.body.append(d);
  d.showModal();
}
