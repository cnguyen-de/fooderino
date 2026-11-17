import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type Session } from '@supabase/supabase-js';

const url = process.env.E2E_SUPABASE_URL ?? '';
const nitro = process.env.E2E_NITRO_URL ?? '';
const anonKey = process.env.E2E_ANON_KEY ?? '';
const serviceKey = process.env.E2E_SERVICE_ROLE_KEY ?? '';
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);

/** The session cookie @supabase/ssr reads: `sb-<ref>-auth-token`, base64url, chunked at 3180 characters. */
function cookieFor(session: Session): string {
  const name = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  const chunks = value.match(/.{1,3180}/g)!;
  return chunks.length === 1 ? `${name}=${value}` : chunks.map((c, i) => `${name}.${i}=${c}`).join('; ');
}

async function signUp(name: string) {
  const email = `${name}-${Date.now()}@e2e.local`;
  const password = randomBytes(12).toString('hex');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const client = createClient(url, anonKey, noSession);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: created.data.user.id, client, cookie: cookieFor(signed.data.session) };
}

async function call(path: string, init: { cookie?: string; body?: unknown } = {}) {
  const res = await fetch(`${nitro}${path}`, {
    method: init.body === undefined && path.endsWith('status') ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, any> };
}

describe.runIf(nitro)('household endpoints through the built Nitro server', () => {
  let dave: Awaited<ReturnType<typeof signUp>>;
  let erin: Awaited<ReturnType<typeof signUp>>;

  beforeAll(async () => {
    [dave, erin] = await Promise.all([signUp('dave'), signUp('erin')]);
  });

  it('answers 401, not 500, when signed out', async () => {
    expect((await call('/api/household/status')).status).toBe(401);
    expect((await call('/api/household/join', { body: { request_id: crypto.randomUUID(), token: 'x' } })).status).toBe(401);
  });

  it('creates a household once per request id, and refuses a second household', async () => {
    expect((await call('/api/household/status', { cookie: dave.cookie })).body).toEqual({ state: 'none' });
    const request_id = crypto.randomUUID();
    const first = await call('/api/household/create', { cookie: dave.cookie, body: { request_id, name: 'Dave home' } });
    expect(first).toMatchObject({ status: 200, body: { ok: true, merged: 0, copied: 0, bag: 0 } });
    expect(await call('/api/household/create', { cookie: dave.cookie, body: { request_id, name: 'Dave home' } })).toEqual(first);

    const again = await call('/api/household/create', { cookie: dave.cookie, body: { request_id: crypto.randomUUID(), name: 'x' } });
    expect(again.status).toBe(409);
    expect(await call('/api/household/create', { cookie: dave.cookie, body: { name: 'x' } })).toMatchObject({ status: 400 });
    expect((await call('/api/household/status', { cookie: dave.cookie })).body).toMatchObject({
      state: 'member',
      household: { id: first.body.household_id, name: 'Dave home' }
    });
  });

  it('shares a code that joins with bring, and leaving empties the status', async () => {
    const shared = await call('/api/household/share', { cookie: dave.cookie, body: {} });
    expect(shared.status).toBe(200);
    expect(shared.body.url).toContain(`/join?t=${shared.body.token}`);

    const own = await call('/api/household/create', { cookie: erin.cookie, body: { request_id: crypto.randomUUID(), name: 'Erin home' } });
    const applied = await erin.client.rpc('apply_commands', {
      commands: [{
        id: crypto.randomUUID(), household_id: own.body.household_id, item_id: crypto.randomUUID(), at: new Date().toISOString(),
        kind: 'create', item: { name: 'Tea', aliases: [], tags: [], unit: 'count', default_amount: 1, shelf_life_days: null }, start: { amount: 3 }
      }]
    });
    expect(applied.data.results[0].status).toBe('accepted');

    const bad = await call('/api/household/join', { cookie: erin.cookie, body: { request_id: crypto.randomUUID(), token: 'nope' } });
    expect(bad).toMatchObject({ status: 404, body: { message: 'That share code is not valid.' } });

    const joined = await call('/api/household/join', {
      cookie: erin.cookie,
      body: { request_id: crypto.randomUUID(), token: shared.body.token, bring: true }
    });
    expect(joined.body).toEqual({ ok: true, household_id: (await call('/api/household/status', { cookie: dave.cookie })).body.household.id, merged: 0, copied: 1, bag: 0 });
    const { data: tea } = await erin.client.from('items_v2').select('name, amount').eq('household_id', joined.body.household_id);
    expect(tea).toEqual([{ name: 'Tea', amount: 3 }]);

    expect((await call('/api/household/leave', { cookie: erin.cookie, body: { request_id: crypto.randomUUID() } })).status).toBe(200);
    expect((await call('/api/household/status', { cookie: erin.cookie })).body).toEqual({ state: 'none' });
  });
});
