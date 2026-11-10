import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Account page: source in app/, served by GitHub Pages under https://yezun.de/konto/
export default defineConfig({
  root: here('./app'),
  base: '/konto/',
  envDir: here('./'), // .env / .env.local in the repo root, not in app/
  build: { outDir: here('./dist'), emptyOutDir: true },
});
