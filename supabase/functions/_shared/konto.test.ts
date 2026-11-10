import { describe, expect, it } from 'vitest';
import {
  base64url,
  escapeHtml,
  normalizeEmail,
  normalizeUsername,
  resetMail,
  TOKEN_RE,
  usernameFromEmail,
  validPassword,
  verifyMail,
} from './konto.ts';

describe('normalizeEmail', () => {
  it('accepts plain addresses and lower-cases the domain only', () => {
    expect(normalizeEmail('  Max.Muster+tag@Example.DE ')).toBe('Max.Muster+tag@example.de');
    expect(normalizeEmail('a@b.co')).toBe('a@b.co');
    expect(normalizeEmail('x@sub.xn--bcher-kva.ch')).toBe('x@sub.xn--bcher-kva.ch');
  });
  it('rejects malformed, reserved and non-string input', () => {
    for (const bad of [
      '', 'a', 'a@b', '@example.com', 'a@@example.com', 'a@b@example.com', 'a b@example.com', 'a..b@example.com',
      '.a@example.com', 'a@-example.com', 'a@example.c', 'a@example.123', 'alice@users.yezun-games.invalid',
      'a@example.test', 'a@localhost', '"a"@example.com', 'a<b>@example.com', 'ä@example.com', 'a@exämple.com',
      'a\n@example.com', `${'a'.repeat(65)}@example.com`, `a@${'b'.repeat(250)}.de`,
    ]) {
      expect(normalizeEmail(bad), bad).toBeNull();
    }
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe('usernames and passwords', () => {
  it('normalizes usernames like the SDK', () => {
    expect(normalizeUsername(' Alice_1 ')).toBe('alice_1');
    expect(normalizeUsername('ab')).toBeNull();
    expect(normalizeUsername('a'.repeat(21))).toBeNull();
    expect(normalizeUsername('al ice')).toBeNull();
    expect(normalizeUsername(undefined)).toBeNull();
  });
  it('extracts the username from the synthetic address only', () => {
    expect(usernameFromEmail('alice@users.yezun-games.invalid')).toBe('alice');
    expect(usernameFromEmail('alice@example.com')).toBeNull();
    expect(usernameFromEmail(undefined)).toBeNull();
  });
  it('checks password length 8..72', () => {
    expect(validPassword('12345678')).toBe(true);
    expect(validPassword('1234567')).toBe(false);
    expect(validPassword('x'.repeat(73))).toBe(false);
    expect(validPassword(12345678)).toBe(false);
  });
});

describe('tokens', () => {
  it('encodes 32 bytes as 43 base64url characters', () => {
    const t = base64url(new Uint8Array(32).fill(255));
    expect(t).toHaveLength(43);
    expect(TOKEN_RE.test(t)).toBe(true);
    expect(base64url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
  });
});

describe('mails', () => {
  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
  it('builds German verify and reset mails with the token link', () => {
    const token = 'A'.repeat(43);
    const v = verifyMail('alice', token);
    expect(v.subject).toBe('Wiederherstellungs-E-Mail bestätigen');
    expect(v.text).toContain(`https://yezun.de/konto/#/verify-email?token=${token}`);
    expect(v.html).toContain(`href="https://yezun.de/konto/#/verify-email?token=${token}"`);
    const r = resetMail('alice', token);
    expect(r.subject).toBe('Passwort zurücksetzen');
    expect(r.text).toContain(`https://yezun.de/konto/#/reset?token=${token}`);
    expect(r.text).toContain('1 Stunde');
  });
});
