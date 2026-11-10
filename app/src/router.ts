/**
 * Hash router: `#/<id>?key=value`. Unknown ids fall back to 'konto'.
 * A screen's `mount` may return a cleanup function.
 */
export interface Screen {
  /** Document title prefix. */
  title: string;
  mount(root: HTMLElement, params: URLSearchParams): void | (() => void);
}

const screens = new Map<string, Screen>();
let outlet: HTMLElement | null = null;
let cleanup: void | (() => void);

export function registerScreen(id: string, screen: Screen): void {
  screens.set(id, screen);
}

/** `#/<id>?<params>` (empty params are left out). */
export function href(id: string, params?: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) q.set(k, v);
  const s = q.toString();
  return `#/${id}${s ? '?' + s : ''}`;
}

export function navigate(id: string, params?: Record<string, string | null | undefined>, replace = false): void {
  const h = href(id, params);
  if (replace) {
    history.replaceState(null, '', h);
    render();
  } else {
    location.hash = h;
  }
}

/** Removes secrets (tokens) from the address bar without re-rendering. */
export function scrubParams(id: string, keep?: Record<string, string | null | undefined>): void {
  if (location.hash.replace(/^#\/?/, '').split('?')[0] !== id) return; // user has moved on
  history.replaceState(null, '', href(id, keep));
}

function render(): void {
  if (!outlet) return;
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const id = screens.has(path) ? path : 'konto';
  const screen = screens.get(id)!;
  cleanup?.();
  outlet.replaceChildren();
  document.title = `${screen.title} · Konto · yezun.de`;
  cleanup = screen.mount(outlet, new URLSearchParams(query));
  // Move focus to the new screen's heading so screen readers follow the change.
  outlet.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

export function startRouter(el: HTMLElement): void {
  outlet = el;
  window.addEventListener('hashchange', render);
  render();
}
