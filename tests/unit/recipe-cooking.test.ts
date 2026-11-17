import { describe, expect, it } from 'vitest';
import { planRecipeCooking } from '~~/utils/recipe-cooking';
import { buildSearchIndex } from '~~/utils/pantry';
import type { Item, ItemId, HouseholdId } from '~~/types/pantry';
import { FakeServer, HOUSEHOLD } from '../support/fake-server';
import { makeDevice } from '../support/device';

const item = (id: string, name: string, aliases: string[] = []): Item => ({
  id: id as ItemId,
  household_id: HOUSEHOLD as HouseholdId,
  name,
  aliases,
  tags: [],
  unit: 'count',
  amount: 3,
  to_buy: 0,
  default_amount: 1,
  shelf_life_days: null,
  best_before: null,
  deleted_at: null,
  merged_into: null
});
function searchFor(items: Item[]) {
  const index = buildSearchIndex(items);
  return (name: string) => index(name).map((hit) => ({ ...hit, item: items.find((i) => i.id === hit.item_id)! }));
}

describe('recipe cooking preview', () => {
  it('matches ingredient names and multilingual aliases to the same pantry item', () => {
    const [line] = planRecipeCooking(
      [{ name: 'Milch', amount: 2, amount_type: 'count' }],
      searchFor([item('milk', 'Milk', ['Milch', 'Sữa'])])
    );
    expect(line).toMatchObject({ itemId: 'milk', qty: 2, included: true });
  });
  it('does not confuse a gram amount with a count amount', () => {
    const [line] = planRecipeCooking(
      [{ name: 'Flour', amount: 500, amount_type: 'gram' }],
      searchFor([item('flour', 'Flour')])
    );
    expect(line).toMatchObject({ itemId: 'flour', qty: 1, included: true });
    expect(line!.ingredient.amount).toBe(500);
  });
  it('skips missing and out-of-stock ingredients and leaves ambiguous matches for the user', () => {
    const items = [item('a', 'Milk'), item('b', 'Oat drink', ['Milk']), { ...item('eggs', 'Eggs'), amount: 0 }];
    const lines = planRecipeCooking(
      [
        { name: 'Milk', amount_type: 'count' },
        { name: 'Eggs', amount_type: 'count' },
        { name: 'Salt', amount_type: 'count' }
      ],
      searchFor(items)
    );
    expect(lines[0]).toMatchObject({ itemId: '', included: false });
    expect(lines[0]!.choices).toHaveLength(2);
    expect(lines[1]).toMatchObject({ itemId: 'eggs', included: false });
    expect(lines[2]).toMatchObject({ choices: [], included: false });
  });
});

describe('using recipe ingredients', () => {
  it('deducts the selected quantities, records use events and undoes the whole dish', async () => {
    const server = new FakeServer();
    const d = await makeDevice(server.transport('alice'), HOUSEHOLD);
    const milk = (await d.ops.createItem({ name: 'Milk', amount: 3, to_buy: 2 }))!;
    const eggs = (await d.ops.createItem({ name: 'Eggs', amount: 4 }))!;
    await d.engine.sync('full');
    const handle = await d.ops.useItems([
      { id: milk, qty: 1 },
      { id: eggs, qty: 2 }
    ]);
    expect(handle!.commands).toHaveLength(2);
    expect(await d.item(milk)).toMatchObject({ amount: 2, to_buy: 2 });
    expect(await d.item(eggs)).toMatchObject({ amount: 2 });
    await d.engine.sync('full');
    expect(server.items.get(milk)?.amount).toBe(2);
    expect(server.items.get(eggs)?.amount).toBe(2);
    expect((await d.db.events.toArray()).filter((e) => e.kind === 'consume')).toHaveLength(2);
    await d.ops.undo(handle!);
    await d.engine.sync('full');
    expect(server.items.get(milk)?.amount).toBe(3);
    expect(server.items.get(eggs)?.amount).toBe(4);
  });
  it('combines duplicate ingredient matches before checking stock', async () => {
    const d = await makeDevice(new FakeServer().transport('alice'), HOUSEHOLD);
    const milk = (await d.ops.createItem({ name: 'Milk', amount: 3 }))!;
    const handle = await d.ops.useItems([
      { id: milk, qty: 1 },
      { id: milk, qty: 2 }
    ]);
    expect(handle!.commands).toHaveLength(1);
    expect((await d.item(milk))?.amount).toBe(0);
  });
  it('does not deduct any ingredient when combined quantities exceed current stock', async () => {
    const d = await makeDevice(new FakeServer().transport('alice'), HOUSEHOLD);
    const milk = (await d.ops.createItem({ name: 'Milk', amount: 3 }))!;
    const eggs = (await d.ops.createItem({ name: 'Eggs', amount: 4 }))!;
    const before = await d.db.commands.count();
    await expect(
      d.ops.useItems([
        { id: eggs, qty: 1 },
        { id: milk, qty: 2 },
        { id: milk, qty: 2 }
      ])
    ).rejects.toThrow('Not enough Milk');
    expect(await d.db.commands.count()).toBe(before);
    expect((await d.item(milk))?.amount).toBe(3);
    expect((await d.item(eggs))?.amount).toBe(4);
  });
  it('rejects invalid quantities before making changes', async () => {
    const d = await makeDevice(new FakeServer().transport('alice'), HOUSEHOLD);
    const milk = (await d.ops.createItem({ name: 'Milk', amount: 3 }))!;
    for (const qty of [0, -1, NaN, Infinity])
      await expect(d.ops.useItems([{ id: milk, qty }])).rejects.toThrow('greater than zero');
    expect((await d.item(milk))?.amount).toBe(3);
    expect(await d.ops.useItems([])).toBeNull();
  });
});
