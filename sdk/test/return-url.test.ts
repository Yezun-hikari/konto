import { describe, expect, it } from 'vitest';
import { buildAccountUrl, safeReturnUrl } from '../src/return-url.ts';

const PROD = 'https://yezun.de';

describe('safeReturnUrl', () => {
  it.each([
    ['https://yezun.de/xox/', 'https://yezun.de/xox/'],
    ['https://yezun.de/xox/#/online', 'https://yezun.de/xox/#/online'],
    ['https://yezun.de', 'https://yezun.de/'],
    ['https://YEZUN.de/handwriting/?a=1', 'https://yezun.de/handwriting/?a=1'],
    ['https://yezun.de:443/xox/', 'https://yezun.de/xox/'],
  ])('accepts %s', (raw, expected) => {
    expect(safeReturnUrl(raw, PROD)).toBe(expected);
    expect(safeReturnUrl(raw)).toBe(expected); // without a current origin too
  });

  it.each([
    'https://evil.example/',
    'https://yezun.de.evil.example/',
    'https://evilyezun.de/',
    'https://sub.yezun.de/',
    'http://yezun.de/xox/',
    'https://yezun.de:8443/',
    'https://user:pw@yezun.de/',
    'https://evil.example@yezun.de/',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example/',
    '/\\evil.example/',
    'https:\\\\evil.example',
    'https://yezun.de/\nx',
    '',
    '   ',
    'https://' + 'a'.repeat(3000),
  ])('rejects %s', (raw) => {
    expect(safeReturnUrl(raw, PROD)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(safeReturnUrl(null, PROD)).toBeNull();
    expect(safeReturnUrl(undefined, PROD)).toBeNull();
    expect(safeReturnUrl(42 as unknown as string, PROD)).toBeNull();
  });

  it('resolves relative paths against the current origin', () => {
    expect(safeReturnUrl('/xox/#/online', PROD)).toBe('https://yezun.de/xox/#/online');
    expect(safeReturnUrl('/xox/')).toBeNull(); // no origin to resolve against
  });

  it('accepts the same origin', () => {
    expect(safeReturnUrl('http://localhost:5173/xox/', 'http://localhost:5173')).toBe('http://localhost:5173/xox/');
  });

  it('accepts other localhost ports only when running on localhost', () => {
    expect(safeReturnUrl('http://localhost:5174/xox/', 'http://localhost:5173')).toBe('http://localhost:5174/xox/');
    expect(safeReturnUrl('http://127.0.0.1:5174/', 'http://localhost:5173')).toBe('http://127.0.0.1:5174/');
    expect(safeReturnUrl('http://localhost:5174/xox/', PROD)).toBeNull();
    expect(safeReturnUrl('http://localhost:5174/xox/')).toBeNull();
  });

  it('ignores an invalid current origin', () => {
    expect(safeReturnUrl('https://yezun.de/x', 'not a url')).toBe('https://yezun.de/x');
    expect(safeReturnUrl('https://evil.example/', 'not a url')).toBeNull();
  });
});

describe('buildAccountUrl', () => {
  it('adds an encoded return parameter for safe targets', () => {
    expect(buildAccountUrl('https://yezun.de/konto/', 'login', 'https://yezun.de/xox/#/online?x=1&y=2', PROD)).toBe(
      'https://yezun.de/konto/#/login?return=' + encodeURIComponent('https://yezun.de/xox/#/online?x=1&y=2'),
    );
  });
  it('drops unsafe or missing targets', () => {
    expect(buildAccountUrl('https://yezun.de/konto/', 'konto', 'https://evil.example/', PROD)).toBe(
      'https://yezun.de/konto/#/konto',
    );
    expect(buildAccountUrl('https://yezun.de/konto/', 'konto', undefined)).toBe('https://yezun.de/konto/#/konto');
  });
  it('ignores a hash in the base', () => {
    expect(buildAccountUrl('https://yezun.de/konto/#/x', 'login', null)).toBe('https://yezun.de/konto/#/login');
  });
});
