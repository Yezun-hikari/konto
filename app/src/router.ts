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
const routeListeners: ((params: URLSearchParams) => void)[] = [];
let outlet: HTMLElement | null = null;
let cleanup: void | (() => void);
let guard: ((id: string) => string | null) | null = null;

/** Lets a check replace the requested screen (e.g. unconfirmed accounts only see the confirmation screen). */
export function setGuard(fn: (id: string) => string | null): void {
  guard = fn;
}

/** Re-renders the current route (after the guard's answer changed). */
export function refreshRoute(): void {
  render();
}

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

/** Called after every screen change with the route's params (e.g. to update the header). */
export function onRoute(cb: (params: URLSearchParams) => void): void {
  routeListeners.push(cb);
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
  const requested = screens.has(path) ? path : 'konto';
  const guarded = guard?.(requested);
  const id = guarded && screens.has(guarded) ? guarded : requested;
  const screen = screens.get(id)!;
  cleanup?.();
  outlet.replaceChildren();
  document.title = `${screen.title} · Konto · yezun.de`;
  const params = new URLSearchParams(query);
  cleanup = screen.mount(outlet, params);
  for (const cb of routeListeners) cb(params);
  // Move focus to the new screen's heading so screen readers follow the change.
  outlet.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

export function startRouter(el: HTMLElement): void {
  outlet = el;
  window.addEventListener('hashchange', render);
  render();
}
