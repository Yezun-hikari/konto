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

/** Screen frame: `<div class="panel"><h1>` + body. */
export function panel(root: HTMLElement, title: string, ...children: Node[]): HTMLElement {
  const h1 = el('h1', { text: title, attrs: { tabindex: '-1' } });
  const s = el('div', { className: 'panel' }, h1, ...children);
  root.append(s);
  return s;
}

/** A titled section of a screen; sections are separated by hairlines. */
export function section(title: string, ...children: Node[]): HTMLElement {
  return el('section', { className: 'section' }, el('h2', { text: title }), ...children);
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

let fieldSeq = 0;

/** Label above the input, optional hint text below it (linked via aria-describedby). */
export function field(f: FieldSpec): HTMLElement {
  const id = `f${++fieldSeq}-${f.name}`;
  const label = el('label', { text: f.label, attrs: { for: id } });
  const input = el('input', { attrs: { id, name: f.name, type: f.type ?? 'text' } });
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
  const box = el('div', { className: 'field' }, label, input);
  if (f.hint) {
    const hint = el('p', { className: 'hint', text: f.hint, attrs: { id: `${id}-hint` } });
    input.setAttribute('aria-describedby', hint.id);
    box.append(hint);
  }
  return box;
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

/**
 * Message carried across a navigation (e.g. register → account page). Readable for a few seconds, because one
 * navigation can mount a screen twice (auth change + hash change).
 */
let flash: { text: string; kind: 'ok' | 'warn'; at: number } | null = null;
export function setFlash(text: string, kind: 'ok' | 'warn'): void {
  flash = { text, kind, at: Date.now() };
}
export function takeFlash(): { text: string; kind: 'ok' | 'warn' } | null {
  if (flash && Date.now() - flash.at > 4000) flash = null;
  return flash;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Google's "G" mark (static, built with createElementNS). */
export function googleMark(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const paths: [string, string][] = [
    ['#EA4335', 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'],
    ['#4285F4', 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'],
    ['#FBBC05', 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'],
    ['#34A853', 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'],
  ];
  for (const [fill, d] of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', fill);
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
