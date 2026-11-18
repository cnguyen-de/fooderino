import { describe, expect, it } from 'vitest';
import type { ItemId, LocalDate } from '~~/types/pantry';
import type { CookedRow, RecipeId, RecipeRow } from '~~/types/cook';
import { createCookOps } from '~~/utils/cook';
import { createPantryOps } from '~~/utils/pantry-ops';
import { notifyLocalChange, setLocalChangeHook } from '~~/utils/sync-hook';
import { overlaySheets, pendingSheets } from '~~/utils/sheets';
import { FakeServer, HOUSEHOLD } from '../support/fake-server';
import { makeDevice, project } from '../support/device';

const ALICE = 'aaaaaaaa-0000-4000-8000-000000000001';
const TODAY = '2026-11-18' as LocalDate;

async function device() {
  const server = new FakeServer();
  const d = await makeDevice(server.transport(ALICE), HOUSEHOLD);
  let woken = 0;
  const cook = createCookOps({ db: d.db, pantry: d.ops, notify: () => woken++ });
  const recipes = async () =>
    [...overlaySheets(await d.db.recipes.toArray(), await pendingSheets(d.db, 'recipes')).values()] as Omit<RecipeRow, 'seq'>[];
  const dishes = async () =>
    [...overlaySheets(await d.db.cooked.toArray(), await pendingSheets(d.db, 'cooked')).values()] as Omit<CookedRow, 'seq'>[];
  return { server, ...d, cook, recipes, dishes, woken: () => woken };
}

type Device = Awaited<ReturnType<typeof device>>;

const amountOf = async (d: Device, id: ItemId) => (await d.item(id))?.amount;

async function soup(d: Device) {
  const pork = (await d.ops.createItem({ name: 'Pork belly', unit: 'gram', amount: 500 }))!;
  const eggs = (await d.ops.createItem({ name: 'Eggs', amount: 6 }))!;
  const recipe = await d.cook.saveRecipe({
    name: 'Thit kho',
    kind: 'dish',
    ingredients: [
      { name: 'Pork belly', item_id: pork, qty: { amount: 300, unit: 'gram' } },
      { name: 'Eggs', item_id: null, qty: { amount: 4, unit: 'count' } }
    ],
    instructions: ''
  });
  return { pork, eggs, recipe };
}

