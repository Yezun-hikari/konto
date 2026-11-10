import {
  AuthFailure,
  changePassword,
  currentUser,
  deleteAccount,
  getRecoveryEmailStatus,
  logout,
  reauthWithGoogle,
  onAuthChange,
  ready,
  removeRecoveryEmail,
  setRecoveryEmail,
  type AuthUser,
  type RecoveryEmailStatus,
} from '../../../sdk/src/index.ts';
import { announce } from '../announce.ts';
import { section, el, errorText, field, form, linkBtn, note, panel, returnTarget, setMsg, shortUrl, takeFlash } from '../dom.ts';
import { href, scrubParams, type Screen } from '../router.ts';
import { currentPasswordField, emailField, newPasswordFields, notConfigured } from './common.ts';

export const kontoScreen: Screen = {
  title: 'Konto',
  mount(root, params) {
    if (notConfigured(root, 'Konto')) return;
    const ret = returnTarget(params);
    // after a fresh Google sign-in for deleting (#/konto?loeschen=1): open the dialog once
    let openDelete = params.get('loeschen') === '1';
    if (openDelete) scrubParams('konto', { return: ret });
    const flash = takeFlash();
    const body = el('div', { className: 'stack' }, el('p', { className: 'muted', text: 'Lädt …' }));
    panel(root, 'Konto', body);
    let gen = 0;

    async function render(): Promise<void> {
      const my = ++gen;
      await ready;
      if (my !== gen) return;
      const user = currentUser();
      body.replaceChildren();
      if (flash) body.append(note(flash.text, flash.kind));
      // calm notice at the top for password accounts without a confirmed recovery email (filled by recoveryCard)
      const notice = el('div', { className: 'callout', attrs: { role: 'status' } });
      notice.hidden = true;
      body.append(notice);

      const google = user?.provider === 'google';
      const status = section('Status');
      if (!user || user.isGuest) {
        status.append(el('p', { text: !user ? 'Nicht angemeldet.' : 'Gast (ohne Konto, nur auf diesem Gerät).' }));
      } else if (user.needsUsername) {
        status.append(el('p', { text: 'Angemeldet mit Google. Du hast noch keinen Benutzernamen.' }));
      } else {
        status.append(el('p', {}, google ? 'Angemeldet mit Google als ' : 'Angemeldet als ', el('strong', { text: user.username ?? '' })));
      }
      const actions = el('div', { className: 'actions' });
      if (user?.needsUsername) actions.append(linkBtn('Benutzernamen wählen', href('benutzername', { return: ret }), true));
      else if (ret) actions.append(linkBtn(`Zurück zu ${shortUrl(ret)}`, ret, true));
      if (!user || user.isGuest) {
        actions.append(
          linkBtn('Anmelden', href('login', { return: ret }), !ret),
          linkBtn('Registrieren', href('login', { tab: 'register', return: ret })),
        );
      }
      if (actions.childElementCount) status.append(actions);
      body.append(status);

      if (user && !user.isGuest && !google) {
        body.append(recoveryCard(() => my === gen, (s) => fillNotice(notice, s)), passwordCard(), sessionCard());
      } else if (user && google) {
        body.append(sessionCard());
      }
      if (user) body.append(deleteCard(user, ret));
      if (openDelete && google) {
        openDelete = false;
        confirmDelete(user!, ret, 'Du hast dich erneut mit Google angemeldet. Du kannst das Löschen jetzt bestätigen.');
      }
    }

    let shown: string | undefined;
    const unsub = onAuthChange((u) => {
      const key = u ? `${u.id}:${u.username}:${u.status}` : '';
      if (key !== shown) (shown = key), void render();
    });
    return () => {
      gen++;
      unsub();
    };
  },
};

function fillNotice(box: HTMLElement, s: RecoveryEmailStatus): void {
  box.replaceChildren();
  box.hidden = s.verified;
  if (s.verified) return;
  const jump = el('button', { className: 'link-btn', text: s.email ? 'Zur E-Mail-Adresse' : 'Jetzt hinterlegen', attrs: { type: 'button' } });
  jump.addEventListener('click', () => {
    const target = document.getElementById('recovery');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target?.querySelector<HTMLInputElement>('input[name=email]')?.focus({ preventScroll: true });
  });
  box.append(
    el('strong', { text: s.email ? 'Bitte bestätige deine E-Mail-Adresse' : 'Hinterlege eine E-Mail-Adresse, damit du dein Passwort zurücksetzen kannst' }),
    el('p', {
      text: s.email
        ? `Öffne den Bestätigungslink, den wir an ${s.email} geschickt haben. Erst dann kannst du ein vergessenes Passwort zurücksetzen.`
        : 'Ohne bestätigte E-Mail-Adresse lässt sich ein vergessenes Passwort nicht zurücksetzen.',
    }),
    jump,
  );
}

