// SDK functions against a mocked supabase-js client: config, error mapping, Edge Function calls.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Fn = ReturnType<typeof vi.fn>;
interface Fake {
  session: unknown;
  auth: Record<string, Fn>;
  functions: { invoke: Fn };
  rpc: Fn;
}

let fake: Fake;
const createClient = vi.fn((..._args: unknown[]) => fake);

vi.mock('@supabase/supabase-js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@supabase/supabase-js')>()),
  createClient: (...args: unknown[]) => createClient(...args),
}));

const registered = { access_token: 'acc', user: { id: 'u1', email: 'alice@users.yezun-games.invalid', is_anonymous: false } };
const guest = { access_token: 'guest-token', user: { id: 'g1', is_anonymous: true } };

function makeFake(session: unknown): Fake {
  const f: Fake = {
    session,
    auth: {
      getSession: vi.fn(async () => ({ data: { session: f.session } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
      getUser: vi.fn(async () => ({ data: { user: {} }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      signInWithPassword: vi.fn(async () => ({ data: {}, error: null })),
      signInAnonymously: vi.fn(),
      signUp: vi.fn(async () => ({ data: {}, error: null })),
      updateUser: vi.fn(async () => ({ data: { user: {} }, error: null })),
      refreshSession: vi.fn(async () => ({ data: {}, error: null })),
    },
    functions: { invoke: vi.fn(async () => ({ data: {}, error: null })) },
    rpc: vi.fn(async () => ({ data: [], error: null })),
  };
  return f;
}

const httpError = (body: unknown, status = 400) => new FunctionsHttpError(new Response(JSON.stringify(body), { status }));

async function load(session: unknown = registered, configure = true) {
  vi.resetModules();
  fake = makeFake(session);
  createClient.mockClear();
  const sdk = await import('../src/index.ts');
  if (configure) sdk.configure({ url: 'https://p.supabase.co', anonKey: 'anon' });
  await sdk.ready;
  return sdk;
}

beforeEach(() => vi.unstubAllGlobals());

describe('configuration', () => {
  it('is not configured without env and configure()', async () => {
    const sdk = await load(null, false);
    expect(sdk.isConfigured()).toBe(false);
    expect(() => sdk.getClient()).toThrow('Online-Modus nicht konfiguriert');
    await expect(sdk.login('alice', 'password1')).rejects.toThrow('Online-Modus nicht konfiguriert');
    const cb = vi.fn();
    sdk.onAuthChange(cb);
    expect(cb).toHaveBeenCalledWith(null);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('creates the client lazily with the shared storage key', async () => {
    vi.resetModules();
    fake = makeFake(registered);
    createClient.mockClear();
    const sdk = await import('../src/index.ts');
    expect(createClient).not.toHaveBeenCalled();
    sdk.configure({ url: 'https://p.supabase.co', anonKey: 'anon' });
    await sdk.ready;
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith('https://p.supabase.co', 'anon', { auth: { storageKey: 'yezun-games-auth' } });
    expect(sdk.currentUser()).toEqual({ id: 'u1', username: 'alice', isGuest: false });
  });

  it('uses ?authslot only when allowed', async () => {
    vi.stubGlobal('location', new URL('http://localhost:5173/konto/?authslot=2#/login'));
    let sdk = await load(null, false);
    sdk.configure({ url: 'https://p.supabase.co', anonKey: 'anon', devAuthSlot: true });
    sdk.getClient();
    expect(createClient).toHaveBeenLastCalledWith('https://p.supabase.co', 'anon', { auth: { storageKey: 'yezun-games-auth-2' } });
    sdk = await load(null, false);
    sdk.configure({ url: 'https://p.supabase.co', anonKey: 'anon', devAuthSlot: false });
    sdk.getClient();
    expect(createClient).toHaveBeenLastCalledWith('https://p.supabase.co', 'anon', { auth: { storageKey: 'yezun-games-auth' } });
  });

  it('rejects reconfiguration after first use, accepts identical values', async () => {
    const sdk = await load();
    expect(() => sdk.configure({ url: 'https://p.supabase.co', anonKey: 'anon' })).not.toThrow();
    expect(() => sdk.configure({ url: 'https://other.supabase.co', anonKey: 'anon' })).toThrow(/vor der ersten Nutzung/);
    expect(() => sdk.configure({ url: '', anonKey: 'x' })).toThrow();
  });
});

describe('account links', () => {
  it('builds login / account URLs with a safe return', async () => {
    vi.stubGlobal('location', new URL('https://yezun.de/xox/#/online'));
    const sdk = await load();
    const enc = encodeURIComponent('https://yezun.de/xox/#/online');
    expect(sdk.loginUrl()).toBe(`https://yezun.de/konto/#/login?return=${enc}`);
    expect(sdk.accountUrl()).toBe(`https://yezun.de/konto/#/konto?return=${enc}`);
    expect(sdk.loginUrl('https://evil.example/')).toBe('https://yezun.de/konto/#/login');
  });
  it('honours accountUrl from configure()', async () => {
    vi.stubGlobal('location', new URL('http://localhost:5174/xox/'));
    const sdk = await load(null, false);
    sdk.configure({ url: 'u', anonKey: 'k', accountUrl: 'http://localhost:5173/konto/' });
    expect(sdk.loginUrl()).toBe(`http://localhost:5173/konto/#/login?return=${encodeURIComponent('http://localhost:5174/xox/')}`);
  });
});

describe('login / register (unchanged xox behaviour)', () => {
  it('maps wrong credentials to one message', async () => {
    const sdk = await load(null);
    fake.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { name: 'AuthApiError', status: 400, code: 'invalid_credentials' } });
    await expect(sdk.login('alice', 'password1')).rejects.toThrow('Benutzername oder Passwort falsch.');
    await expect(sdk.login('a', 'password1')).rejects.toThrow('Benutzername oder Passwort falsch.');
    fake.auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: { name: 'AuthApiError', status: 429 } });
    await expect(sdk.login('alice', 'password1')).rejects.toThrow('Zu viele Versuche. Bitte später erneut.');
  });

  it('deletes the abandoned guest after login', async () => {
    const sdk = await load(guest);
    fake.auth.signInWithPassword.mockImplementationOnce(async () => ((fake.session = registered), { data: {}, error: null }));
    await sdk.login('Alice', 'password1');
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'alice@users.yezun-games.invalid', password: 'password1' });
    expect(fake.functions.invoke).toHaveBeenCalledWith('delete-account', { body: {}, headers: { Authorization: 'Bearer guest-token' } });
  });

  it('upgrades a guest in place', async () => {
    const sdk = await load(guest);
    await sdk.register('Bob_1', 'password1');
    expect(fake.auth.updateUser).toHaveBeenCalledWith({ email: 'bob_1@users.yezun-games.invalid', password: 'password1' });
    expect(fake.auth.refreshSession).toHaveBeenCalled();
    expect(fake.auth.signUp).not.toHaveBeenCalled();
  });

  it('signs up without a session and maps taken names', async () => {
    const sdk = await load(null);
    fake.auth.signUp.mockResolvedValueOnce({ data: {}, error: { name: 'AuthApiError', status: 422, code: 'user_already_exists' } });
    await expect(sdk.register('bob', 'password1')).rejects.toThrow('Dieser Benutzername ist bereits vergeben.');
    await expect(sdk.register('bob', 'short')).rejects.toThrow('Passwort: mindestens 8 Zeichen.');
  });

  it('refuses to register when already signed in', async () => {
    const sdk = await load(registered);
    await expect(sdk.register('bob', 'password1')).rejects.toThrow('Du bist bereits angemeldet.');
  });

  it('changePassword goes through the password-change Edge Function', async () => {
    const sdk = await load(registered);
    await expect(sdk.changePassword('', 'password2')).rejects.toThrow('Aktuelles Passwort ist falsch.');
    await expect(sdk.changePassword('old', 'short')).rejects.toThrow('Passwort: mindestens 8 Zeichen.');
    expect(fake.functions.invoke).not.toHaveBeenCalled();
    await sdk.changePassword('oldpassword', 'password2');
    expect(fake.functions.invoke).toHaveBeenLastCalledWith('password-change', {
      body: { password: 'oldpassword', newPassword: 'password2' },
    });
    expect(fake.auth.updateUser).not.toHaveBeenCalled();
    expect(fake.auth.signInWithPassword).not.toHaveBeenCalled();
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'wrong_password' }, 403) });
    await expect(sdk.changePassword('wrong', 'password2')).rejects.toThrow('Aktuelles Passwort ist falsch.');
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'rate_limited' }, 429) });
    await expect(sdk.changePassword('wrong', 'password2')).rejects.toThrow('Zu viele Versuche. Bitte später erneut.');
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'same_password' }) });
    await expect(sdk.changePassword('password2', 'password2')).rejects.toThrow('Das neue Passwort muss sich vom alten unterscheiden.');
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'internal' }, 500) });
    await expect(sdk.changePassword('pw', 'password2')).rejects.toThrow('Passwort konnte nicht geändert werden. Bitte erneut versuchen.');
  });

  it('changePassword requires a registered account', async () => {
    const sdk = await load(guest);
    await expect(sdk.changePassword('pw', 'password2')).rejects.toThrow('Nicht angemeldet.');
    expect(fake.functions.invoke).not.toHaveBeenCalled();
  });
});

