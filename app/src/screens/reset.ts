import { AuthFailure, confirmPasswordReset, login, requestPasswordReset } from '../../../sdk/src/index.ts';
import { announce } from '../announce.ts';
import { card, el, form, linkBtn, note, panel, returnTarget } from '../dom.ts';
import { href, navigate, scrubParams, type Screen } from '../router.ts';
import { newPasswordFields, notConfigured, usernameField } from './common.ts';

/** #/reset?token=… – new password from the link in the reset email. */
export const resetScreen: Screen = {
  title: 'Neues Passwort',
  mount(root, params) {
    if (notConfigured(root, 'Neues Passwort')) return;
    const token = params.get('token') ?? '';
    const body = el('div', { className: 'stack' });
    panel(root, 'Neues Passwort', body);
    if (!token) {
      body.append(
        card(
          'Link unvollständig',
          note('Dieser Link enthält keinen gültigen Code. Öffne den Link aus der E-Mail vollständig oder fordere einen neuen an.', 'warn'),
          linkBtn('Neuen Link anfordern', href('reset-request'), true),
        ),
      );
      return;
    }
    body.append(
      card(
        'Neues Passwort festlegen',
        note('Der Link ist eine Stunde gültig und kann nur einmal verwendet werden.'),
        form(newPasswordFields('Neues Passwort'), 'Passwort speichern', async (f) => {
          if (f.p !== f.p2) throw new AuthFailure('Die Passwörter stimmen nicht überein.');
          const { username } = await confirmPasswordReset(token, f.p);
          scrubParams('reset'); // the token is used up: keep it out of the history
          announce('Passwort geändert.');
          // the server ended all sessions of the account: sign in right away with the new password
          if (username) {
            try {
              await login(username, f.p);
              navigate('konto');
              return;
            } catch {
              /* fall through: manual login */
            }
          }
          body.replaceChildren(
            card(
              'Passwort geändert',
              note('Dein neues Passwort ist gespeichert. Du kannst dich jetzt damit anmelden.', 'ok'),
              linkBtn('Zur Anmeldung', href('login'), true),
            ),
          );
          body.querySelector<HTMLElement>('h2')?.focus();
        }),
      ),
    );
  },
};

/** #/reset-request – username → reset link (if a verified recovery email exists). Always the same answer. */
export const resetRequestScreen: Screen = {
  title: 'Passwort vergessen',
  mount(root, params) {
    if (notConfigured(root, 'Passwort vergessen')) return;
    const ret = returnTarget(params);
    panel(
      root,
      'Passwort vergessen',
      card(
        'Link zum Zurücksetzen anfordern',
        note('Das geht nur, wenn für dein Konto eine bestätigte Wiederherstellungs-E-Mail hinterlegt ist. Ohne sie kann das Passwort nicht zurückgesetzt werden.'),
        form([usernameField(false)], 'Link anfordern', async (f, formEl) => {
          await requestPasswordReset(f.u);
          formEl.reset();
          announce('Anfrage gesendet.');
          return 'Falls für dieses Konto eine bestätigte E-Mail-Adresse hinterlegt ist, haben wir dir einen Link geschickt. Er ist eine Stunde gültig.';
        }),
        el('p', { className: 'small' }, el('a', { text: '← Zur Anmeldung', attrs: { href: href('login', { return: ret }) } })),
      ),
    );
  },
};
