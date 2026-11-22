import { describe, expect, it } from 'vitest';
import type { ItemId, LocalDate } from '~~/types/pantry';
import type { CookedRow, MealIngredientRow, RecipeId, RecipeRow } from '~~/types/cook';
import {
  checkCook,
  checkIngredient,
  createCookOps,
  planCook,
  type IngredientDraft,
  type PantryLookup
} from '~~/utils/cook';
import { createPantryOps } from '~~/utils/pantry-ops';
import { notifyLocalChange, setLocalChangeHook } from '~~/utils/sync-hook';
import { overlaySheets, pendingSheets } from '~~/utils/sheets';
import { FakeServer, HOUSEHOLD } from '../support/fake-server';
import { makeDevice, project } from '../support/device';

const ALICE = 'aaaaaaaa-0000-4000-8000-000000000001';
const BOB = 'bbbbbbbb-0000-4000-8000-000000000002';
const TODAY = '2026-11-18' as LocalDate;

async function device() {
  const server = new FakeServer();
  const d = await makeDevice(server.transport(ALICE), HOUSEHOLD);
  let woken = 0;
  const cook = createCookOps({ db: d.db, pantry: d.ops, notify: () => woken++ });
  const recipes = async () =>
    [...overlaySheets(await d.db.recipes.toArray(), await pendingSheets(d.db, 'recipes')).values()] as Omit<
      RecipeRow,
      'seq'
    >[];
  const dishes = async () =>
    [...overlaySheets(await d.db.cooked.toArray(), await pendingSheets(d.db, 'cooked')).values()] as Omit<
      CookedRow,
      'seq'
    >[];
  const used = async () =>
    [
      ...overlaySheets(await d.db.mealIngredients.toArray(), await pendingSheets(d.db, 'mealIngredients')).values()
    ] as Omit<MealIngredientRow, 'seq'>[];
  return { server, ...d, cook, recipes, dishes, used, woken: () => woken };
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

    const id = await d.cook.cook({
      recipe,
      date: TODAY,
      uses: [
        { id: pork, qty: 300 },
        { id: eggs, qty: 4 }
      ]
    });

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
      d.cook.cook({
        recipe,
        date: TODAY,
        uses: [
          { id: eggs, qty: 2 },
          { id: pork, qty: 900 }
        ]
      })
    ).rejects.toThrow(RangeError);

    expect(await d.dishes()).toEqual([]);
    expect([await amountOf(d, pork), await amountOf(d, eggs)]).toEqual([500, 6]);
  });

  it('removes a dish with restock: the dish leaves the meal and the stock comes back, also after a sync', async () => {
    const d = await device();
    const { pork, eggs, recipe } = await soup(d);
    const id = await d.cook.cook({
      recipe,
      date: TODAY,
      uses: [
        { id: pork, qty: 300 },
        { id: eggs, qty: 4 }
      ]
    });
    await d.engine.sync('full');

    await d.cook.removeDish(id, { restock: true });

    expect((await d.dishes()).map((r) => r.deleted_at !== null)).toEqual([true]);
    expect([await amountOf(d, pork), await amountOf(d, eggs)]).toEqual([500, 6]);
    await d.engine.sync('full');
    expect(d.server.cooked.get(id)?.deleted_at).not.toBeNull();
    expect([d.server.items.get(pork)?.amount, d.server.items.get(eggs)?.amount]).toEqual([500, 6]);
    expect(d.notices).toEqual([]);
  });

  it('shows a dish on the other phone only with its deduction, so removing it there restocks everywhere', async () => {
    const a = await device();
    const b = await makeDevice(a.server.transport(BOB), HOUSEHOLD);
    const bCook = createCookOps({ db: b.db, pantry: b.ops });
    const { eggs, recipe } = await soup(a);
    await a.engine.sync('full');
    await b.engine.sync('full');
    const id = await a.cook.cook({ recipe, date: TODAY, uses: [{ id: eggs, qty: 2 }] });
    const onB = async () => ({ dish: (await b.db.cooked.get(id)) !== undefined, eggs: (await b.item(eggs))?.amount });

    a.server.failNextApply('before');
    await expect(a.engine.sync('full')).rejects.toThrow('network down');
    await b.engine.sync('full');
    expect(await onB()).toEqual({ dish: false, eggs: 6 });

    await a.engine.sync('full');
    await b.engine.sync('full');
    expect(await onB()).toEqual({ dish: true, eggs: 4 });

    await bCook.removeDish(id, { restock: true });
    await b.engine.sync('full');
    await a.engine.sync('full');
    expect(a.server.cooked.get(id)?.deleted_at).not.toBeNull();
    expect([a.server.items.get(eggs)?.amount, await amountOf(a, eggs), (await b.item(eggs))?.amount]).toEqual([
      6, 6, 6
    ]);
    expect([await a.db.commands.count(), await b.db.commands.count()]).toEqual([0, 0]);
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

  it('cooks with a zero amount used, deducting nothing for it', async () => {
    const d = await device();
    const salt = (await d.ops.createItem({ name: 'Salt', amount: 1 }))!;
    const eggs = (await d.ops.createItem({ name: 'Eggs', amount: 6 }))!;
    const recipe = await d.cook.saveRecipe({
      name: 'Omelette',
      kind: 'dish',
      ingredients: [
        { name: 'Salt', item_id: salt, qty: null },
        { name: 'Eggs', item_id: eggs, qty: { amount: 2, unit: 'count' } }
      ],
      instructions: ''
    });
    const { items } = (await project(d.db)).snapshot;
    const lookup: PantryLookup = { byId: (id) => items.get(id), search: () => [] };
    const lines = planCook((await d.recipes()).find((r) => r.id === recipe)!.ingredients, lookup);
    lines[0]!.qty = '0';

    const check = checkCook(lines, lookup);
    expect(check).toEqual({ ok: true, uses: [{ id: eggs, qty: 2 }] });
    await d.cook.cook({ recipe, date: TODAY, uses: check.ok ? check.uses : [] });

    expect(await amountOf(d, salt)).toBe(1);
    expect(await amountOf(d, eggs)).toBe(4);
    expect((await d.dishes())[0]?.uses).toHaveLength(1);
  });

  it('lists a whole pack for the part of one that is missing', async () => {
    const d = await device();
    const cream = (await d.ops.createItem({ name: 'Cream', amount: 0.25 }))!;
    const recipe: RecipeId = await d.cook.saveRecipe({
      name: 'Sauce',
      kind: 'dish',
      ingredients: [
        { name: 'Cream', item_id: cream, qty: { amount: 1.5, unit: 'count' } },
        { name: 'Onion', item_id: null, qty: { amount: 0.5, unit: 'count' } }
      ],
      instructions: ''
    });

    expect(await d.cook.addMissingToShopping(recipe)).toBe(2);
    const items = [...(await project(d.db)).snapshot.items.values()];
    expect(Object.fromEntries(items.map((i) => [i.name, i.to_buy]))).toEqual({ Cream: 2, Onion: 1 });
  });
});

