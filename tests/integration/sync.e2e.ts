import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CookedId, RecipeId } from '~~/types/cook';
import { createCookOps } from '~~/utils/cook';
import type { BagId, CommandId, HouseholdId, Instant, Item, LocalDate } from '~~/types/pantry';
import type { QueuedCommand } from '~~/types/sync';
import { createSupabaseTransport } from '~/utils/supabase-transport';
import { runMove } from '~~/utils/household-move';
import { createPantryOps } from '~~/utils/pantry-ops';
import { HOUSEHOLD_TABLES, SHEET_TABLES, type HouseholdTableDef } from '~~/utils/sync-registry';
import { TransportRefused } from '~~/utils/sync-engine';
import { makeDevice, project, type Device } from '../support/device';

const url = process.env.E2E_SUPABASE_URL ?? '';
const anonKey = process.env.E2E_ANON_KEY ?? '';
const serviceKey = process.env.E2E_SERVICE_ROLE_KEY ?? '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  throw new Error('E2E_SUPABASE_URL must point at a local stack; run tests/integration/run.sh');
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);
const clients: SupabaseClient[] = [];

async function signUp(name: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `${name}-${Date.now()}@e2e.local`;
  const password = randomBytes(12).toString('hex');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (created.error) throw created.error;
  const client = createClient(url, anonKey, noSession);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  clients.push(client);
  return { id: created.data.user.id, client };
}

async function byName(d: Device, name: string): Promise<Item> {
  const items = [...(await project(d.db)).snapshot.items.values()];
  const found = items.find((i) => i.name.toLowerCase() === name.toLowerCase() && !i.merged_into && !i.deleted_at);
  if (!found) throw new Error(`${name} is not on this device`);
  return found;
}

async function serverRow(table: string, column: string, value: string) {
  const { data, error } = await admin.from(table).select('*').eq(column, value);
  if (error) throw error;
  return data;
}

async function lastQueued(d: Device): Promise<QueuedCommand> {
  return (await d.db.commands.orderBy('created_seq').last())!;
}

async function waitFor(check: () => Promise<boolean>, ms: number): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (await check()) return Date.now() - started;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`condition not met within ${ms} ms`);
}

let alice: { id: string; client: SupabaseClient };
let bob: { id: string; client: SupabaseClient };
let carol: { id: string; client: SupabaseClient };
let A: Device;
let B: Device;
let home: HouseholdId;

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([signUp('alice'), signUp('bob'), signUp('carol')]);
  A = await makeDevice(createSupabaseTransport(alice.client), null);
  B = await makeDevice(createSupabaseTransport(bob.client), null);
});

afterAll(async () => {
  await Promise.all(clients.map((c) => c.removeAllChannels()));
});

