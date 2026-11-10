import { currentUser, verifyRecoveryEmail } from '../../../sdk/src/index.ts';
import { announce } from '../announce.ts';
import { section, el, errorText, linkBtn, note, panel, returnTarget, shortUrl } from '../dom.ts';
import { href, scrubParams, type Screen } from '../router.ts';
import { notConfigured } from './common.ts';

/** #/verify-email?token=… – confirms the recovery email right away (link from the confirmation email). */
export const verifyScreen: Screen = {
  title: 'E-Mail bestätigen',
  mount(root, params) {
    if (notConfigured(root, 'E-Mail bestätigen')) return;
    const token = params.get('token') ?? '';
    const ret = returnTarget(params);
    const body = el('div', { className: 'stack' });
    panel(root, 'E-Mail bestätigen', body);
    const show = (title: string, text: string, kind: 'ok' | 'warn') => {
      const next = kind === 'ok' && ret ? linkBtn(`Weiter zu ${shortUrl(ret)}`, ret, true) : linkBtn('Zum Konto', href('konto', { return: ret }), true);
      body.replaceChildren(section(title, note(text, kind), next));
      announce(text);
    };
    if (!token) return show('Link unvollständig', 'Dieser Link enthält keinen gültigen Code.', 'warn');
    let alive = true;
    body.append(el('div', { className: 'loading' }, el('div', { className: 'spinner', attrs: { 'aria-hidden': 'true' } }), el('p', { text: 'Wird bestätigt …' })));
    scrubParams('verify-email', { return: ret }); // token is kept in memory only; keep it out of the history
    verifyRecoveryEmail(token).then(
      () => {
        // the SDK has refreshed the session: the account is usable now
        if (!alive) return;
        show('Bestätigt', 'Deine E-Mail-Adresse ist bestätigt. Dein Konto ist bereit, und du kannst bei Bedarf dein Passwort zurücksetzen.', 'ok');
        if (ret && currentUser()?.status === 'active') setTimeout(() => alive && location.assign(ret), 1500);
      },
      (e) => alive && show('Nicht bestätigt', errorText(e), 'warn'),
    );
    return () => {
      alive = false;
    };
  },
};
