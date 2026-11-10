import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('default config on yezun.de', () => {
  it('is configured on https://yezun.de without env or configure()', async () => {
    vi.stubGlobal('location', new URL('https://yezun.de/xox/'));
    const sdk = await import('../src/index.ts');
    expect(sdk.YEZUN_DEFAULT_CONFIG.url).toMatch(/^https:\/\/[a-z]+\.supabase\.co$/);
    expect(sdk.isConfigured()).toBe(true);
  });
  it('stays unconfigured elsewhere', async () => {
    vi.stubGlobal('location', new URL('https://example.com/'));
    const sdk = await import('../src/index.ts');
    expect(sdk.isConfigured()).toBe(false);
  });
});