function recoveryCard(alive: () => boolean, onStatus: (s: RecoveryEmailStatus) => void): HTMLElement {
  const c = section('Wiederherstellungs-E-Mail');
  c.id = 'recovery';
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
    onStatus(s);
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
      emailChangeForm((email) => void load(`Bestätigungslink an ${email} gesendet. Bitte öffne ihn, um die Adresse zu bestätigen.`)),
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

/** New recovery address + current password; sends a confirmation link. */
export function emailChangeForm(onSent: (email: string) => void): HTMLFormElement {
  return form([emailField(), currentPasswordField('Aktuelles Passwort zur Bestätigung')], 'Bestätigungslink senden', async (f, formEl) => {
    await setRecoveryEmail(f.old, f.email);
    formEl.reset();
    announce('Bestätigungslink gesendet.');
    onSent(f.email.trim());
  });
}

export function sessionCard(): HTMLElement {
  const btn = el('button', { className: 'btn', text: 'Abmelden', attrs: { type: 'button' } });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await logout().catch(() => {});
    announce('Abgemeldet.');
  });
  return section('Sitzung', note('Meldet dich auf diesem Gerät auf allen Seiten von yezun.de ab.'), btn);
}

export function deleteCard(user: AuthUser, ret: string | null): HTMLElement {
  const btn = el('button', { className: 'btn danger', text: user.isGuest ? 'Gastdaten löschen …' : 'Konto löschen …', attrs: { type: 'button' } });
  btn.addEventListener('click', () => confirmDelete(user, ret));
  const s = section(
    user.isGuest ? 'Gastdaten löschen' : 'Konto löschen',
    note('Löscht dein Konto und alle zugehörigen Daten auf allen Seiten von yezun.de (z. B. Spielstände, Wertungen, Wiederherstellungs-E-Mail) endgültig.'),
  );
  if (user.provider === 'google') {
    s.append(
      note(
        'Zur Bestätigung gibst du deinen Benutzernamen ein. Liegt deine Anmeldung mit Google länger als 10 Minuten zurück, ' +
          'meldest du dich vorher noch einmal kurz mit Google an.',
      ),
    );
  }
  s.append(btn);
  s.classList.add('danger-zone');
  return s;
}

function confirmDelete(user: AuthUser, ret: string | null, intro?: string): void {
  const google = user.provider === 'google';
  const title = el('h2', { text: user.isGuest ? 'Gastdaten wirklich löschen?' : 'Konto wirklich löschen?', attrs: { id: 'del-title' } });
  const msg = el('p', { className: 'msg', attrs: { role: 'status' } });
  const cancel = el('button', { className: 'btn', text: 'Abbrechen', attrs: { type: 'button', autofocus: '' } });
  const submit = el('button', { className: 'btn danger', text: 'Endgültig löschen', attrs: { type: 'submit' } });
  const reauth = el('div', { className: 'stack' });
  reauth.hidden = true;
  const inputs: HTMLElement[] = [];
  if (google && user.username) {
    inputs.push(
      field({
        name: 'confirm',
        label: 'Benutzername zur Bestätigung',
        hint: `Gib „${user.username}“ ein.`,
        autocomplete: 'off',
        maxlength: 20,
      }),
    );
  } else if (!user.isGuest && !google) {
    inputs.push(field({ name: 'p', label: 'Passwort zur Bestätigung', type: 'password', autocomplete: 'current-password', maxlength: 72 }));
  }
  const f = el(
    'form',
    { className: 'dialog-inner form' },
    title,
    ...(intro ? [note(intro, 'ok')] : []),
    el('p', { text: 'Das kann nicht rückgängig gemacht werden. Laufende Partien werden als verloren gewertet.' }),
    ...inputs,
    msg,
    reauth,
    el('div', { className: 'actions end' }, cancel, submit),
  );
  const d = el('dialog', { className: 'dialog', attrs: { 'aria-labelledby': 'del-title' } }, f);
  cancel.addEventListener('click', () => d.close());
  d.addEventListener('close', () => d.remove());
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    const v = new FormData(f);
    try {
      if (google) await deleteAccount({ confirm: String(v.get('confirm') ?? '') });
      else await deleteAccount(user.isGuest ? undefined : String(v.get('p') ?? ''));
      d.close();
      announce('Konto gelöscht.');
    } catch (err) {
      setMsg(msg, errorText(err), true);
      submit.disabled = false;
      if (err instanceof AuthFailure && err.code === 'reauth_required') showReauth();
    }
  });
  function showReauth(): void {
    const again = el('button', { className: 'btn primary', text: 'Erneut mit Google anmelden', attrs: { type: 'button' } });
    again.addEventListener('click', async () => {
      again.disabled = true;
      try {
        await reauthWithGoogle(ret); // back to #/konto?loeschen=1
      } catch (err) {
        setMsg(msg, errorText(err), true);
        again.disabled = false;
      }
    });
    reauth.replaceChildren(note('Danach kommst du hierher zurück und bestätigst das Löschen noch einmal.'), again);
    reauth.hidden = false;
    submit.hidden = true;
  }
  document.body.append(d);
  d.showModal();
}