describe('two devices through PostgREST, RLS and Realtime', () => {
  it('creates a household per user, and a retried request replays its first result', async () => {
    const request = crypto.randomUUID();
    const created = await runMove(admin, alice.id, request, { action: 'create', args: { name: 'Alice home' } });
    expect(created).toMatchObject({ ok: true });
    home = (created as { household_id: HouseholdId }).household_id;
    expect(await runMove(admin, alice.id, request, { action: 'create', args: { name: 'Other' } })).toEqual(created);
    expect(await runMove(admin, bob.id, crypto.randomUUID(), { action: 'create', args: { name: 'Bob home' } })).toMatchObject({ ok: true });

    for (const d of [A, B]) {
      expect(await d.engine.syncMembership()).toBe('changed');
      await d.engine.sync('full');
    }
    expect((await A.db.households.get(home))?.name).toBe('Alice home');
    expect(await B.db.households.get(home)).toBeUndefined();
  });

  it('joins with bring: matching names merge, the rest are copied, and B re-hydrates into the new household', async () => {
    await A.ops.createItem({ name: 'milk', amount: 2, best_before: '2026-12-10' as LocalDate });
    await B.ops.createItem({ name: 'Milk', amount: 1, best_before: '2026-12-01' as LocalDate });
    await B.ops.createItem({ name: 'Coffee', amount: 2, tags: [{ kind: 'place', name: 'Pantry' }] });
    await A.engine.sync('full');
    await B.engine.sync('full');
    expect(await B.db.commands.count()).toBe(0);

    const token = randomBytes(24).toString('base64url');
    const minted = await alice.client.from('household_share_tokens').insert({
      token_hash: createHash('sha256').update(token, 'utf8').digest('hex'),
      household_id: home,
      created_by: alice.id,
      expires_at: new Date(Date.now() + 3600_000).toISOString()
    });
    expect(minted.error).toBeNull();

    await B.engine.flush();
    const joined = await runMove(admin, bob.id, crypto.randomUUID(), { action: 'join', args: { token, bring: true } });
    expect(joined).toEqual({ ok: true, household_id: home, merged: 1, copied: 1, bag: 0 });

    expect(await B.engine.syncMembership()).toBe('changed');
    await B.engine.sync('full');
    await A.engine.sync('full');
    for (const d of [A, B]) {
      expect(await byName(d, 'milk')).toMatchObject({ amount: 3, best_before: '2026-12-01', aliases: [] });
      expect(await byName(d, 'Coffee')).toMatchObject({ amount: 2, tags: [{ kind: 'place', name: 'Pantry' }] });
    }
    expect((await B.db.members.toArray()).filter((m) => !m.deleted_at).map((m) => m.user_id).sort()).toEqual(
      [alice.id, bob.id].sort()
    );
  });

  it('A creates an item and B pulls it', async () => {
    await A.ops.createItem({ name: 'Eggs', amount: 1 });
    await A.engine.sync('push');
    await B.engine.sync('full');
    expect(await byName(B, 'Eggs')).toMatchObject({ amount: 1 });
  });

  it('two offline uses of the last one: one is accepted, the other rejected and surfaced', async () => {
    const eggs = await byName(A, 'Eggs');
    expect(await A.ops.useUp(eggs.id)).not.toBeNull();
    expect(await B.ops.useUp(eggs.id)).not.toBeNull();
    const aUse = await lastQueued(A);
    const bUse = await lastQueued(B);

    await A.engine.sync('full');
    await B.engine.sync('full');
    await A.engine.sync('full');

    expect(A.notices).toEqual([]);
    expect(B.notices).toEqual([
      expect.objectContaining({ command: bUse.id, kind: 'use', reason: 'insufficient_stock', item_name: 'Eggs' })
    ]);
    expect(await serverRow('command_log', 'command_id', aUse.id)).toHaveLength(1);
    expect(await serverRow('rejected_commands', 'command_id', bUse.id)).toEqual([
      expect.objectContaining({ reason: 'insufficient_stock' })
    ]);
    expect((await serverRow('items_v2', 'id', eggs.id))[0].amount).toBe(0);
    for (const d of [A, B]) {
      expect((await byName(d, 'Eggs')).amount).toBe(0);
      expect(await d.db.commands.count()).toBe(0);
    }
  });

  it('two ticks of the same listed item both land', async () => {
    await A.ops.createItem({ name: 'Bread', to_buy: 2 });
    await A.engine.sync('full');
    await B.engine.sync('full');
    const bread = await byName(A, 'Bread');

    await A.ops.tick(bread.id);
    await B.ops.tick(bread.id);
    await A.engine.sync('full');
    await B.engine.sync('full');
    await A.engine.sync('full');

    const entries = await serverRow('bag_entries', 'item_id', bread.id);
    expect(entries.map((e) => [e.state, e.qty, e.from_list]).sort()).toEqual([
      ['open', 2, 0],
      ['open', 2, 2]
    ]);
    const purchases = (await serverRow('item_events', 'item_id', bread.id)).filter((e) => e.kind === 'purchase');
    expect(purchases).toHaveLength(2);
    for (const d of [A, B]) {
      expect((await byName(d, 'Bread')).to_buy).toBe(0);
      expect([...(await project(d.db)).snapshot.bag.values()].filter((b) => b.state === 'open')).toHaveLength(2);
    }
  });

  it('B unpacks the bag entry A ticked', async () => {
    const bread = await byName(A, 'Bread');
    const aTick = (await serverRow('command_log', 'kind', 'tick')).find(
      (l) => l.actor === alice.id && l.item_ids.includes(bread.id)
    );
    const entry = (await serverRow('bag_entries', 'opened_by', aTick.command_id))[0];

    const handle = await B.ops.unpack([
      { bag_id: entry.id as BagId, best_before: '2026-12-05' as LocalDate, place: 'Bread bin' }
    ]);
    expect(handle?.commands).toHaveLength(1);
    await B.engine.sync('full');
    await A.engine.sync('full');

    const after = (await serverRow('bag_entries', 'id', entry.id))[0];
    expect(after).toMatchObject({ state: 'unpacked', closed_by_command: handle!.commands[0]!.id });
    for (const d of [A, B]) {
      expect(await byName(d, 'Bread')).toMatchObject({
        amount: 2,
        best_before: '2026-12-05',
        tags: [{ kind: 'place', name: 'Bread bin' }]
      });
    }
  });

  it('undo after confirmation restores the stock on every device', async () => {
    const coffee = await byName(A, 'Coffee');
    const handle = await A.ops.useUp(coffee.id);
    await A.engine.sync('full');
    expect(await A.db.commands.count()).toBe(0);
    expect((await serverRow('items_v2', 'id', coffee.id))[0].amount).toBe(1);

    await A.ops.undo(handle!);
    expect((await byName(A, 'Coffee')).amount).toBe(2);
    await A.engine.sync('full');
    await B.engine.sync('full');

    expect((await serverRow('items_v2', 'id', coffee.id))[0].amount).toBe(2);
    expect((await serverRow('command_log', 'command_id', handle!.commands[0]!.id))[0].undone_by).not.toBeNull();
    expect((await byName(B, 'Coffee')).amount).toBe(2);
    expect(A.notices).toEqual([]);
  });

  it('an older metadata sheet loses to a newer one, on the server and both devices', async () => {
    const milk = await byName(A, 'milk');
    const aliceAnHourAgo = createPantryOps({ db: A.db, now: () => new Date(Date.now() - 3600_000) });

    await aliceAnHourAgo.editItem(milk.id, { name: 'Milk (Alice)' });
    await B.ops.editItem(milk.id, { name: 'Milk (Bob)' });
    await B.engine.sync('full');
    await A.engine.sync('full');
    await B.engine.sync('full');

    expect((await serverRow('items_v2', 'id', milk.id))[0].name).toBe('Milk (Bob)');
    expect((await project(A.db)).snapshot.items.get(milk.id)?.name).toBe('Milk (Bob)');
    expect((await project(B.db)).snapshot.items.get(milk.id)?.name).toBe('Milk (Bob)');
    expect(await A.db.edits.count()).toBe(0);
  });

  it("A's recipe and cooked dish reach B; an outsider can neither read nor write them", async () => {
    const milk = await byName(A, 'Milk (Bob)');
    const recipe = crypto.randomUUID() as RecipeId;
    const dish = crypto.randomUUID() as CookedId;
    const use = crypto.randomUUID() as CommandId;
    const at = new Date().toISOString() as Instant;
    await A.db.edits.bulkPut([
      {
        store: 'cooked',
        id: dish,
        household_id: home,
        recipe_id: recipe,
        date: '2026-11-18' as LocalDate,
        uses: [use],
        deleted_at: null,
        updated_at: at
      },
      {
        store: 'recipes',
        id: recipe,
        household_id: home,
        name: 'Canh chua',
        kind: 'soup',
        ingredients: [
          { name: 'Milk', item_id: milk.id, qty: { amount: 200, unit: 'gram' } },
          { name: 'Tamarind', item_id: null, qty: null }
        ],
        instructions: 'Boil.',
        deleted_at: null,
        updated_at: at
      }
    ]);
    await A.engine.sync('full');
    await B.engine.sync('full');

    expect(await A.db.edits.count()).toBe(0);
    expect(await B.db.recipes.get(recipe)).toMatchObject({ name: 'Canh chua', kind: 'soup', household_id: home });
    expect((await B.db.recipes.get(recipe))?.ingredients[0]).toEqual({
      name: 'Milk',
      item_id: milk.id,
      qty: { amount: 200, unit: 'gram' }
    });
    expect(await B.db.cooked.get(dish)).toMatchObject({ recipe_id: recipe, date: '2026-11-18', uses: [use] });

    const outsider = createSupabaseTransport(carol.client);
    for (const store of ['recipes', 'cooked']) {
      const def = HOUSEHOLD_TABLES.find((d) => d.store === store)! as HouseholdTableDef;
      expect(await outsider.pull(def, home, 0, 1000)).toEqual([]);
    }
    const recipeSheets = SHEET_TABLES.find((d) => d.store === 'recipes')!;
    const hijack = { ...(await A.db.recipes.get(recipe))!, name: 'Hijacked', updated_at: new Date(Date.now() + 3600_000).toISOString() };
    await expect(outsider.pushSheets(recipeSheets, [hijack as never])).rejects.toBeInstanceOf(TransportRefused);
    expect((await serverRow('household_recipes', 'id', recipe))[0].name).toBe('Canh chua');
  });

  it("A's one-dish recipe reaches B as one-dish, and a sheet from an older client keeps it one-dish", async () => {
    const pho = crypto.randomUUID() as RecipeId;
    await A.db.edits.put({
      store: 'recipes',
      id: pho,
      household_id: home,
      name: 'Pho',
      kind: 'whole_meal',
      ingredients: [],
      instructions: '',
      deleted_at: null,
      updated_at: new Date().toISOString() as Instant
    });
    await A.engine.sync('full');
    await B.engine.sync('full');

    expect(await B.db.recipes.get(pho)).toMatchObject({ name: 'Pho', kind: 'whole_meal' });
    expect((await serverRow('household_recipes', 'id', pho))[0]).toMatchObject({ kind: 'dish', whole_meal: true });

    const recipeSheets = SHEET_TABLES.find((d) => d.store === 'recipes')!;
    const columns = (recipeSheets.sheet.columns as readonly string[]).filter((c) => c !== 'whole_meal');
    const olderSheets = { ...recipeSheets, sheet: { columns } };
    const renamed = {
      ...(await B.db.recipes.get(pho))!,
      store: 'recipes',
      kind: 'dish',
      name: 'Pho bo',
      updated_at: new Date(Date.now() + 1000).toISOString()
    };
    await createSupabaseTransport(bob.client).pushSheets(olderSheets as never, [renamed as never]);
    await A.engine.sync('full');

    expect((await serverRow('household_recipes', 'id', pho))[0]).toMatchObject({
      name: 'Pho bo',
      kind: 'dish',
      whole_meal: true
    });
    expect(await A.db.recipes.get(pho)).toMatchObject({ name: 'Pho bo', kind: 'whole_meal' });
  });

  it("A's ingredient entries reach B with their deduction; an outsider can neither read nor write them", async () => {
    const tofu = (await A.ops.createItem({ name: 'Tofu', amount: 2 }))!;
    await A.engine.sync('full');
    const cook = createCookOps({ db: A.db, pantry: A.ops });
    const half = await cook.addIngredient({
      date: '2026-11-20' as LocalDate,
      ingredient: { name: 'Tofu', item_id: tofu, qty: { amount: 0.5, unit: 'count' } },
      use: { id: tofu, qty: 0.5 }
    });
    const salt = await cook.addIngredient({
      date: '2026-11-20' as LocalDate,
      ingredient: { name: 'Salt', item_id: null, qty: null },
      use: null
    });
    await A.engine.sync('full');
    await B.engine.sync('full');

    expect([await A.db.edits.count(), await A.db.commands.count()]).toEqual([0, 0]);
    const onB = await B.db.mealIngredients.get(half);
    expect(onB).toMatchObject({
      household_id: home,
      date: '2026-11-20',
      ingredient: { name: 'Tofu', item_id: tofu, qty: { amount: 0.5, unit: 'count' } }
    });
    expect(onB!.uses).toHaveLength(1);
    expect(await B.db.mealIngredients.get(salt)).toMatchObject({
      ingredient: { name: 'Salt', item_id: null, qty: null },
      uses: []
    });
    expect((await B.item(tofu))?.amount).toBe(1.5);

    const cookB = createCookOps({ db: B.db, pantry: B.ops });
    await cookB.changeIngredient(half, { amount: 0.666667, unit: 'count' });
    await B.engine.sync('full');
    await A.engine.sync('full');
    const changed = (await serverRow('meal_ingredients', 'id', half))[0];
    expect(changed.ingredient).toEqual({ name: 'Tofu', item_id: tofu, qty: { amount: 0.666667, unit: 'count' } });
    expect(changed.uses).toHaveLength(1);
    expect(changed.uses).not.toEqual(onB!.uses);
    expect(await A.db.mealIngredients.get(half)).toMatchObject({ ingredient: changed.ingredient, uses: changed.uses });
    expect([(await serverRow('items_v2', 'id', tofu))[0].amount, (await A.item(tofu))?.amount]).toEqual([
      1.333333, 1.333333
    ]);

    await cookB.removeIngredient(half, { restock: true });
    await B.engine.sync('full');
    await A.engine.sync('full');
    expect((await A.db.mealIngredients.get(half))?.deleted_at).not.toBeNull();
    expect([(await serverRow('items_v2', 'id', tofu))[0].amount, (await A.item(tofu))?.amount]).toEqual([2, 2]);

    const outsider = createSupabaseTransport(carol.client);
    const def = SHEET_TABLES.find((d) => d.store === 'mealIngredients')!;
    expect(await outsider.pull(def, home, 0, 1000)).toEqual([]);
    const hijack = {
      ...(await A.db.mealIngredients.get(salt))!,
      deleted_at: new Date().toISOString(),
      updated_at: new Date(Date.now() + 3600_000).toISOString()
    };
    await expect(outsider.pushSheets(def, [hijack as never])).rejects.toBeInstanceOf(TransportRefused);
    expect((await serverRow('meal_ingredients', 'id', salt))[0].deleted_at).toBeNull();
  });

  it('keeps a non-member out of the household through RLS', async () => {
    const outsider = createSupabaseTransport(carol.client);
    const itemsDef = HOUSEHOLD_TABLES.find((d) => d.store === 'items')!;
    expect(await outsider.pull(itemsDef, home, 0, 1000)).toEqual([]);

    const milk = await byName(A, 'Milk (Bob)');
    const sheet = { ...milk, name: 'Hijacked', updated_at: new Date(Date.now() + 3600_000).toISOString() };
    const itemSheets = SHEET_TABLES.find((d) => d.store === 'items')!;
    await expect(outsider.pushSheets(itemSheets, [sheet as never])).rejects.toBeInstanceOf(TransportRefused);

    const id = crypto.randomUUID() as CommandId;
    const response = await outsider.applyCommands([
      { id, household_id: home, item_id: milk.id, at: new Date().toISOString() as never, kind: 'use', qty: 1, waste: false }
    ]);
    expect(response.results).toEqual([{ id, status: 'rejected', reason: 'not_member' }]);
    expect((await serverRow('items_v2', 'id', milk.id))[0]).toMatchObject({ name: 'Milk (Bob)', amount: 3 });
  });

  it('Realtime nudges B to pull within seconds, and tells a non-member nothing', async () => {
    const subscribed = (client: SupabaseClient, on: () => void) =>
      new Promise<void>((resolve, reject) => {
        client
          .channel(`e2e:${client === bob.client ? 'bob' : 'carol'}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'items_v2', filter: `household_id=eq.${home}` }, on)
          .subscribe((state, err) => {
            if (state === 'SUBSCRIBED') resolve();
            if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') reject(err ?? new Error(state));
          });
      });
    let bobHeard = 0;
    let carolHeard = 0;
    await subscribed(bob.client, () => {
      bobHeard++;
      void B.engine.sync('full');
    });
    await subscribed(carol.client, () => carolHeard++);

    // A Realtime restarted by the database reset can drop the first changes after SUBSCRIBED
    // while its replication starts; the app covers that gap by pulling on SUBSCRIBED.
    const bread = await byName(A, 'Bread');
    let nudge = 0;
    const warmup = await waitFor(async () => {
      if (bobHeard > 0) return true;
      await A.ops.addToShopping(bread.id, ++nudge);
      await A.engine.sync('push');
      await new Promise((r) => setTimeout(r, 1000));
      return bobHeard > 0;
    }, 30_000);
    console.info(`[e2e] Realtime delivered its first change ${warmup} ms after SUBSCRIBED (${nudge} write(s))`);

    const coffee = await byName(A, 'Coffee');
    await waitFor(async () => (await byName(B, 'Coffee')).amount === 2, 5000);
    await A.ops.useUp(coffee.id);
    await A.engine.sync('push');
    const elapsed = await waitFor(async () => (await byName(B, 'Coffee')).amount === 1, 5000);

    console.info(`[e2e] B saw A's use through Realtime after ${elapsed} ms`);
    expect(elapsed).toBeLessThan(5000);
    await new Promise((r) => setTimeout(r, 1000));
    expect(carolHeard).toBe(0);
  }, 60_000);
});
