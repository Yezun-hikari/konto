// Deno-only helpers for the Edge Functions (CORS, auth, JSON, service-role client).
// Lives outside _shared/ because _shared/ is also type-checked and bundled by the frontend.
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export class HttpError extends Error {
  /** `message` (optional) is German and safe to show; clients map `code`, the message is a fallback. */
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export interface PublicCtx {
  body: Record<string, unknown>;
  db: SupabaseClient; // service role: bypasses RLS, never expose its results unfiltered
}

export interface Ctx {
  userId: string;
  user: User;
  /** The caller's access token (already verified with auth.getUser). */
  token: string;
  body: Record<string, unknown>;
  db: SupabaseClient; // service role: bypasses RLS, never expose its results unfiltered
}

const PROD_ORIGIN = 'https://yezun.de';
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && (origin === PROD_ORIGIN || DEV_ORIGIN.test(origin))) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TURN_MS = 60_000;

/** Wraps a handler: CORS, POST-only, JSON body, caller authenticated from the Authorization JWT. */
export function serve(handler: (ctx: Ctx) => Promise<unknown>): void {
  serveInternal(true, (auth, body) => handler({ ...auth, body, db }));
}

/** Like serve, but for functions without login (verify_jwt = false): no caller, only the JSON body. */
export function servePublic(handler: (ctx: PublicCtx) => Promise<unknown>): void {
  serveInternal(false, (_req, body) => handler({ body, db }));
}

function serveInternal(
  authenticated: boolean,
  run: (auth: { userId: string; user: User; token: string }, body: Record<string, unknown>) => Promise<unknown>,
): void {
  Deno.serve(async (req) => {
    const cors = corsHeaders(req.headers.get('origin'));
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    try {
      let auth = { userId: '', user: undefined as unknown as User, token: '' };
      if (authenticated) {
        const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
        if (!token) throw new HttpError(401, 'unauthorized');
        const { data, error } = await db.auth.getUser(token);
        if (error || !data.user) throw new HttpError(401, 'unauthorized');
        auth = { userId: data.user.id, user: data.user, token };
      }

      const text = await req.text();
      if (text.length > 4096) throw new HttpError(413, 'too_large');
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new HttpError(400, 'invalid');
      }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'invalid');

      return json(await run(auth, body as Record<string, unknown>));
    } catch (e) {
      if (e instanceof HttpError) {
        return json(e.message !== e.code ? { error: e.code, message: e.message } : { error: e.code }, e.status);
      }
      console.error(e);
      return json({ error: 'internal', message: 'Interner Fehler. Bitte später erneut versuchen.' }, 500);
    }
  });
}

/** Throws on a Supabase error so it ends up as a logged 500, never leaked to the client. */
export function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
