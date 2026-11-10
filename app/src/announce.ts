// Screen-reader live region (element in index.html).
export function announce(text: string): void {
  const live = document.getElementById('live');
  if (!live) return;
  // Clear first so repeating the same text is announced again.
  live.textContent = '';
  setTimeout(() => (live.textContent = text), 50);
}
