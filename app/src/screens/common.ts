import { isConfigured, MAX_PASSWORD, MIN_PASSWORD, NOT_CONFIGURED } from '../../../sdk/src/index.ts';
import { field, note, panel, type FieldSpec } from '../dom.ts';

/** Shows the "not configured" view and returns true when the SDK has no Supabase project. */
export function notConfigured(root: HTMLElement, title: string): boolean {
  if (isConfigured()) return false;
  panel(root, title, note(`${NOT_CONFIGURED}. Diese Seite braucht VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY beim Build.`, 'warn'));
  return true;
}

export const pwHint = `(${MIN_PASSWORD}–${MAX_PASSWORD} Zeichen)`;

export const newPasswordFields = (labelPrefix = 'Passwort'): HTMLLabelElement[] => [
  field({ name: 'p', label: labelPrefix, hint: pwHint, type: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD, maxlength: MAX_PASSWORD }),
  field({ name: 'p2', label: `${labelPrefix} wiederholen`, type: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD, maxlength: MAX_PASSWORD }),
];

export const currentPasswordField = (label = 'Aktuelles Passwort', spec: Partial<FieldSpec> = {}): HTMLLabelElement =>
  field({ name: 'old', label, type: 'password', autocomplete: 'current-password', maxlength: MAX_PASSWORD, ...spec });

export const usernameField = (forNew: boolean): HTMLLabelElement =>
  field({
    name: 'u',
    label: 'Benutzername',
    hint: forNew ? '(3–20 Zeichen: a–z, 0–9, _)' : undefined,
    autocomplete: 'username',
    maxlength: 20,
    pattern: forNew ? '[A-Za-z0-9_]{3,20}' : undefined,
  });
