import { afterEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { openFooderinoDb, SYNC_STATE_KEY } from '~~/utils/db';
import { convertPendingOps } from '~~/utils/db-upgrade';
import type { ItemRecord, PendingOp } from '~~/types/sync';

const LIST = '11111111-1111-4111-8111-111111111111';

const legacyItem = (over: Partial<ItemRecord>): ItemRecord => ({
  id: crypto.randomUUID(),
  list_id: LIST,
  name: 'Milk',
  location: 'Fridge',
  store: 'Lidl',
  amount: 0,
  amount_to_purchase: 0,
  amount_type: 'count',
  default_amount: 1,
  created_by: null,
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  ...over
});

const op = (over: Partial<PendingOp>): PendingOp => ({
  id: crypto.randomUUID(),
  item_id: 'x',
  list_id: LIST,
  field: 'amount',
  kind: 'delta',
  value: -1,
  actor: null,
  created_at: '2026-01-02T00:00:00.000Z',
  ...over
});

/** Opens a database at schema v2 exactly as the list-era client declared it. */
function openV2(name: string) {
  const v2 = new Dexie(name);
  v2.version(1).stores({
    lists: 'id, updated_at, deleted_at',
    list_members: 'id, list_id, user_id, updated_at, deleted_at',
    items: 'id, list_id, name, updated_at, deleted_at',
    logs: 'id, list_id, created_at',
    recipes: 'id, user_id, updated_at, deleted_at',
    user_settings: 'id, user_id, updated_at, deleted_at',
    pendingOps: 'id, item_id, created_at',
    syncState: 'key'
  });
  v2.version(2).stores({ user_settings: null });
  return v2;
}

const names: string[] = [];
afterEach(async () => {
  for (const name of names.splice(0)) await Dexie.delete(name);
  vi.restoreAllMocks();
});

describe('Dexie v3 upgrade', () => {
  it('converts the v2 outbox, drops list-era stores and keeps recipes and device identity', async () => {
    const name = `upgrade-${crypto.randomUUID()}`;
    names.push(name);
    const milk = legacyItem({ name: 'Milk', amount: 1, amount_to_purchase: 3 });
    const eggs = legacyItem({ name: 'Eggs', amount: 9 });

    const v2 = openV2(name);
    await v2.table('lists').add({ id: LIST, name: 'Home', owner: 'u', updated_at: milk.updated_at, deleted_at: null });
    await v2.table('items').bulkAdd([milk, eggs]);
    await v2.table('logs').add({ id: 'log', list_id: LIST, created_at: milk.updated_at });
    await v2.table('recipes').add({ id: 'r1', user_id: 'u', name: 'Soup', updated_at: milk.updated_at, deleted_at: null });
    await v2.table('pendingOps').bulkAdd([
      op({ id: 'a1111111-1111-4111-8111-111111111111', item_id: milk.id, value: -1, created_at: '2026-01-02T00:00:00.000Z' }),
      op({ id: 'a2222222-2222-4222-8222-222222222222', item_id: milk.id, value: -1, created_at: '2026-01-03T00:00:00.000Z' }),
      op({ id: 'b1111111-1111-4111-8111-111111111111', item_id: milk.id, field: 'amount_to_purchase', value: 2 }),
      op({ id: 'c1111111-1111-4111-8111-111111111111', item_id: eggs.id, value: 6, created_at: '2026-01-04T00:00:00.000Z' }),
      op({ id: 'c2222222-2222-4222-8222-222222222222', item_id: eggs.id, value: -1, created_at: '2026-01-05T00:00:00.000Z' }),
      op({ id: 'd1111111-1111-4111-8111-111111111111', item_id: 'gone' })
    ]);
    await v2.table('syncState').put({
      key: SYNC_STATE_KEY,
      device_id: 'device-1',
      user_id: 'user-1',
      hydrated_at: '2026-01-01T00:00:00.000Z',
      cursors: { items: { pulled: '2026-01-01', pushed: null } }
    });
    v2.close();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = openFooderinoDb(name);
    await db.open();

    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['bag', 'commands', 'edits', 'events', 'households', 'items', 'log', 'members', 'recipes', 'syncState'].sort()
    );
    expect(await db.items.count()).toBe(0);
    expect((await db.recipes.get('r1'))?.name).toBe('Soup');

    const commands = await db.commands.orderBy('created_seq').toArray();
    expect(commands.map(({ id, kind, item_id, household_id, created_seq, ...payload }) => ({ id, kind, item_id, ...payload }))).toEqual([
      expect.objectContaining({ id: 'a1111111-1111-4111-8111-111111111111', kind: 'use', item_id: milk.id, qty: 1, waste: false }),
      expect.objectContaining({ id: 'b1111111-1111-4111-8111-111111111111', kind: 'want', item_id: milk.id, qty: 3 }),
      expect.objectContaining({ id: 'a2222222-2222-4222-8222-222222222222', kind: 'use', item_id: milk.id, qty: 1, waste: false }),
      expect.objectContaining({ id: 'c2222222-2222-4222-8222-222222222222', kind: 'set', item_id: eggs.id, amount: 9 })
    ]);
    expect(commands.every((c) => c.household_id === LIST)).toBe(true);
    expect(commands.map((c) => c.created_seq)).toEqual([1, 2, 3, 4]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('discarded 1 pending op'));

    expect(await db.syncState.get(SYNC_STATE_KEY)).toEqual({
      key: SYNC_STATE_KEY,
      device_id: 'device-1',
      user_id: 'user-1',
      household_id: null,
      hydrated_at: null,
      cursors: {},
      recipes: { pulled: null, pushed: null }
    });
    db.close();
  });

  it('creates every v3 store on a fresh device', async () => {
    const name = `fresh-${crypto.randomUUID()}`;
    names.push(name);
    const db = openFooderinoDb(name);
    await db.open();
    expect(db.verno).toBe(3);
    expect(await db.commands.count()).toBe(0);
    db.close();
  });
});

describe('convertPendingOps', () => {
  it('discards ops whose list differs from the stored row', () => {
    const item = legacyItem({ id: 'x', amount: 2 });
    const { commands, discarded } = convertPendingOps([op({ item_id: 'x', list_id: 'other' })], [item]);
    expect(commands).toEqual([]);
    expect(discarded).toBe(1);
  });

  it('turns a mixed amount group into one absolute set carrying the stored value', () => {
    const item = legacyItem({ id: 'x', amount: 4 });
    const { commands } = convertPendingOps(
      [op({ item_id: 'x', value: -1 }), op({ item_id: 'x', kind: 'set', value: 5, created_at: '2026-01-09T00:00:00.000Z' })],
      [item]
    );
    expect(commands).toEqual([expect.objectContaining({ kind: 'set', amount: 4, at: '2026-01-09T00:00:00.000Z' })]);
  });
});
