import { afterEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { openFooderinoDb, SYNC_STATE_KEY } from '~~/utils/db';
import { convertPendingOps, legacyIngredients, type LegacyRecipe } from '~~/utils/db-upgrade';
import type { ItemRecord, PendingOp } from '~~/types/sync';
import { pendingSheets } from '~~/utils/sheets';
import fixture from '../fixtures/legacy-ingredients.json';

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

function openV3(name: string) {
  const v3 = openV2(name);
  v3.version(3).stores({
    lists: null,
    list_members: null,
    logs: null,
    pendingOps: null,
    households: 'id',
    members: 'id, user_id',
    items: 'id, seq',
    bag: 'id, item_id, seq',
    events: 'id, item_id, occurred_at, seq',
    log: 'command_id, seq',
    commands: 'id, created_seq',
    edits: 'id'
  });
  return v3;
}

const names: string[] = [];
afterEach(async () => {
  for (const name of names.splice(0)) await Dexie.delete(name);
  vi.restoreAllMocks();
});

describe('Dexie v3 upgrade', () => {
  it('converts the v2 outbox, drops list-era stores and keeps device identity', async () => {
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
      ['bag', 'commands', 'cooked', 'edits', 'events', 'households', 'items', 'log', 'mealIngredients', 'members', 'recipes', 'syncState'].sort()
    );
    expect(await db.items.count()).toBe(0);
    expect(await db.recipes.count()).toBe(0);
    expect(await db.edits.count()).toBe(0);

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
      cursors: {}
    });
    db.close();
  });

});

const HOUSEHOLD = '22222222-2222-4222-8222-222222222222';

const legacyRecipe = (over: Partial<LegacyRecipe>): LegacyRecipe => ({
  id: crypto.randomUUID(),
  user_id: 'user-1',
  name: 'Soup',
  description: null,
  ingredients: [],
  instructions: null,
  saved: true,
  updated_at: '2026-10-01T00:00:00.000Z',
  deleted_at: null,
  ...over
});

async function openV3With(name: string, state: Record<string, unknown>, recipes: LegacyRecipe[]) {
  names.push(name);
  const v3 = openV3(name);
  await v3.table('syncState').put({ key: SYNC_STATE_KEY, device_id: 'device-1', user_id: 'user-1', hydrated_at: null, cursors: {}, ...state });
  await v3.table('recipes').bulkAdd(recipes);
  v3.close();
  const db = openFooderinoDb(name);
  await db.open();
  return db;
}

describe('Dexie v4 upgrade', () => {
  it('queues every saved or deleted legacy recipe for the household, keeping its id and stamp', async () => {
    const bun = legacyRecipe({
      name: ' Bún   chả ', description: 'Hanoi style', instructions: 'Grill.',
      ingredients: [{ name: 'Pork', amount: 500, amount_type: 'gram' }, { name: 'Herbs', amount_type: 'count' }]
    });
    const gone = legacyRecipe({ name: 'Gone', saved: false, deleted_at: '2026-10-02T00:00:00.000Z' });
    const idea = legacyRecipe({ name: 'AI idea', saved: false });
    const blank = legacyRecipe({ name: '  ' });
    const db = await openV3With(`upgrade-v4-recipes-${crypto.randomUUID()}`,
      { household_id: HOUSEHOLD, recipes: { pulled: null, pushed: '2026-12-01T00:00:00.000Z' } }, [bun, gone, idea, blank]);

    const sheets = await pendingSheets(db, 'recipes');
    expect(sheets.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      {
        store: 'recipes', id: bun.id, household_id: HOUSEHOLD, name: 'Bún chả', kind: 'dish',
        ingredients: [
          { name: 'Pork', item_id: null, qty: { amount: 500, unit: 'gram' } },
          { name: 'Herbs', item_id: null, qty: null }
        ],
        instructions: 'Hanoi style\n\nGrill.', deleted_at: null, updated_at: '2026-10-01T00:00:00.000Z'
      },
      {
        store: 'recipes', id: gone.id, household_id: HOUSEHOLD, name: 'Gone', kind: 'dish', ingredients: [],
        instructions: '', deleted_at: '2026-10-02T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z'
      }
    ]);
    expect(await db.recipes.count()).toBe(0);
    expect(await db.syncState.get(SYNC_STATE_KEY)).not.toHaveProperty('recipes');
    db.close();
  });

  it('keeps no legacy recipe on a device with no household', async () => {
    const db = await openV3With(`upgrade-v4-homeless-${crypto.randomUUID()}`,
      { household_id: null, recipes: { pulled: null, pushed: null } }, [legacyRecipe({})]);

    expect(await db.edits.count()).toBe(0);
    expect(await db.recipes.count()).toBe(0);
    db.close();
  });

  it('files every queued edit under the items store, so it still pushes', async () => {
    const name = `upgrade-v4-${crypto.randomUUID()}`;
    names.push(name);
    const v3 = openV3(name);
    const sheet = {
      id: crypto.randomUUID(), household_id: LIST, name: 'Oat milk', aliases: [], tags: [], unit: 'count',
      default_amount: 1, shelf_life_days: null, deleted_at: null, updated_at: '2026-11-01T00:00:00.000Z'
    };
    await v3.table('edits').add(sheet);
    v3.close();

    const db = openFooderinoDb(name);
    await db.open();

    expect(await db.edits.where('store').equals('items').toArray()).toEqual([{ ...sheet, store: 'items', season: null }]);
    db.close();
  });

  it('creates every store on a fresh device', async () => {
    const name = `fresh-${crypto.randomUUID()}`;
    names.push(name);
    const db = openFooderinoDb(name);
    await db.open();
    expect(db.verno).toBe(6);
    expect(await db.commands.count()).toBe(0);
    db.close();
  });
});

