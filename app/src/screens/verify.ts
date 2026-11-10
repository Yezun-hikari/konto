import { verifyRecoveryEmail } from '../../../sdk/src/index.ts';
import { announce } from '../announce.ts';
import { card, el, errorText, linkBtn, note, panel } from '../dom.ts';
import { href, scrubParams, type Screen } from '../router.ts';
import { notConfigured } from './common.ts';

/** #/verify-email?token=… – confirms the recovery email right away (link from the confirmation email). */
export const verifyScreen: Screen = {
  title: 'E-Mail bestätigen',
  mount(root, params) {
    if (notConfigured(root, 'E-Mail bestätigen')) return;
    const token = params.get('token') ?? '';
    const body = el('div', { className: 'stack' });
    panel(root, 'E-Mail bestätigen', body);
    const show = (title: string, text: string, kind: 'ok' | 'warn') => {
      body.replaceChildren(card(title, note(text, kind), linkBtn('Zum Konto', href('konto'), true)));
      announce(text);
    };
    if (!token) return show('Link unvollständig', 'Dieser Link enthält keinen gültigen Code.', 'warn');
    let alive = true;
    body.append(el('div', { className: 'loading' }, el('div', { className: 'spinner', attrs: { 'aria-hidden': 'true' } }), el('p', { text: 'Wird bestätigt …' })));
    scrubParams('verify-email'); // token is kept in memory only; keep it out of the history
    verifyRecoveryEmail(token).then(
      () => alive && show('Bestätigt', 'Deine Wiederherstellungs-E-Mail ist bestätigt. Du kannst jetzt bei Bedarf dein Passwort zurücksetzen.', 'ok'),
      (e) => alive && show('Nicht bestätigt', errorText(e), 'warn'),
    );
    return () => {
      alive = false;
    };
  },
};
