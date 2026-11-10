import { isConfigured, MAX_PASSWORD, MIN_PASSWORD, NOT_CONFIGURED, signInWithGoogle } from '../../../sdk/src/index.ts';
import { el, errorText, field, googleMark, note, panel, setMsg, type FieldSpec } from '../dom.ts';
import { navigate } from '../router.ts';

/** After a successful sign-in: back to the validated `return` target, else the account page. */
export function done(ret: string | null): void {
  if (ret) location.assign(ret);
  else navigate('konto');
}

/** Plain outlined "Mit Google …" button with its own status line. */
export function googleButton(label: string, ret: string | null): HTMLElement {
  const text = el('span', { text: label });
  const btn = el('button', { className: 'btn google', attrs: { type: 'button' } }, googleMark(), text);
  const msg = el('p', { className: 'msg', attrs: { role: 'status' } });
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    setMsg(msg, '', false);
    text.textContent = 'Weiter zu Google …';
    try {
      await signInWithGoogle(ret); // the browser leaves the page
    } catch (e) {
      setMsg(msg, errorText(e), true);
      text.textContent = label;
      btn.disabled = false;
    }
  });
  return el('div', { className: 'oauth' }, btn, msg);
}

/** Hairline with "oder" between the form and the Google button. */
export const orDivider = (): HTMLElement => el('div', { className: 'divider', attrs: { role: 'separator' } }, el('span', { text: 'oder' }));

/** Shows the "not configured" view and returns true when the SDK has no Supabase project. */
export function notConfigured(root: HTMLElement, title: string): boolean {
  if (isConfigured()) return false;
  panel(root, title, note(`${NOT_CONFIGURED}. Diese Seite braucht VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY beim Build.`, 'warn'));
  return true;
}

export const pwHint = `${MIN_PASSWORD}–${MAX_PASSWORD} Zeichen`;

export const newPasswordFields = (labelPrefix = 'Passwort'): HTMLElement[] => [
  field({ name: 'p', label: labelPrefix, hint: pwHint, type: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD, maxlength: MAX_PASSWORD }),
  field({ name: 'p2', label: `${labelPrefix} wiederholen`, type: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD, maxlength: MAX_PASSWORD }),
];

export const currentPasswordField = (label = 'Aktuelles Passwort', spec: Partial<FieldSpec> = {}): HTMLElement =>
  field({ name: 'old', label, type: 'password', autocomplete: 'current-password', maxlength: MAX_PASSWORD, ...spec });

export const emailField = (hint?: string): HTMLElement =>
  field({ name: 'email', label: 'E-Mail-Adresse', type: 'email', autocomplete: 'email', maxlength: 254, hint });

export const usernameField = (forNew: boolean): HTMLElement =>
  field({
    name: 'u',
    label: 'Benutzername',
    hint: forNew ? '3–20 Zeichen: a–z, 0–9 und _' : undefined,
    autocomplete: 'username',
    maxlength: 20,
    pattern: forNew ? '[A-Za-z0-9_]{3,20}' : undefined,
  });
