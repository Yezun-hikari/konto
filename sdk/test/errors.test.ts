import { FunctionsFetchError, FunctionsHttpError, type AuthError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { AuthFailure, fail, functionErrorCode, functionFailure } from '../src/errors.ts';

const authError = (p: Partial<AuthError>) => ({ name: 'AuthApiError', message: 'x', ...p }) as AuthError;
const httpError = (body: unknown, status = 400) =>
  new FunctionsHttpError(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

describe('fail (GoTrue errors)', () => {
  it.each([
    [undefined, 'Unbekannter Fehler. Bitte erneut versuchen.'],
    [authError({ status: 429 }), 'Zu viele Versuche. Bitte später erneut.'],
    [authError({ code: 'over_request_rate_limit', status: 400 }), 'Zu viele Versuche. Bitte später erneut.'],
    [authError({ name: 'AuthRetryableFetchError' }), 'Keine Verbindung zum Server.'],
    [authError({ status: 0 }), 'Keine Verbindung zum Server.'],
    [authError({ status: 422, code: 'user_already_exists' }), 'Dieser Benutzername ist bereits vergeben.'],
    [authError({ status: 422, code: 'email_exists' }), 'Dieser Benutzername ist bereits vergeben.'],
    [authError({ status: 422, code: 'weak_password' }), 'Passwort zu schwach (mindestens 8 Zeichen).'],
    [authError({ status: 422, code: 'same_password' }), 'Das neue Passwort muss sich vom alten unterscheiden.'],
    [authError({ status: 422, code: 'signup_disabled' }), 'Anmeldung ist derzeit deaktiviert.'],
    [authError({ status: 422, code: 'anonymous_provider_disabled' }), 'Anmeldung ist derzeit deaktiviert.'],
    [authError({ status: 500, code: 'whatever' }), 'Unbekannter Fehler. Bitte erneut versuchen.'],
  ])('%o → %s', (e, msg) => {
    const f = fail(e as AuthError | undefined);
    expect(f).toBeInstanceOf(AuthFailure);
    expect(f.message).toBe(msg);
  });
  it('uses the fallback', () => {
    expect(fail(null, 'X').message).toBe('X');
  });
});

describe('functionFailure (Edge Function errors)', () => {
  it.each([
    [{ error: 'wrong_password' }, 403, 'Aktuelles Passwort ist falsch.'],
    [{ error: 'rate_limited' }, 429, 'Zu viele Versuche. Bitte später erneut.'],
    [{}, 429, 'Zu viele Versuche. Bitte später erneut.'],
    [{ error: 'invalid_token' }, 400, 'Der Link ist ungültig oder abgelaufen.'],
    [{ error: 'token_expired' }, 400, 'Der Link ist ungültig oder abgelaufen.'],
    [{ error: 'invalid_email' }, 400, 'Bitte eine gültige E-Mail-Adresse eingeben.'],
    [{ error: 'unauthorized' }, 401, 'Sitzung abgelaufen. Bitte erneut anmelden.'],
    ['not json', 401, 'Sitzung abgelaufen. Bitte erneut anmelden.'],
    [{ error: 'internal' }, 500, 'FALLBACK'],
    ['oops', 500, 'FALLBACK'],
  ])('%o (%i) → %s', async (body, status, msg) => {
    const f = await functionFailure(httpError(body, status), 'FALLBACK');
    expect(f).toBeInstanceOf(AuthFailure);
    expect(f.message).toBe(msg);
  });

  it('maps network / relay errors to "Keine Verbindung"', async () => {
    expect((await functionFailure(new FunctionsFetchError(new Error('x')))).message).toBe('Keine Verbindung zum Server.');
    expect((await functionFailure(new Error('x'))).message).toBe('Keine Verbindung zum Server.');
    expect(await functionErrorCode(new Error('x'))).toBeNull();
  });

  it('prefers the server message over the code map, overrides over both', async () => {
    const e = () => httpError({ error: 'invalid_token', message: 'Der Link ist ungültig, abgelaufen oder wurde schon verwendet.' });
    expect((await functionFailure(e(), 'F')).message).toBe('Der Link ist ungültig, abgelaufen oder wurde schon verwendet.');
    expect((await functionFailure(e(), 'F', { invalid_token: 'O' })).message).toBe('O');
    expect((await functionFailure(httpError({ error: 'x', message: '   ' }), 'F')).message).toBe('F');
    expect((await functionFailure(httpError({ error: 'x', message: 'y'.repeat(500) }), 'F')).message).toHaveLength(300);
  });

  it('applies overrides', async () => {
    expect((await functionFailure(httpError({ error: 'invalid' }), 'F', { invalid: 'O' })).message).toBe('O');
  });
});
