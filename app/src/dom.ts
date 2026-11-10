// Small DOM helpers. Rule: user/server data only via textContent / attributes, never innerHTML.
import { AuthFailure, safeReturnUrl } from '../../sdk/src/index.ts';

export const errorText = (e: unknown): string =>
  e instanceof AuthFailure ? e.message : 'Unbekannter Fehler. Bitte erneut versuchen.';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; attrs?: Record<string, string> } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props.className) e.className = props.className;
  if (props.text !== undefined) e.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

/** Screen frame: `<section class="panel"><h1>` + body. */
export function panel(root: HTMLElement, title: string, ...children: Node[]): HTMLElement {
  const h1 = el('h1', { text: title, attrs: { tabindex: '-1' } });
  const s = el('section', { className: 'panel' }, h1, ...children);
  root.append(s);
  return s;
}

export function card(title: string, ...children: Node[]): HTMLElement {
  return el('section', { className: 'card' }, el('h2', { text: title }), ...children);
}

export function note(text: string, kind: '' | 'warn' | 'ok' = ''): HTMLElement {
  return el('p', { className: kind ? `note ${kind}` : 'note', text });
}

export function setMsg(m: HTMLElement, text: string, isError: boolean): void {
  m.textContent = text;
  m.classList.toggle('error', isError);
  m.classList.toggle('ok', !!text && !isError);
}

export function linkBtn(text: string, href: string, primary = false): HTMLAnchorElement {
  return el('a', { className: primary ? 'btn primary' : 'btn', text, attrs: { href } });
}

export interface FieldSpec {
  name: string;
  label: string;
  hint?: string;
  type?: 'text' | 'password' | 'email';
  autocomplete?: string;
  minlength?: number;
  maxlength?: number;
  pattern?: string;
  required?: boolean;
  value?: string;
}

export function field(f: FieldSpec): HTMLLabelElement {
  const span = el('span', { text: f.label });
  if (f.hint) span.append(' ', el('small', { text: f.hint }));
  const input = el('input', { attrs: { name: f.name, type: f.type ?? 'text' } });
  if (f.autocomplete) input.autocomplete = f.autocomplete as AutoFill;
  if (f.minlength) input.minLength = f.minlength;
  if (f.maxlength) input.maxLength = f.maxlength;
  if (f.pattern) input.pattern = f.pattern;
  if (f.required !== false) input.required = true;
  if (f.value) input.value = f.value;
  if (f.type !== 'password') {
    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.setAttribute('autocorrect', 'off');
  }
  return el('label', { className: 'field' }, span, input);
}

/**
 * Form with fields, a status line and a submit button.
 * onSubmit gets the field values; a thrown AuthFailure message is shown as error, a returned string as success.
 */
export function form(
  fields: Node[],
  label: string,
  onSubmit: (values: Record<string, string>, f: HTMLFormElement) => Promise<string | void>,
  danger = false,
): HTMLFormElement {
  const msg = el('p', { className: 'msg', attrs: { role: 'status' } });
  const btn = el('button', { className: danger ? 'btn danger' : 'btn primary', text: label, attrs: { type: 'submit' } });
  const f = el('form', { className: 'form' }, ...fields, msg, btn);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = Object.fromEntries([...new FormData(f)].map(([k, v]) => [k, String(v)]));
    btn.disabled = true;
    setMsg(msg, '', false);
    try {
      const ok = await onSubmit(values, f);
      if (ok) setMsg(msg, ok, false);
    } catch (err) {
      setMsg(msg, errorText(err), true);
    } finally {
      btn.disabled = false;
    }
  });
  return f;
}

/** Validated `return` target of the current route, or null. */
export const returnTarget = (params: URLSearchParams): string | null =>
  safeReturnUrl(params.get('return'), location.origin);

/** Short, readable form of a return URL for link texts ("yezun.de/xox/"). */
export function shortUrl(url: string): string {
  const u = new URL(url);
  return u.host + u.pathname;
}
