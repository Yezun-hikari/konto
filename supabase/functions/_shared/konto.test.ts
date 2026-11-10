import { describe, expect, it } from 'vitest';
import {
  accountKind,
  accountUsername,
  base64url,
  isEmailVerified,
  isFreshLogin,
  jwtClaims,
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

describe('accountKind', () => {
  it('distinguishes guests, password, Google and other accounts', () => {
    expect(accountKind({ is_anonymous: true, identities: [{ provider: 'google' }] })).toBe('anonymous');
    expect(accountKind({ email: 'max@users.yezun-games.invalid', identities: [{ provider: 'email' }] })).toBe('password');
    expect(accountKind({ email: 'max@users.yezun-games.invalid' })).toBe('password');
    expect(accountKind({ email: 'max@users.yezun-games.invalid', identities: [{ provider: 'email' }, { provider: 'google' }] }))
      .toBe('password');
    expect(accountKind({ email: 'max@gmail.com', identities: [{ provider: 'google' }] })).toBe('google');
    expect(accountKind({ email: 'max@gmail.com', identities: null })).toBe('other');
  });
});

describe('accountUsername / isEmailVerified', () => {
  it('prefers app_metadata.username and falls back to the synthetic address', () => {
    expect(accountUsername({ app_metadata: { username: 'anna' }, email: 'x@gmail.com' })).toBe('anna');
    expect(accountUsername({ app_metadata: {}, email: 'max@users.yezun-games.invalid' })).toBe('max');
    expect(accountUsername({ app_metadata: { username: 'Bad Name' }, email: 'x@gmail.com' })).toBeNull();
  });
  it('needs email_verified === true', () => {
    expect(isEmailVerified({ app_metadata: { email_verified: true } })).toBe(true);
    expect(isEmailVerified({ app_metadata: { email_verified: 'true' } })).toBe(false);
    expect(isEmailVerified({ app_metadata: null })).toBe(false);
  });
});

const jwt = (claims: unknown) =>
  `x.${base64url(new TextEncoder().encode(JSON.stringify(claims)))}.sig`;

describe('jwtClaims', () => {
  it('decodes the payload, null for garbage', () => {
    expect(jwtClaims(jwt({ sub: 'a', iat: 5, name: 'Jörg' }))).toEqual({ sub: 'a', iat: 5, name: 'Jörg' });
    expect(jwtClaims('nope')).toBeNull();
    expect(jwtClaims(jwt([1, 2]))).toBeNull();
  });
});

describe('isFreshLogin', () => {
  const now = 1_800_000_000;
  it('accepts a token issued and signed in within 10 minutes', () => {
    expect(isFreshLogin({ iat: now - 60, amr: [{ method: 'oauth', timestamp: now - 60 }] }, now)).toBe(true);
    expect(isFreshLogin({ iat: now - 600 }, now)).toBe(true);
    expect(isFreshLogin({ iat: now + 30 }, now)).toBe(true);
  });
  it('rejects old tokens, refreshed tokens of an old sign-in and missing claims', () => {
    expect(isFreshLogin({ iat: now - 601 }, now)).toBe(false);
    expect(isFreshLogin({ iat: now - 10, amr: [{ method: 'oauth', timestamp: now - 3600 }] }, now)).toBe(false);
    expect(isFreshLogin({ iat: now + 120 }, now)).toBe(false);
    expect(isFreshLogin({ iat: '1' }, now)).toBe(false);
    expect(isFreshLogin({}, now)).toBe(false);
    expect(isFreshLogin(null, now)).toBe(false);
  });
  it('uses the newest amr entry', () => {
    const amr = [{ method: 'password', timestamp: now - 9999 }, { method: 'oauth', timestamp: now - 5 }];
    expect(isFreshLogin({ iat: now - 5, amr }, now)).toBe(true);
  });
});
