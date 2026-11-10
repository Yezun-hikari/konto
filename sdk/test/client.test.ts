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
const googleUser = (username?: string) => ({
  access_token: 'gacc',
  user: {
    id: 'u2',
    email: 'carol@gmail.example',
    is_anonymous: false,
    app_metadata: { provider: 'google', providers: ['google'], ...(username ? { username } : {}) },
  },
});

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
      refreshSession: vi.fn(async () => ({ data: { session: f.session }, error: null })),
      linkIdentity: vi.fn(async () => ({ data: { provider: 'google', url: 'https://accounts.example/' }, error: null })),
      signInWithOAuth: vi.fn(async () => ({ data: { provider: 'google', url: 'https://accounts.example/' }, error: null })),
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
    expect(createClient).toHaveBeenCalledWith('https://p.supabase.co', 'anon', {
      auth: { storageKey: 'yezun-games-auth', flowType: 'pkce', detectSessionInUrl: true },
    });
    expect(sdk.currentUser()).toEqual({ id: 'u1', username: 'alice', isGuest: false, provider: 'password', needsUsername: false });
  });

  it('uses ?authslot only when allowed', async () => {
    vi.stubGlobal('location', new URL('http://localhost:5173/konto/?authslot=2#/login'));
    let sdk = await load(null, false);
    sdk.configure({ url: 'https://p.supabase.co', anonKey: 'anon', devAuthSlot: true });
    sdk.getClient();
    expect(createClient).toHaveBeenLastCalledWith('https://p.supabase.co', 'anon', { auth: { storageKey: 'yezun-games-auth-2', flowType: 'pkce', detectSessionInUrl: true } });
    sdk = await load(null, false);
    sdk.configure({ url: 'https://p.supabase.co', anonKey: 'anon', devAuthSlot: false });
    sdk.getClient();
    expect(createClient).toHaveBeenLastCalledWith('https://p.supabase.co', 'anon', {
      auth: { storageKey: 'yezun-games-auth', flowType: 'pkce', detectSessionInUrl: true },
    });
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

  it('upgrades a guest in place and stores the recovery email', async () => {
    const sdk = await load(guest);
    fake.auth.updateUser.mockImplementationOnce(async () => ((fake.session = registered), { data: { user: {} }, error: null }));
    const u = await sdk.register('Bob_1', 'password1', ' bob@example.org ');
    expect(fake.auth.updateUser).toHaveBeenCalledWith({ email: 'bob_1@users.yezun-games.invalid', password: 'password1' });
    expect(fake.auth.refreshSession).toHaveBeenCalled();
    expect(fake.auth.signUp).not.toHaveBeenCalled();
    expect(fake.functions.invoke).toHaveBeenLastCalledWith('recovery-email-set', {
      body: { password: 'password1', email: 'bob@example.org' },
    });
    expect(u.isGuest).toBe(false);
  });

  it('validates the email first', async () => {
    const sdk = await load(guest);
    for (const bad of ['', 'nope', 'a@b', 'x@users.yezun-games.invalid', undefined as unknown as string]) {
      await expect(sdk.register('bob', 'password1', bad)).rejects.toThrow('Bitte eine gültige E-Mail-Adresse angeben.');
    }
    await expect(sdk.register('b', 'password1', 'b@example.org')).rejects.toThrow('Benutzername: 3–20 Zeichen');
    await expect(sdk.register('bob', 'short', 'b@example.org')).rejects.toThrow('Passwort: mindestens 8 Zeichen.');
    expect(fake.auth.updateUser).not.toHaveBeenCalled();
    expect(fake.functions.invoke).not.toHaveBeenCalled();
  });

  it('keeps the account when storing the email fails (accountCreated)', async () => {
    const sdk = await load(guest);
    fake.auth.updateUser.mockImplementationOnce(async () => ((fake.session = registered), { data: { user: {} }, error: null }));
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'mail_failed' }, 502) });
    const err = await sdk.register('bob', 'password1', 'bob@example.org').catch((e) => e);
    expect(err).toBeInstanceOf(sdk.AuthFailure);
    expect(err.accountCreated).toBe(true);
    expect(err.message).toBe(
      'Konto erstellt, aber die E-Mail-Adresse konnte nicht gespeichert werden: Die E-Mail konnte nicht gesendet werden. Bitte später erneut. Bitte unter Konto erneut eintragen.',
    );
    expect(sdk.currentUser()?.username).toBe('alice'); // still signed in
    expect(fake.auth.signOut).not.toHaveBeenCalled();
  });

  it('maps a username_taken database error', async () => {
    const sdk = await load(guest);
    fake.auth.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { name: 'AuthApiError', status: 500, code: 'unexpected_failure', message: 'Database error updating user' },
    });
    const err = await sdk.register('bob', 'password1', 'bob@example.org').catch((e) => e);
    expect(err.message).toBe('Dieser Benutzername ist schon vergeben.');
    expect(err.code).toBe('username_taken');
    expect(err.accountCreated).toBeUndefined();
    fake.session = null;
    fake.auth.signUp.mockResolvedValueOnce({ data: {}, error: { name: 'AuthApiError', status: 500, message: 'username_taken' } });
    await expect(sdk.register('bob', 'password1', 'bob@example.org')).rejects.toThrow('Dieser Benutzername ist schon vergeben.');
    expect(fake.functions.invoke).not.toHaveBeenCalled();
  });

  it('signs up without a session and maps taken names', async () => {
    const sdk = await load(null);
    fake.auth.signUp.mockResolvedValueOnce({ data: {}, error: { name: 'AuthApiError', status: 422, code: 'user_already_exists' } });
    await expect(sdk.register('bob', 'password1', 'b@example.org')).rejects.toThrow('Dieser Benutzername ist bereits vergeben.');
    fake.auth.signUp.mockImplementationOnce(async () => ({ data: { session: registered }, error: null }));
    await sdk.register('bob', 'password1', 'b@example.org');
    expect(fake.auth.signUp).toHaveBeenLastCalledWith({ email: 'bob@users.yezun-games.invalid', password: 'password1' });
    expect(fake.functions.invoke).toHaveBeenLastCalledWith('recovery-email-set', { body: { password: 'password1', email: 'b@example.org' } });
  });

  it('refuses to register when already signed in', async () => {
    const sdk = await load(registered);
    await expect(sdk.register('bob', 'password1', 'b@example.org')).rejects.toThrow('Du bist bereits angemeldet.');
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

describe('AuthUser mapping', () => {
  it('derives username, provider and needsUsername', async () => {
    const sdk = await load(null);
    expect(sdk.toAuthUser(null)).toBeNull();
    expect(sdk.toAuthUser(guest.user as never)).toEqual({ id: 'g1', username: null, isGuest: true, provider: 'anonymous', needsUsername: false });
    expect(sdk.toAuthUser(registered.user as never)).toMatchObject({ username: 'alice', provider: 'password', needsUsername: false });
    // app_metadata.username wins over the synthetic email
    expect(sdk.toAuthUser({ ...registered.user, app_metadata: { username: 'alice2' } } as never)?.username).toBe('alice2');
    // invalid claim → synthetic email
    expect(sdk.toAuthUser({ ...registered.user, app_metadata: { username: 'Bad Name' } } as never)?.username).toBe('alice');
    expect(sdk.toAuthUser(googleUser().user as never)).toEqual({ id: 'u2', username: null, isGuest: false, provider: 'google', needsUsername: true });
    expect(sdk.toAuthUser(googleUser('carol').user as never)).toMatchObject({ username: 'carol', provider: 'google', needsUsername: false });
    // a linked former guest: provider 'anonymous', providers include google
    const linked = { id: 'g1', email: 'x@gmail.example', is_anonymous: false, app_metadata: { provider: 'anonymous', providers: ['anonymous', 'google'] } };
    expect(sdk.toAuthUser(linked as never)).toMatchObject({ provider: 'google', needsUsername: true, username: null });
    // the real email local part is never used as username
    expect(sdk.toAuthUser(linked as never)?.username).toBeNull();
  });

  it('currentUser reflects a Google account without username', async () => {
    const sdk = await load(googleUser());
    expect(sdk.currentUser()).toMatchObject({ provider: 'google', needsUsername: true });
    expect(sdk.isGuest()).toBe(false);
  });
});

describe('setUsername', () => {
  it('calls set-username and refreshes the session', async () => {
    const sdk = await load(googleUser());
    fake.auth.refreshSession.mockImplementationOnce(async () => ({ data: { session: googleUser('carol') }, error: null }));
    const u = await sdk.setUsername(' Carol ');
    expect(fake.functions.invoke).toHaveBeenLastCalledWith('set-username', { body: { username: 'carol' } });
    expect(u).toMatchObject({ username: 'carol', needsUsername: false });
    expect(sdk.currentUser()?.username).toBe('carol');
  });
  it('maps username_taken and validates', async () => {
    const sdk = await load(googleUser());
    await expect(sdk.setUsername('x')).rejects.toThrow('Benutzername: 3–20 Zeichen');
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'username_taken' }, 409) });
    await expect(sdk.setUsername('carol')).rejects.toThrow('Dieser Benutzername ist schon vergeben.');
    expect(fake.auth.refreshSession).not.toHaveBeenCalled();
  });
  it('refuses guests and accounts that already have a name', async () => {
    let sdk = await load(guest);
    await expect(sdk.setUsername('carol')).rejects.toThrow('Nicht angemeldet.');
    sdk = await load(registered);
    await expect(sdk.setUsername('carol')).rejects.toThrow('bereits ein Benutzername');
    expect(fake.functions.invoke).not.toHaveBeenCalled();
  });
});

