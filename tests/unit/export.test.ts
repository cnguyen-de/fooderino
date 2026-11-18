import { describe, expect, it } from 'vitest';
import type { RecipeId, RecipeRow } from '~~/types/cook';
import type { HouseholdId, Instant, Item, ItemId } from '~~/types/pantry';
import {
  addImportedRecipes,
  buildExportPayload,
  exportDevice,
  importContext,
  parseImport,
  planImport,
  type ExportedRecipe
} from '~~/utils/export';
import { FakeServer, HOUSEHOLD } from '../support/fake-server';
import { makeDevice, project } from '../support/device';

const ME = 'user-me';
const NOW = '2026-11-16T12:00:00.000Z';

const item = (over: Partial<Item>): Item => ({
  id: crypto.randomUUID() as ItemId, household_id: HOUSEHOLD as HouseholdId, name: 'Milk', aliases: [], tags: [],
  unit: 'count', default_amount: 1, shelf_life_days: null, amount: 0, to_buy: 0, best_before: null,
  merged_into: null, deleted_at: null, ...over
});
/** A recipe as v1 and v2 files carried it: one user's, with legacy ingredients. */
const legacyRecipe = (id: string, over: Record<string, unknown> = {}) => ({
  id, user_id: ME, name: 'Soup', description: null, ingredients: [], instructions: null, saved: true,
  updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null, ...over
});
const recipe = (over: Partial<RecipeRow>): Omit<RecipeRow, 'seq'> => ({
  id: crypto.randomUUID() as RecipeId, household_id: HOUSEHOLD, name: 'Canh chua', kind: 'soup', ingredients: [],
  instructions: '', deleted_at: null, updated_at: NOW as Instant, ...over
});
const exported = (over: Partial<ExportedRecipe>): ExportedRecipe => ({
  name: 'Canh chua', kind: 'dish', ingredients: [], instructions: '', ...over
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
  recipes: [legacyRecipe('r1')]
};

describe('export v3', () => {
  it('keeps live items with their counters as state, and drops tombstones', () => {
    const payload = buildExportPayload({
      household: { name: 'Home' },
      items: [
        item({ name: 'Milk', amount: 2, to_buy: 1, tags: [{ kind: 'place', name: 'Fridge' }] }),
        item({ name: 'Gone', deleted_at: NOW as Instant }),
        item({ name: 'Merged', merged_into: 'x' as ItemId })
      ],
      recipes: [],
      now: NOW
    });
    expect(payload.version).toBe(3);
    expect(payload.items).toEqual([
      expect.objectContaining({ name: 'Milk', amount: 2, to_buy: 1, tags: [{ kind: 'place', name: 'Fridge' }] })
    ]);
  });

  it('carries live recipes with links turned into the linked item\'s current name', () => {
    const fish = item({ name: 'Snakehead fish' });
    const merged = item({ name: 'Tamarind pulp', merged_into: fish.id });
    const payload = buildExportPayload({
      household: null,
      items: [fish, merged],
      recipes: [
        recipe({
          name: 'Canh chua',
          ingredients: [
            { name: 'Fish', item_id: fish.id, qty: { amount: 300, unit: 'gram' } },
            { name: 'Tamarind', item_id: merged.id, qty: null },
            { name: 'Herbs', item_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' as ItemId, qty: null },
            { name: 'Salt', item_id: null, qty: null }
          ],
          instructions: 'Boil.'
        }),
        recipe({ name: 'Gone', deleted_at: NOW as Instant })
      ],
      now: NOW
    });
    expect(payload.recipes).toEqual([
      {
        name: 'Canh chua',
        kind: 'soup',
        ingredients: [
          { name: 'Snakehead fish', qty: { amount: 300, unit: 'gram' } },
          { name: 'Snakehead fish', qty: null },
          { name: 'Herbs', qty: null },
          { name: 'Salt', qty: null }
        ],
        instructions: 'Boil.'
      }
    ]);
  });

  it('exports the recipes the device shows, unsynced ones included, and no meals', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ME), HOUSEHOLD);
    const soup = { store: 'recipes' as const, ...recipe({ name: 'Canh chua' }) };
    await device.db.edits.bulkPut([
      soup,
      { store: 'cooked', id: crypto.randomUUID() as never, household_id: HOUSEHOLD, recipe_id: soup.id, date: '2026-11-16' as never,
        uses: [], deleted_at: null, updated_at: NOW as Instant }
    ]);

    const payload = JSON.parse(JSON.stringify(await exportDevice(device.db)));

    expect(Object.keys(payload).sort()).toEqual(['exported_at', 'household', 'items', 'recipes', 'version']);
    expect(parseImport(payload)?.recipes).toEqual([exported({ name: 'Canh chua', kind: 'soup' })]);
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

  it('reads saved v2 recipes as free-name ingredients, with the description folded in', () => {
    const v2 = {
      version: 2,
      items: [],
      recipes: [
        legacyRecipe('r1', {
          name: 'Bún chả', description: 'Hanoi style', instructions: 'Grill.',
          ingredients: [{ name: 'Pork', amount: 500, amount_type: 'gram' }, { name: 'Herbs', amount_type: 'count' }]
        }),
        legacyRecipe('r2', { name: 'AI idea', saved: false }),
        legacyRecipe('r3', { name: 'Gone', deleted_at: NOW }),
        { name: 'No id or anything' }
      ]
    };
    expect(parseImport(v2)?.recipes).toEqual([
      exported({
        name: 'Bún chả',
        ingredients: [{ name: 'Pork', qty: { amount: 500, unit: 'gram' } }, { name: 'Herbs', qty: null }],
        instructions: 'Hanoi style\n\nGrill.'
      })
    ]);
  });

  it('refuses unknown versions and shapes', () => {
    expect(parseImport({ version: 4, items: [], recipes: [] })).toBeNull();
    expect(parseImport({ version: 3, items: [] })).toBeNull();
    expect(parseImport('nope')).toBeNull();
  });

  it('adds only items and recipes whose names are new here, each recipe under a new id', () => {
    const plan = planImport(
      {
        items: [{ name: 'milk ' }, { name: 'Oat drink', aliases: ['Haferdrink'] }, { name: 'haferdrink' }, { name: 'Eggs' }],
        recipes: [
          exported({ name: 'canh chua' }),
          exported({ name: 'Bún chả', ingredients: [{ name: 'Pork', qty: { amount: 500, unit: 'gram' } }] }),
          exported({ name: 'bun cha' }),
          exported({ name: 'Gone' })
        ]
      },
      {
        household: HOUSEHOLD,
        now: NOW as Instant,
        items: [item({ name: 'Milk' })],
        recipes: [recipe({ name: 'Canh chua' }), recipe({ name: 'Gone', deleted_at: NOW as Instant })]
      }
    );
    expect(plan.items.map((d) => d.name)).toEqual(['Oat drink', 'Eggs']);
    expect(plan.recipes).toEqual([
      {
        store: 'recipes', id: expect.any(String), household_id: HOUSEHOLD, name: 'Bún chả', kind: 'dish',
        ingredients: [{ name: 'Pork', item_id: null, qty: { amount: 500, unit: 'gram' } }],
        instructions: '', deleted_at: null, updated_at: NOW
      },
      expect.objectContaining({ name: 'Gone', household_id: HOUSEHOLD })
    ]);
    expect(new Set(plan.recipes.map((r) => r.id)).size).toBe(2);
    expect(plan.summary).toEqual([
      { label: 'items', total: 4, newCount: 2, skipCount: 2 },
      { label: 'recipes', total: 4, newCount: 2, skipCount: 2 }
    ]);
  });

  it('pushes imported recipes to the household, and a second import adds nothing', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ME), HOUSEHOLD);
    const file = { version: 3, items: [], recipes: [exported({ name: 'Canh chua', kind: 'soup' })] };

    await addImportedRecipes(planImport(parseImport(file)!, await importContext(device.db)).recipes, device.db);
    await device.engine.sync('full');
    const again = planImport(parseImport(file)!, await importContext(device.db));

    expect([...server.recipes.values()]).toEqual([expect.objectContaining({ name: 'Canh chua', kind: 'soup', household_id: HOUSEHOLD })]);
    expect(again.recipes).toEqual([]);
  });

  it('creates each v1 item through a create command carrying its opening counters', async () => {
    const server = new FakeServer();
    const device = await makeDevice(server.transport(ME), HOUSEHOLD);
    const plan = planImport(parseImport(v1)!, { household: HOUSEHOLD, now: NOW as Instant, items: [], recipes: [] });

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
