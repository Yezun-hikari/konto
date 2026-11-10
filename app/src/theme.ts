// Theme toggle (system → light → dark), same behaviour as xox. Shown as a plain text button in the footer.
type Mode = 'system' | 'light' | 'dark';

const KEY = 'konto-theme';
const ORDER: Mode[] = ['system', 'light', 'dark'];
const BG = { light: '#f7f6f3', dark: '#161514' };
const LABEL = { system: 'System', light: 'Hell', dark: 'Dunkel' };

function read(): Mode {
  try {
    const v = localStorage.getItem(KEY) as Mode | null;
    return v && ORDER.includes(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

export function initTheme(btn: HTMLButtonElement): void {
  let mode = read();
  const apply = () => {
    const root = document.documentElement;
    if (mode === 'system') delete root.dataset.theme;
    else root.dataset.theme = mode;
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.content = mode === 'system' ? (m.media.includes('dark') ? BG.dark : BG.light) : BG[mode];
    });
    btn.textContent = `Farbschema: ${LABEL[mode]}`;
    btn.setAttribute('aria-label', `Farbschema: ${LABEL[mode]} (wechseln)`);
  };
  btn.addEventListener('click', () => {
    mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* storage blocked: keep for this session only */
    }
    apply();
  });
  apply();
}
