import {
  currentUser,
  getRecoveryEmailStatus,
  onAuthChange,
  ready,
  refreshUser,
  resendVerification,
  type AuthUser,
} from '../../../sdk/src/index.ts';
import { announce } from '../announce.ts';
import { el, errorText, note, panel, returnTarget, section, setMsg, takeFlash } from '../dom.ts';
import { navigate, type Screen } from '../router.ts';
import { notConfigured } from './common.ts';
import { deleteCard, emailChangeForm, sessionCard } from './konto.ts';

/**
 * Shown instead of every route (except #/verify-email) while the account's email is not confirmed:
 * masked address, resend, change address, log out, delete account.
 */
export const unverifiedScreen: Screen = {
  title: 'E-Mail bestätigen',
  mount(root, params) {
    if (notConfigured(root, 'E-Mail bestätigen')) return;
    const ret = returnTarget(params);
    const flash = takeFlash();
    const body = el('div', { className: 'stack' }, el('p', { className: 'muted', text: 'Lädt …' }));
    panel(root, 'Bestätige deine E-Mail-Adresse', body);
    let gen = 0;

    async function render(user: AuthUser): Promise<void> {
      const my = ++gen;
      body.replaceChildren();
      if (flash) body.append(note(flash.text, flash.kind));
      const address = el('p', { className: 'muted', text: 'Lädt …', attrs: { role: 'status' } });
      const msg = el('p', { className: 'msg', attrs: { role: 'status' } });
      const resend = el('button', { className: 'btn primary', text: 'Link erneut senden', attrs: { type: 'button' } });
      const check = el('button', { className: 'btn', text: 'Ich habe bestätigt', attrs: { type: 'button' } });
      resend.addEventListener('click', async () => {
        resend.disabled = true;
        setMsg(msg, '', false);
        try {
          await resendVerification();
          announce('Link erneut gesendet.');
          setMsg(msg, 'Link erneut gesendet. Er kann ein paar Minuten brauchen; sieh auch im Spam-Ordner nach.', false);
        } catch (e) {
          setMsg(msg, errorText(e), true);
        } finally {
          resend.disabled = false;
        }
      });
      check.addEventListener('click', async () => {
        check.disabled = true;
        setMsg(msg, '', false);
        try {
          const u = await refreshUser();
          if (u?.status === 'unverified') setMsg(msg, 'Noch nicht bestätigt. Öffne den Link aus der E-Mail.', true);
        } catch (e) {
          setMsg(msg, errorText(e), true);
        } finally {
          check.disabled = false;
        }
      });

      const main = section(
        'Noch ein Schritt',
        el('p', {}, 'Angemeldet als ', el('strong', { text: user.username ?? '' }), '. Dein Konto kannst du erst nutzen, wenn du deine E-Mail-Adresse bestätigt hast.'),
        address,
        msg,
        el('div', { className: 'actions' }, resend, check),
      );
      const change = section(
        'Adresse ändern',
        note('Falsche Adresse eingegeben? Trage die richtige ein; wir schicken den Link dann dorthin.'),
        emailChangeForm((email) => {
          setMsg(msg, `Bestätigungslink an ${email} gesendet.`, false);
          void loadAddress();
          main.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }),
      );
      body.append(main, change, sessionCard(), deleteCard(user, ret));

      async function loadAddress(): Promise<void> {
        try {
          const s = await getRecoveryEmailStatus();
          if (my !== gen) return;
          address.className = '';
          if (s.email) {
            address.replaceChildren('Wir haben einen Bestätigungslink an ', el('strong', { text: s.email }), ' geschickt.');
          } else {
            address.className = 'note warn';
            address.textContent = 'Es ist noch keine E-Mail-Adresse hinterlegt. Trage sie unten ein.';
            resend.hidden = true;
          }
        } catch (e) {
          if (my !== gen) return;
          setMsg(address, errorText(e), true);
        }
      }
      void loadAddress();
    }

    let shown: string | undefined;
    const unsub = onAuthChange((u) => {
      const key = u ? `${u.id}:${u.status}` : '';
      if (key === shown) return;
      shown = key;
      void ready.then(() => {
        const me = currentUser();
        // confirmed (or signed out): the guard lets the real route through again
        if (me?.status !== 'unverified') {
          if (location.hash.replace(/^#\/?/, '').startsWith('bestaetigen')) navigate('konto', { return: ret }, true);
          return;
        }
        void render(me);
      });
    });
    return () => {
      gen++;
      unsub();
    };
  },
};