describe('deleteAccount', () => {
  it('maps server codes', async () => {
    const sdk = await load(registered);
    await expect(sdk.deleteAccount()).rejects.toThrow('Aktuelles Passwort ist falsch.');
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'wrong_password' }, 403) });
    await expect(sdk.deleteAccount('pw')).rejects.toThrow('Aktuelles Passwort ist falsch.');
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'internal' }, 500) });
    await expect(sdk.deleteAccount('pw')).rejects.toThrow('Löschen fehlgeschlagen. Bitte erneut versuchen.');
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: new Error('fetch failed') });
    await expect(sdk.deleteAccount('pw')).rejects.toThrow('Keine Verbindung zum Server.');
    await sdk.deleteAccount('pw');
    expect(fake.functions.invoke).toHaveBeenLastCalledWith('delete-account', { body: { password: 'pw' } });
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('recovery email / password reset', () => {
  it('setRecoveryEmail validates and calls recovery-email-set', async () => {
    const sdk = await load(registered);
    await expect(sdk.setRecoveryEmail('pw', 'nope')).rejects.toThrow('Bitte eine gültige E-Mail-Adresse eingeben.');
    await expect(sdk.setRecoveryEmail('', 'a@example.org')).rejects.toThrow('Aktuelles Passwort ist falsch.');
    await sdk.setRecoveryEmail('pw', ' a@example.org ');
    expect(fake.functions.invoke).toHaveBeenLastCalledWith('recovery-email-set', { body: { password: 'pw', email: 'a@example.org' } });
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'wrong_password' }, 403) });
    await expect(sdk.setRecoveryEmail('bad', 'a@example.org')).rejects.toThrow('Aktuelles Passwort ist falsch.');
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'internal' }, 500) });
    await expect(sdk.setRecoveryEmail('pw', 'a@example.org')).rejects.toThrow('Speichern fehlgeschlagen. Bitte erneut versuchen.');
  });

  it('requires a registered account', async () => {
    const sdk = await load(guest);
    await expect(sdk.setRecoveryEmail('pw', 'a@example.org')).rejects.toThrow('Nicht angemeldet.');
    await expect(sdk.removeRecoveryEmail('pw')).rejects.toThrow('Nicht angemeldet.');
    await expect(sdk.getRecoveryEmailStatus()).rejects.toThrow('Nicht angemeldet.');
    expect(fake.functions.invoke).not.toHaveBeenCalled();
  });

  it('removeRecoveryEmail calls recovery-email-remove', async () => {
    const sdk = await load(registered);
    await sdk.removeRecoveryEmail('pw');
    expect(fake.functions.invoke).toHaveBeenLastCalledWith('recovery-email-remove', { body: { password: 'pw' } });
  });

  it('getRecoveryEmailStatus reads the RPC and normalizes the row', async () => {
    const sdk = await load(registered);
    fake.rpc.mockResolvedValueOnce({ data: [{ email: 'ma***@example.org', verified: true }], error: null });
    expect(await sdk.getRecoveryEmailStatus()).toEqual({ email: 'ma***@example.org', verified: true });
    expect(fake.rpc).toHaveBeenLastCalledWith('konto_recovery_email_status');
    fake.rpc.mockResolvedValueOnce({ data: { email: 'ma***@example.org', verified: false }, error: null });
    expect(await sdk.getRecoveryEmailStatus()).toEqual({ email: 'ma***@example.org', verified: false });
    fake.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await sdk.getRecoveryEmailStatus()).toEqual({ email: null, verified: false });
    fake.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await sdk.getRecoveryEmailStatus()).toEqual({ email: null, verified: false });
    fake.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(sdk.getRecoveryEmailStatus()).rejects.toThrow('Status konnte nicht geladen werden.');
    fake.rpc.mockResolvedValueOnce({ data: null, error: { code: '', message: 'TypeError: fetch failed' } });
    await expect(sdk.getRecoveryEmailStatus()).rejects.toThrow('Keine Verbindung zum Server.');
    expect(fake.functions.invoke).not.toHaveBeenCalled();
  });

  it('prefers the German server message', async () => {
    const sdk = await load(registered);
    fake.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: httpError({ error: 'mail_unavailable', message: 'Der E-Mail-Versand ist derzeit nicht eingerichtet.' }, 503),
    });
    await expect(sdk.setRecoveryEmail('pw', 'a@example.org')).rejects.toThrow('Der E-Mail-Versand ist derzeit nicht eingerichtet.');
  });

  it('requestPasswordReset normalizes the username', async () => {
    const sdk = await load(null);
    await sdk.requestPasswordReset(' Alice ');
    expect(fake.functions.invoke).toHaveBeenLastCalledWith('password-reset-request', { body: { username: 'alice' } });
    await expect(sdk.requestPasswordReset('a')).rejects.toThrow('Benutzername: 3–20 Zeichen');
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'rate_limited' }, 429) });
    await expect(sdk.requestPasswordReset('alice')).rejects.toThrow('Zu viele Versuche. Bitte später erneut.');
  });

  it('confirmPasswordReset checks token and password', async () => {
    const sdk = await load(null);
    await expect(sdk.confirmPasswordReset('', 'password1')).rejects.toThrow('Der Link ist ungültig oder abgelaufen.');
    await expect(sdk.confirmPasswordReset('tok', 'short')).rejects.toThrow('Passwort: mindestens 8 Zeichen.');
    fake.functions.invoke.mockResolvedValueOnce({ data: { status: 'reset', username: 'alice' }, error: null });
    expect(await sdk.confirmPasswordReset('tok', 'password1')).toEqual({ username: 'alice' });
    expect(fake.functions.invoke).toHaveBeenLastCalledWith('password-reset-confirm', { body: { token: 'tok', password: 'password1' } });
    fake.functions.invoke.mockResolvedValueOnce({ data: { username: '<bad>' }, error: null });
    expect(await sdk.confirmPasswordReset('tok', 'password1')).toEqual({ username: null });
    await sdk.confirmPasswordReset('tok', 'password1');
    expect(fake.functions.invoke).toHaveBeenLastCalledWith('password-reset-confirm', { body: { token: 'tok', password: 'password1' } });
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'invalid_token' }) });
    await expect(sdk.confirmPasswordReset('tok', 'password1')).rejects.toThrow('Der Link ist ungültig oder abgelaufen.');
  });

  it('verifyRecoveryEmail calls recovery-email-verify', async () => {
    const sdk = await load(null);
    await sdk.verifyRecoveryEmail(' tok ');
    expect(fake.functions.invoke).toHaveBeenLastCalledWith('recovery-email-verify', { body: { token: 'tok' } });
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'token_expired' }) });
    await expect(sdk.verifyRecoveryEmail('tok')).rejects.toThrow('Der Link ist ungültig oder abgelaufen.');
  });
});