describe('ingredients added to a meal', () => {
  async function addTo(d: Device, draft: Partial<IngredientDraft>) {
    const { items } = (await project(d.db)).snapshot;
    const lookup: PantryLookup = { byId: (id) => items.get(id), search: () => [] };
    const check = checkIngredient({ name: '', item_id: null, amount: '', unit: 'count', ...draft }, lookup);
    if (!check.ok) throw new Error(check.problem);
    return d.cook.addIngredient({ date: TODAY, ingredient: check.ingredient, use: check.use });
  }

  it('takes half a pack of tofu from home and records it in the meal, also on the server', async () => {
    const d = await device();
    const tofu = (await d.ops.createItem({ name: 'Tofu', amount: 2 }))!;

    const id = await addTo(d, { name: 'Tofu', item_id: tofu, amount: '½' });

    expect(await amountOf(d, tofu)).toBe(1.5);
    const [entry] = await d.used();
    expect(entry).toMatchObject({ id, date: TODAY, deleted_at: null });
    expect(entry!.ingredient).toEqual({ name: 'Tofu', item_id: tofu, qty: { amount: 0.5, unit: 'count' } });
    const uses = (await project(d.db)).events.filter((e) => e.kind === 'consume').map((e) => e.command_id);
    expect(entry!.uses).toEqual(uses);
    expect(entry!.uses).toHaveLength(1);

    await d.engine.sync('full');
    expect(d.server.mealIngredients.get(id)).toMatchObject({ date: TODAY, uses: entry!.uses });
    expect(d.server.items.get(tofu)?.amount).toBe(1.5);
  });

  it('records salt with an amount of zero or none as used, deducting nothing', async () => {
    const d = await device();
    const salt = (await d.ops.createItem({ name: 'Salt', amount: 1 }))!;
    const queued = await d.db.commands.count();

    await addTo(d, { name: 'Salt', item_id: salt, amount: '0' });
    await addTo(d, { name: 'Salt', item_id: salt, amount: ' ' });
    await addTo(d, { name: 'Pepper', amount: '' });

    expect(await amountOf(d, salt)).toBe(1);
    expect((await d.used()).map((u) => [u.ingredient.name, u.ingredient.qty, u.uses])).toEqual(
      expect.arrayContaining([
        ['Salt', null, []],
        ['Salt', null, []],
        ['Pepper', null, []]
      ])
    );
    expect(await d.db.commands.count()).toBe(queued);
  });

  it('records a typed name with its amount and takes nothing from home', async () => {
    const d = await device();
    const tofu = (await d.ops.createItem({ name: 'Tofu', amount: 2 }))!;

    await addTo(d, { name: '  Bean  sprouts ', amount: '200', unit: 'gram' });

    expect((await d.used())[0]!.ingredient).toEqual({
      name: 'Bean sprouts',
      item_id: null,
      qty: { amount: 200, unit: 'gram' }
    });
    expect(await amountOf(d, tofu)).toBe(2);
  });

  it('records nothing when the pantry refuses the deduction', async () => {
    const d = await device();
    const tofu = (await d.ops.createItem({ name: 'Tofu', amount: 1 }))!;

    await expect(
      d.cook.addIngredient({
        date: TODAY,
        ingredient: { name: 'Tofu', item_id: tofu, qty: { amount: 3, unit: 'count' } },
        use: { id: tofu, qty: 3 }
      })
    ).rejects.toThrow(RangeError);

    expect(await d.used()).toEqual([]);
    expect(await amountOf(d, tofu)).toBe(1);
  });

  it('refuses a blank name', async () => {
    const d = await device();
    await expect(
      d.cook.addIngredient({ date: TODAY, ingredient: { name: '  ', item_id: null, qty: null }, use: null })
    ).rejects.toThrow(RangeError);
    expect(await d.used()).toEqual([]);
  });

  it('removes an ingredient and puts it back, on this phone and the server', async () => {
    const d = await device();
    const tofu = (await d.ops.createItem({ name: 'Tofu', amount: 2 }))!;
    const id = await addTo(d, { name: 'Tofu', item_id: tofu, amount: '1/3' });
    await d.engine.sync('full');

    await d.cook.removeIngredient(id, { restock: true });

    expect((await d.used())[0]?.deleted_at).not.toBeNull();
    expect(await amountOf(d, tofu)).toBe(2);
    await d.engine.sync('full');
    expect(d.server.mealIngredients.get(id)?.deleted_at).not.toBeNull();
    expect(d.server.items.get(tofu)?.amount).toBe(2);
  });

  it('removes an ingredient without restock, leaving the stock as used', async () => {
    const d = await device();
    const tofu = (await d.ops.createItem({ name: 'Tofu', amount: 2 }))!;
    const id = await addTo(d, { name: 'Tofu', item_id: tofu, amount: '1' });

    await d.cook.removeIngredient(id, { restock: false });

    expect((await d.used())[0]?.deleted_at).not.toBeNull();
    expect(await amountOf(d, tofu)).toBe(1);
  });
});

describe('checkIngredient', () => {
  const tofu = { id: 'tofu' as ItemId, name: 'Tofu', unit: 'count', amount: 1 } as never;
  const lookup: PantryLookup = { byId: (id) => (id === 'tofu' ? tofu : undefined), search: () => [] };
  const check = (draft: Partial<IngredientDraft>) =>
    checkIngredient({ name: 'Tofu', item_id: 'tofu' as ItemId, amount: '', unit: 'count', ...draft }, lookup);

  it('takes the last third of a pack whole', () => {
    expect(check({ amount: '0.995' })).toMatchObject({ ok: true, use: { id: 'tofu', qty: 0.995 } });
  });

  it.each([
    ['more than is at home', { amount: '1.5' }, 'Only 1 Tofu at home'],
    ['an amount it cannot read', { amount: 'half' }, '1/3'],
    ['a blank name', { name: ' ', item_id: null }, 'type a name'],
    ['an item no longer at home', { item_id: 'gone' as ItemId }, 'no longer at home']
  ])('refuses %s', (_, draft, problem) => {
    const result = check(draft);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.problem).toContain(problem);
  });
});