describe('Dexie v5 upgrade', () => {
  it('reads items and item sheets stored before seasons as having no season, leaving other sheets alone', async () => {
    const name = `upgrade-v5-${crypto.randomUUID()}`;
    names.push(name);
    const v4 = openV3(name);
    v4.version(4).stores({ recipes: 'id, seq', cooked: 'id, seq', edits: 'id, store' });
    const meta = {
      household_id: LIST, name: 'Kale', aliases: [], tags: [], unit: 'count', default_amount: 1,
      shelf_life_days: null, deleted_at: null, updated_at: '2026-11-01T00:00:00.000Z'
    };
    const row = { ...meta, id: crypto.randomUUID(), amount: 1, to_buy: 0, best_before: null, merged_into: null, seq: 3 };
    const sheet = { ...meta, id: crypto.randomUUID(), store: 'items' };
    const recipe = { id: crypto.randomUUID(), store: 'recipes', household_id: LIST, name: 'Soup', updated_at: meta.updated_at };
    await v4.table('items').add(row);
    await v4.table('edits').bulkAdd([sheet, recipe]);
    v4.close();

    const db = openFooderinoDb(name);
    await db.open();

    expect(await db.table('items').get(row.id)).toEqual({ ...row, season: null });
    expect(await db.table('edits').get(sheet.id)).toEqual({ ...sheet, season: null });
    expect(await db.table('edits').get(recipe.id)).toEqual(recipe);
    db.close();
  });
});

describe('Dexie v6 upgrade', () => {
  it('keeps the meals a v5 device holds and adds an empty store for meal ingredients', async () => {
    const name = `upgrade-v6-${crypto.randomUUID()}`;
    names.push(name);
    const v5 = openV3(name);
    v5.version(4).stores({ recipes: 'id, seq', cooked: 'id, seq', edits: 'id, store' });
    v5.version(5).stores({});
    const dish = {
      id: crypto.randomUUID(),
      household_id: LIST,
      recipe_id: crypto.randomUUID(),
      date: '2026-11-18',
      uses: [],
      deleted_at: null,
      updated_at: '2026-11-18T18:00:00.000Z',
      seq: 4
    };
    await v5.table('cooked').add(dish);
    v5.close();

    const db = openFooderinoDb(name);
    await db.open();

    expect(await db.table('cooked').toArray()).toEqual([dish]);
    expect(await db.mealIngredients.count()).toBe(0);
    db.close();
  });
});

describe('legacyIngredients', () => {
  it.each(fixture)('converts $case as private.legacy_ingredients does', ({ legacy, ingredients }) => {
    expect(legacyIngredients(legacy)).toEqual(ingredients);
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
