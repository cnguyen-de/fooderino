import { describe, expect, it } from 'vitest';
import type { HouseholdId, Instant, Item, ItemId } from '~~/types/pantry';
import type { RecipeRecord } from '~~/types/sync';
import { buildExportPayload, EXPORT_VERSION, parseImport, planImport } from '~~/utils/export';
import { FakeServer, HOUSEHOLD } from '../support/fake-server';
import { makeDevice, project } from '../support/device';

const ME = 'user-me';
const NOW = '2026-11-16T12:00:00.000Z';

const item = (over: Partial<Item>): Item => ({
  id: crypto.randomUUID() as ItemId, household_id: HOUSEHOLD as HouseholdId, name: 'Milk', aliases: [], tags: [],
  unit: 'count', default_amount: 1, shelf_life_days: null, amount: 0, to_buy: 0, best_before: null,
  merged_into: null, deleted_at: null, ...over
});
const recipe = (id: string, user_id = ME): RecipeRecord => ({
  id, user_id, name: 'Soup', description: null, ingredients: [], instructions: null, saved: true,
  updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null
});

const v1 = {
  version: 1,
  lists: [{ id: 'l1', name: 'Home', owner: ME, updated_at: NOW, deleted_at: null }],
  items: [
    { id: 'a', list_id: 'l1', name: 'Milk', location: ' Fridge ', store: 'Lidl', amount: 2, amount_to_purchase: 1,
      amount_type: 'count', default_amount: 1, created_by: null, updated_at: NOW, deleted_at: null },
    { id: 'b', list_id: 'l1', name: 'Flour', location: '', store: '', amount: '500', amount_to_purchase: 0,
      amount_type: 'gram', default_amount: 1000, created_by: null, updated_at: NOW, deleted_at: null }
  ],
  recipes: [recipe('r1')]
};

describe('export v2', () => {
  it('keeps live items with their counters as state, and drops tombstones', () => {
    const payload = buildExportPayload({
      household: { name: 'Home' },
      items: [
        item({ name: 'Milk', amount: 2, to_buy: 1, tags: [{ kind: 'place', name: 'Fridge' }] }),
        item({ name: 'Gone', deleted_at: NOW as Instant }),
        item({ name: 'Merged', merged_into: 'x' as ItemId })
      ],
      recipes: [recipe('r1'), { ...recipe('r2'), deleted_at: NOW }],
      now: NOW
    });
    expect(payload.version).toBe(EXPORT_VERSION);
    expect(payload.items).toEqual([
      expect.objectContaining({ name: 'Milk', amount: 2, to_buy: 1, tags: [{ kind: 'place', name: 'Fridge' }] })
    ]);
    expect(payload.recipes.map((r) => r.id)).toEqual(['r1']);
  });

  it('round-trips through parseImport', () => {
    const payload = buildExportPayload({ household: null, items: [item({ name: 'Rice', unit: 'gram', amount: 800 })], recipes: [], now: NOW });
    expect(parseImport(JSON.parse(JSON.stringify(payload)))?.items).toEqual([
      expect.objectContaining({ name: 'Rice', unit: 'gram', amount: 800, to_buy: 0, best_before: null })
    ]);
  });
});

describe('import', () => {
  it('maps a v1 item location to a place tag and its store to a store tag', () => {
    expect(parseImport(v1)?.items).toEqual([
      { name: 'Milk', tags: [{ kind: 'place', name: 'Fridge' }, { kind: 'store', name: 'Lidl' }], unit: 'count', default_amount: 1, amount: 2, to_buy: 1 },
      { name: 'Flour', tags: [], unit: 'gram', default_amount: 1000, amount: 500, to_buy: 0 }
    ]);
  });

  it('refuses unknown versions and shapes', () => {
    expect(parseImport({ version: 3, items: [], recipes: [] })).toBeNull();
    expect(parseImport({ version: 2, items: [] })).toBeNull();
    expect(parseImport('nope')).toBeNull();
  });

  it('adds only items whose names are new here, and only my recipes not already here', () => {
    const plan = planImport(
      {
        items: [{ name: 'milk ' }, { name: 'Oat drink', aliases: ['Haferdrink'] }, { name: 'haferdrink' }, { name: 'Eggs' }],
        recipes: [recipe('r1'), recipe('r2'), recipe('r3', 'someone-else')]
      },
      { userId: ME, now: NOW, items: [item({ name: 'Milk' })], recipeIds: new Set(['r1']) }
    );
    expect(plan.items.map((d) => d.name)).toEqual(['Oat drink', 'Eggs']);
    expect(plan.recipes).toEqual([{ ...recipe('r2'), updated_at: NOW }]);
    expect(plan.summary).toEqual([
      { label: 'items', total: 4, newCount: 2, skipCount: 2 },
      { label: 'recipes', total: 3, newCount: 1, skipCount: 2 }
    ]);
  });

  it('creates each v1 item through a create command carrying its opening counters', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ME), HOUSEHOLD);
    const plan = planImport(parseImport(v1)!, { userId: ME, now: NOW, items: [], recipeIds: new Set() });

    for (const draft of plan.items) await device.ops.createItem(draft);

    expect((await device.db.commands.toArray()).map((c) => c.kind)).toEqual(['create', 'create']);
    const items = [...(await project(device.db)).snapshot.items.values()];
    expect(items.map(({ name, tags, amount, to_buy }) => ({ name, tags, amount, to_buy }))).toEqual(
      expect.arrayContaining([
        { name: 'Milk', tags: [{ kind: 'place', name: 'Fridge' }, { kind: 'store', name: 'Lidl' }], amount: 2, to_buy: 1 },
        { name: 'Flour', tags: [], amount: 500, to_buy: 0 }
      ])
    );
    await device.engine.sync('full');
    expect([...server.items.values()].map((i) => i.name).sort()).toEqual(['Flour', 'Milk']);
  });
});