describe('signInWithGoogle', () => {
  const store = () => {
    const m = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    });
    return m;
  };
  const redirect = `https://yezun.de/konto/?return=${encodeURIComponent('https://yezun.de/xox/')}`;

  it('links the current guest to Google', async () => {
    const m = store();
    vi.stubGlobal('location', new URL('https://yezun.de/konto/#/login'));
    const sdk = await load(guest);
    await sdk.signInWithGoogle('https://yezun.de/xox/');
    expect(fake.auth.linkIdentity).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: redirect } });
    expect(fake.auth.signInWithOAuth).not.toHaveBeenCalled();
    const pending = JSON.parse(m.get('yezun-games-auth-oauth')!);
    expect(pending.mode).toBe('link');
    expect(pending.guestToken).toBeUndefined(); // the guest becomes the account: nothing to delete
  });

  it('drops an unsafe return target', async () => {
    store();
    vi.stubGlobal('location', new URL('https://yezun.de/konto/#/login'));
    const sdk = await load(null);
    await sdk.signInWithGoogle('https://evil.example/');
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://yezun.de/konto/' } });
  });

  it('falls back to signInWithOAuth when linking fails and remembers the guest', async () => {
    const m = store();
    vi.stubGlobal('location', new URL('https://yezun.de/konto/#/login'));
    const sdk = await load(guest);
    fake.auth.linkIdentity.mockResolvedValueOnce({
      data: { provider: 'google', url: null },
      error: { name: 'AuthApiError', status: 422, code: 'identity_already_exists', message: 'Identity is already linked' },
    });
    await sdk.signInWithGoogle('https://yezun.de/xox/');
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: redirect } });
    expect(JSON.parse(m.get('yezun-games-auth-oauth')!)).toMatchObject({ mode: 'signin', guestId: 'g1', guestToken: 'guest-token' });
  });

  it('does not fall back on network errors', async () => {
    store();
    const sdk = await load(guest);
    fake.auth.linkIdentity.mockResolvedValueOnce({ data: {}, error: { name: 'AuthRetryableFetchError', status: 0 } });
    await expect(sdk.signInWithGoogle()).rejects.toThrow('Keine Verbindung zum Server.');
    expect(fake.auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('uses signInWithOAuth without a session and refuses when signed in', async () => {
    const m = store();
    const sdk = await load(null);
    await sdk.signInWithGoogle();
    expect(fake.auth.linkIdentity).not.toHaveBeenCalled();
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(JSON.parse(m.get('yezun-games-auth-oauth')!).guestToken).toBeUndefined();
    fake.session = registered;
    await expect(sdk.signInWithGoogle()).rejects.toThrow('Du bist bereits angemeldet.');
  });
});

describe('handleOAuthReturn', () => {
  const pendingStore = (pending: unknown) => {
    const m = new Map<string, string>([['yezun-games-auth-oauth', JSON.stringify({ at: Date.now(), ...(pending as object) })]]);
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    });
    return m;
  };
  const ret = encodeURIComponent('https://yezun.de/xox/');

  it('returns null without callback parameters', async () => {
    vi.stubGlobal('location', new URL('https://yezun.de/konto/#/konto'));
    const sdk = await load(registered);
    expect(sdk.isOAuthReturn()).toBe(false);
    expect(await sdk.handleOAuthReturn()).toBeNull();
  });

  it('deletes the abandoned guest after a Google sign-in', async () => {
    const m = pendingStore({ mode: 'signin', guestId: 'g1', guestToken: 'guest-token' });
    vi.stubGlobal('location', new URL(`https://yezun.de/konto/?return=${ret}&code=abc`));
    const sdk = await load(googleUser());
    expect(sdk.isOAuthReturn()).toBe(true);
    const r = await sdk.handleOAuthReturn();
    expect(r).toMatchObject({ status: 'signed_in', mode: 'signin', returnTo: 'https://yezun.de/xox/', user: { needsUsername: true } });
    expect(fake.functions.invoke).toHaveBeenCalledWith('delete-account', { body: {}, headers: { Authorization: 'Bearer guest-token' } });
    expect(m.size).toBe(0);
    expect(await sdk.handleOAuthReturn()).toBeNull(); // only once
  });

  it('keeps the guest when it was linked (same id)', async () => {
    pendingStore({ mode: 'link' });
    vi.stubGlobal('location', new URL('https://yezun.de/konto/?code=abc'));
    const sdk = await load({ ...googleUser(), user: { ...googleUser().user, id: 'g1' } });
    expect(await sdk.handleOAuthReturn()).toMatchObject({ status: 'signed_in', mode: 'link', returnTo: null });
    expect(fake.functions.invoke).not.toHaveBeenCalled();
  });

  it('falls back to a normal sign-in when the Google identity already has an account', async () => {
    const m = pendingStore({ mode: 'link' });
    vi.stubGlobal('location', new URL(`https://yezun.de/konto/?return=${ret}&error=server_error&error_code=identity_already_exists`));
    const sdk = await load(guest);
    expect(await sdk.handleOAuthReturn()).toEqual({ status: 'redirecting', returnTo: 'https://yezun.de/xox/' });
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `https://yezun.de/konto/?return=${ret}` },
    });
    expect(JSON.parse(m.get('yezun-games-auth-oauth')!)).toMatchObject({ mode: 'signin', guestId: 'g1', guestToken: 'guest-token' });
  });

  it('reports errors from the fragment', async () => {
    pendingStore({ mode: 'signin' });
    vi.stubGlobal('location', new URL('https://yezun.de/konto/#error=access_denied&error_description=x'));
    const sdk = await load(guest);
    expect(await sdk.handleOAuthReturn()).toEqual({ status: 'error', message: 'Die Anmeldung mit Google wurde abgebrochen.', returnTo: null });
    expect(fake.auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('reports a failed code exchange', async () => {
    pendingStore({ mode: 'signin' });
    vi.stubGlobal('location', new URL('https://yezun.de/konto/?code=abc'));
    const sdk = await load(guest);
    expect(await sdk.handleOAuthReturn()).toMatchObject({ status: 'error', message: 'Anmeldung mit Google fehlgeschlagen. Bitte erneut versuchen.' });
  });
});

describe('deleteAccount (Google)', () => {
  it('sends the username confirmation instead of a password', async () => {
    const sdk = await load(googleUser('carol'));
    await expect(sdk.deleteAccount({ confirm: 'bob' })).rejects.toThrow('Der Benutzername stimmt nicht überein.');
    await expect(sdk.deleteAccount()).rejects.toThrow('Der Benutzername stimmt nicht überein.');
    expect(fake.functions.invoke).not.toHaveBeenCalled();
    await sdk.deleteAccount({ confirm: ' Carol ' });
    expect(fake.functions.invoke).toHaveBeenLastCalledWith('delete-account', { body: { confirm: 'carol' } });
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('reports reauth_required with the server message and code', async () => {
    const sdk = await load(googleUser('carol'));
    fake.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: httpError({ error: 'reauth_required', message: 'Bitte melde dich erneut an.' }, 401),
    });
    const err = await sdk.deleteAccount({ confirm: 'carol' }).catch((e) => e);
    expect(err.message).toBe('Bitte melde dich erneut an.');
    expect(err.code).toBe('reauth_required');
    expect(fake.auth.signOut).not.toHaveBeenCalled();
    fake.functions.invoke.mockResolvedValueOnce({ data: null, error: httpError({ error: 'reauth_required' }, 401) });
    await expect(sdk.deleteAccount({ confirm: 'carol' })).rejects.toThrow('erneut mit Google an');
  });

  it('reauthWithGoogle starts a fresh Google sign-in', async () => {
    const m = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
    vi.stubGlobal('location', new URL('https://yezun.de/konto/#/konto'));
    const sdk = await load(googleUser('carol'));
    await sdk.reauthWithGoogle();
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://yezun.de/konto/' } });
    expect(JSON.parse(m.get('yezun-games-auth-oauth')!)).toMatchObject({ mode: 'reauth' });
    const pw = await load(registered);
    await expect(pw.reauthWithGoogle()).rejects.toThrow('Nur für Google-Konten möglich.');
  });

  it('guests delete without argument', async () => {
    const sdk = await load(guest);
    await sdk.deleteAccount();
    expect(fake.functions.invoke).toHaveBeenLastCalledWith('delete-account', { body: {} });
  });
});