describe('cook ops', () => {
  it('saves a tidy recipe, dropping blank rows and empty amounts, and refuses a blank name', async () => {
    const d = await device();
    const id = await d.cook.saveRecipe({
      name: '  Canh   chua ',
      kind: 'soup',
      ingredients: [
        { name: ' Tamarind ', item_id: null, qty: { amount: 0, unit: 'gram' } },
        { name: '   ', item_id: null, qty: { amount: 2, unit: 'count' } },
        { name: 'Fish', item_id: null, qty: { amount: 400, unit: 'gram' } }
      ],
      instructions: '  Boil.  '
    });

    expect(await d.recipes()).toEqual([
      expect.objectContaining({
        id,
        household_id: HOUSEHOLD,
        name: 'Canh chua',
        kind: 'soup',
        ingredients: [
          { name: 'Tamarind', item_id: null, qty: null },
          { name: 'Fish', item_id: null, qty: { amount: 400, unit: 'gram' } }
        ],
        instructions: 'Boil.',
        deleted_at: null
      })
    ]);
    await expect(d.cook.saveRecipe({ name: '  ', kind: 'dish', ingredients: [], instructions: '' })).rejects.toThrow(
      RangeError
    );
    expect(await d.recipes()).toHaveLength(1);

    await d.engine.sync('full');
    expect(d.server.recipes.get(id)?.name).toBe('Canh chua');
  });

  it('edits and deletes a recipe that already reached the server', async () => {
    const d = await device();
    const id = await d.cook.saveRecipe({ name: 'Rau muong', kind: 'dish', ingredients: [], instructions: '' });
    await d.engine.sync('full');

    await d.cook.saveRecipe({ id, name: 'Rau muong xao toi', kind: 'dish', ingredients: [], instructions: '' });
    await d.engine.sync('full');
    expect(d.server.recipes.get(id)?.name).toBe('Rau muong xao toi');

    await d.cook.deleteRecipe(id);
    await d.engine.sync('full');
    expect(d.server.recipes.get(id)?.deleted_at).not.toBeNull();
  });

  it('cooks a dish: deducts the confirmed uses and records the dish with their command ids', async () => {
    const d = await device();
    const { pork, eggs, recipe } = await soup(d);
    const woken = d.woken();

    const id = await d.cook.cook({ recipe, date: TODAY, uses: [{ id: pork, qty: 300 }, { id: eggs, qty: 4 }] });

    expect([await amountOf(d, pork), await amountOf(d, eggs)]).toEqual([200, 2]);
    const [dish] = await d.dishes();
    expect(dish).toMatchObject({ id, recipe_id: recipe, date: TODAY, deleted_at: null });
    const uses = (await project(d.db)).events.filter((e) => e.kind === 'consume').map((e) => e.command_id);
    expect([...dish!.uses].sort()).toEqual([...uses].sort());
    expect(dish!.uses).toHaveLength(2);
    expect(d.woken()).toBeGreaterThan(woken);

    await d.engine.sync('full');
    expect(d.server.cooked.get(id)).toMatchObject({ recipe_id: recipe, date: TODAY });
    expect(d.server.items.get(pork)?.amount).toBe(200);
  });

  it('records a dish with no deduction when nothing was checked', async () => {
    const d = await device();
    const { pork, recipe } = await soup(d);
    await d.cook.cook({ recipe, date: TODAY, uses: [] });
    expect(await d.dishes()).toEqual([expect.objectContaining({ recipe_id: recipe, uses: [] })]);
    expect(await amountOf(d, pork)).toBe(500);
  });

  it('lets the sync engine push from the write-through hook while a dish is cooked', async () => {
    const d = await device();
    const { pork, recipe } = await soup(d);
    await d.engine.sync('full');
    const pushes: Promise<unknown>[] = [];
    setLocalChangeHook(() => pushes.push(d.engine.flush()));
    try {
      const pantry = createPantryOps({ db: d.db, notify: () => notifyLocalChange('pantry') });
      const cook = createCookOps({ db: d.db, pantry, notify: () => notifyLocalChange('pantry') });
      const id = await cook.cook({ recipe, date: TODAY, uses: [{ id: pork, qty: 100 }] });
      await Promise.all(pushes);
      expect(d.server.cooked.get(id)?.recipe_id).toBe(recipe);
      expect(d.server.items.get(pork)?.amount).toBe(400);
    } finally {
      setLocalChangeHook(null);
    }
  });

  it('records nothing when the pantry refuses the deduction', async () => {
    const d = await device();
    const { pork, eggs, recipe } = await soup(d);

    await expect(
      d.cook.cook({ recipe, date: TODAY, uses: [{ id: eggs, qty: 2 }, { id: pork, qty: 900 }] })
    ).rejects.toThrow(RangeError);

    expect(await d.dishes()).toEqual([]);
    expect([await amountOf(d, pork), await amountOf(d, eggs)]).toEqual([500, 6]);
  });

  it('removes a dish with restock: the dish leaves the meal and the stock comes back, also after a sync', async () => {
    const d = await device();
    const { pork, eggs, recipe } = await soup(d);
    const id = await d.cook.cook({ recipe, date: TODAY, uses: [{ id: pork, qty: 300 }, { id: eggs, qty: 4 }] });
    await d.engine.sync('full');

    await d.cook.removeDish(id, { restock: true });

    expect((await d.dishes()).map((r) => r.deleted_at !== null)).toEqual([true]);
    expect([await amountOf(d, pork), await amountOf(d, eggs)]).toEqual([500, 6]);
    await d.engine.sync('full');
    expect(d.server.cooked.get(id)?.deleted_at).not.toBeNull();
    expect([d.server.items.get(pork)?.amount, d.server.items.get(eggs)?.amount]).toEqual([500, 6]);
    expect(d.notices).toEqual([]);
  });

  it('undoes a dish before it ever synced', async () => {
    const d = await device();
    const { pork, recipe } = await soup(d);
    const id = await d.cook.cook({ recipe, date: TODAY, uses: [{ id: pork, qty: 300 }] });

    await d.cook.removeDish(id, { restock: true });

    expect([await amountOf(d, pork)]).toEqual([500]);
    expect((await d.dishes())[0]?.deleted_at).not.toBeNull();
  });

  it('removes a dish without restock, leaving the stock as cooked', async () => {
    const d = await device();
    const { pork, recipe } = await soup(d);
    const id = await d.cook.cook({ recipe, date: TODAY, uses: [{ id: pork, qty: 300 }] });

    await d.cook.removeDish(id, { restock: false });

    expect((await d.dishes())[0]?.deleted_at).not.toBeNull();
    expect(await amountOf(d, pork)).toBe(200);
  });

  it('lists what is missing: out and short items, and typed names as new items to buy', async () => {
    const d = await device();
    const pork = (await d.ops.createItem({ name: 'Pork belly', unit: 'gram', amount: 100 }))!;
    const rice = (await d.ops.createItem({ name: 'Rice', aliases: ['Gao'], amount: 0 }))!;
    const eggs = (await d.ops.createItem({ name: 'Eggs', amount: 6 }))!;
    const recipe: RecipeId = await d.cook.saveRecipe({
      name: 'Com',
      kind: 'dish',
      ingredients: [
        { name: 'Pork belly', item_id: pork, qty: { amount: 300, unit: 'gram' } },
        { name: 'Gao', item_id: null, qty: null },
        { name: 'Eggs', item_id: eggs, qty: { amount: 2, unit: 'count' } },
        { name: 'Fish sauce', item_id: null, qty: { amount: 2, unit: 'count' } },
        { name: 'Lemongrass', item_id: null, qty: { amount: 50, unit: 'gram' } }
      ],
      instructions: ''
    });

    expect(await d.cook.addMissingToShopping(recipe)).toBe(4);

    const items = [...(await project(d.db)).snapshot.items.values()];
    const toBuy = Object.fromEntries(items.map((i) => [i.name, { to_buy: i.to_buy, unit: i.unit }]));
    expect(toBuy).toEqual({
      'Pork belly': { to_buy: 200, unit: 'gram' },
      Rice: { to_buy: 1, unit: 'count' },
      Eggs: { to_buy: 0, unit: 'count' },
      'Fish sauce': { to_buy: 2, unit: 'count' },
      Lemongrass: { to_buy: 1, unit: 'count' }
    });
    expect(items.find((i) => i.id === rice)?.to_buy).toBe(1);

    expect(await d.cook.addMissingToShopping(recipe)).toBe(0);
  });
});
