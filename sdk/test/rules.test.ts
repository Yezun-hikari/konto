import { describe, expect, it } from 'vitest';
import { AuthFailure } from '../src/errors.ts';
import { checkPassword, normalizeRecoveryEmail, normalizeUsername, toEmail, USERNAME_RE } from '../src/rules.ts';

describe('username rules', () => {
  it('lowercases and trims', () => {
    expect(normalizeUsername('  Alice_99 ')).toBe('alice_99');
  });
  it.each(['ab', 'a'.repeat(21), 'with space', 'ümlaut', 'a-b', 'a.b', 'a@b', ''])('rejects %j', (u) => {
    expect(() => normalizeUsername(u)).toThrow(AuthFailure);
    expect(() => normalizeUsername(u)).toThrow('Benutzername: 3–20 Zeichen, nur a–z, 0–9 und _.');
  });
  it.each(['abc', 'a'.repeat(20), 'x_1', '___'])('accepts %j', (u) => {
    expect(normalizeUsername(u)).toBe(u);
    expect(USERNAME_RE.test(u)).toBe(true);
  });
  it('maps to the synthetic .invalid address', () => {
    expect(toEmail('alice')).toBe('alice@users.yezun-games.invalid');
  });
});

describe('password rules', () => {
  it('needs 8–72 characters', () => {
    expect(() => checkPassword('1234567')).toThrow('Passwort: mindestens 8 Zeichen.');
    expect(() => checkPassword('x'.repeat(73))).toThrow('Passwort: höchstens 72 Zeichen.');
    expect(() => checkPassword('12345678')).not.toThrow();
    expect(() => checkPassword('x'.repeat(72))).not.toThrow();
  });
});

describe('recovery email rules', () => {
  it('trims valid addresses', () => {
    expect(normalizeRecoveryEmail('  a.b+c@example.org ')).toBe('a.b+c@example.org');
  });
  it.each(['', 'nope', 'a@b', 'a b@example.org', 'x@users.yezun-games.invalid', `${'a'.repeat(250)}@ex.org`])(
    'rejects %j',
    (e) => {
      expect(() => normalizeRecoveryEmail(e)).toThrow('Bitte eine gültige E-Mail-Adresse eingeben.');
    },
  );
});
