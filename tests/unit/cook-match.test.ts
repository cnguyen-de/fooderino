import { describe, expect, it } from 'vitest';
import { checkCook, chooseItem, ingredientStatus, matchIngredient, planCook, type PantryLookup } from '~~/utils/cook';
import { buildSearchIndex, resolveItem } from '~~/utils/pantry';
import type { HouseholdId, Instant, Item, ItemId, Unit } from '~~/types/pantry';
import type { Ingredient } from '~~/types/cook';

const item = (id: string, name: string, over: Partial<Item> = {}): Item => ({
  id: id as ItemId,
  household_id: 'h' as HouseholdId,
  name,
  aliases: [],
  tags: [],
  unit: 'count',
  amount: 3,
  to_buy: 0,
  default_amount: 1,
  shelf_life_days: null, season: null,
  best_before: null,
  deleted_at: null,
  merged_into: null,
  ...over
});

function pantry(items: Item[]): PantryLookup {
  const map = new Map(items.map((i) => [i.id, i]));
  const index = buildSearchIndex(items);
  const byId = (id: ItemId) => resolveItem(map, id);
  return {
    byId,
    search: (q) =>
      index(q).flatMap((hit) => {
        const found = byId(hit.item_id);
        return found ? [{ ...hit, item: found }] : [];
      })
  };
}

const ing = (name: string, amount?: number, unit: Unit = 'count', item_id: string | null = null): Ingredient => ({
  name,
  item_id: item_id as ItemId | null,
  qty: amount === undefined ? null : { amount, unit }
});

describe('matching an ingredient to the pantry', () => {
  it('follows a linked item through a merge to the item it now stands for', () => {
    const lookup = pantry([
      item('old', 'Pork', { merged_into: 'new' as ItemId }),
      item('new', 'Pork belly', { amount: 800, unit: 'gram' })
    ]);
    const match = matchIngredient(ing('Pork', 500, 'gram', 'old'), lookup);
    expect(match).toMatchObject({ kind: 'item', via: 'link', item: { id: 'new', name: 'Pork belly' } });
  });

  it('falls back to the name when the linked item was deleted', () => {
    const lookup = pantry([
      item('gone', 'Tamarind', { deleted_at: '2026-11-01T00:00:00Z' as Instant }),
      item('fresh', 'Tamarind')
    ]);
    expect(matchIngredient(ing('Tamarind', 1, 'count', 'gone'), lookup)).toMatchObject({
      kind: 'item',
      via: 'name',
      item: { id: 'fresh' }
    });
  });

  it('matches multilingual aliases accent-insensitively to the same item', () => {
    const lookup = pantry([item('milk', 'Milk', { aliases: ['Milch', 'Sữa'] })]);
    expect(matchIngredient(ing('sua'), lookup)).toMatchObject({ kind: 'item', item: { id: 'milk' } });
    expect(matchIngredient(ing('Milch'), lookup)).toMatchObject({ kind: 'item', item: { id: 'milk' } });
  });

  it('leaves a name shared by two items for the cook to choose', () => {
    const lookup = pantry([item('a', 'Milk'), item('b', 'Oat drink', { aliases: ['Milk'] })]);
    const match = matchIngredient(ing('Milk'), lookup);
    expect(match.kind).toBe('several');
    expect(match.kind === 'several' && match.choices.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('does not match on a prefix or a tag', () => {
    const lookup = pantry([
      item('fs', 'Fish sauce'),
      item('herb', 'Basil', { tags: [{ kind: 'other', name: 'Herbs' }] })
    ]);
    expect(matchIngredient(ing('Fish'), lookup)).toEqual({ kind: 'none' });
    expect(matchIngredient(ing('Herbs'), lookup)).toEqual({ kind: 'none' });
  });
});

describe('ingredient stock', () => {
  const lookup = pantry([
    item('pork', 'Pork', { unit: 'gram', amount: 300 }),
    item('eggs', 'Eggs', { amount: 0 }),
    item('tofu', 'Tofu', { amount: 2 })
  ]);
  const stock = (i: Ingredient) => ingredientStatus(i, lookup).stock;

  it('is enough when the amount at home covers the recipe', () => {
    expect(stock(ing('Pork', 300, 'gram'))).toBe('enough');
    expect(stock(ing('Tofu'))).toBe('enough');
  });

  it('is short when less than the recipe amount is at home in the same unit', () => {
    expect(stock(ing('Pork', 500, 'gram'))).toBe('short');
  });

  it('does not compare amounts across units', () => {
    expect(stock(ing('Tofu', 400, 'gram'))).toBe('enough');
  });

  it('is out when the item has none', () => {
    expect(stock(ing('Eggs', 2))).toBe('out');
  });

  it('is untracked when nothing matches', () => {
    expect(stock(ing('Salt'))).toBe('untracked');
  });

  it('takes the best of several candidates, and out only when all are empty', () => {
    const two = (a: number, b: number) =>
      ingredientStatus(
        ing('Milk'),
        pantry([item('a', 'Milk', { amount: a }), item('b', 'Oat', { aliases: ['Milk'], amount: b })])
      ).stock;
    expect(two(0, 1)).toBe('enough');
    expect(two(0, 0)).toBe('out');
  });
});

describe('planning the cook sheet', () => {
  it('pre-fills the recipe amount for a matched item in the same unit', () => {
    const [line] = planCook([ing('Milch', 2)], pantry([item('milk', 'Milk', { aliases: ['Milch'] })]));
    expect(line).toMatchObject({ item_id: 'milk', qty: 2, include: true });
  });

  it('never reads 500 g as 500 items', () => {
    const [line] = planCook([ing('Flour', 500, 'gram')], pantry([item('flour', 'Flour')]));
    expect(line).toMatchObject({ item_id: 'flour', qty: 1, include: true });
  });

  it('starts at what is at home when the recipe asks for more', () => {
    const [line] = planCook([ing('Pork', 500, 'gram')], pantry([item('pork', 'Pork', { unit: 'gram', amount: 200 })]));
    expect(line).toMatchObject({ item_id: 'pork', qty: 200, include: true });
  });

  it('skips missing and empty ingredients and leaves ambiguous ones for the cook', () => {
    const lookup = pantry([
      item('a', 'Milk'),
      item('b', 'Oat drink', { aliases: ['Milk'] }),
      item('eggs', 'Eggs', { amount: 0 })
    ]);
    const [milk, eggs, salt] = planCook([ing('Milk'), ing('Eggs'), ing('Salt')], lookup);
    expect(milk).toMatchObject({ item_id: null, include: false });
    expect(milk!.status.match.kind).toBe('several');
    expect(eggs).toMatchObject({ item_id: 'eggs', include: false });
    expect(salt).toMatchObject({ item_id: null, include: false });
    expect(salt!.status.stock).toBe('untracked');
  });

  it('re-plans a row when the cook picks one of several items', () => {
    const lookup = pantry([item('a', 'Milk', { amount: 1 }), item('b', 'Oat drink', { aliases: ['Milk'], amount: 4 })]);
    const [line] = planCook([ing('Milk', 2)], lookup);
    expect(chooseItem(line!, 'b' as ItemId, lookup)).toMatchObject({ item_id: 'b', qty: 2, include: true });
    expect(chooseItem(line!, 'a' as ItemId, lookup)).toMatchObject({ item_id: 'a', qty: 1, include: true });
    expect(chooseItem(line!, null, lookup)).toMatchObject({ item_id: null, include: false });
  });
});

describe('checking the cook sheet', () => {
  const lookup = pantry([
    item('old', 'Milk', { merged_into: 'milk' as ItemId }),
    item('milk', 'Milk', { amount: 3 }),
    item('pork', 'Pork', { unit: 'gram', amount: 300 }),
    item('eggs', 'Eggs', { amount: 4 })
  ]);
  const line = (id: string | null, qty: number, include = true) => ({
    status: ingredientStatus(ing('x'), lookup),
    item_id: id as ItemId | null,
    qty,
    include
  });

  it('returns one use per resolved item, totalling lines that resolve to the same item', () => {
    const check = checkCook([line('milk', 1), line('old', 1), line('eggs', 2)], lookup);
    expect(check).toEqual({
      ok: true,
      uses: [
        { id: 'milk', qty: 2 },
        { id: 'eggs', qty: 2 }
      ]
    });
  });

  it('refuses when two lines together use more than is at home', () => {
    expect(checkCook([line('milk', 2), line('old', 2)], lookup)).toEqual({
      ok: false,
      problem: 'Only 3 Milk at home. Reduce the quantity or uncheck it.'
    });
  });

  it('names grams in the problem for a gram item', () => {
    const check = checkCook([line('pork', 400)], lookup);
    expect(check.ok === false && check.problem).toContain('Only 300 g Pork');
  });

  it('refuses a quantity that is not greater than zero', () => {
    for (const qty of [0, -1, NaN, Infinity]) expect(checkCook([line('eggs', qty)], lookup).ok).toBe(false);
  });

  it('refuses an item that is no longer at home', () => {
    expect(checkCook([line('vanished', 1)], lookup).ok).toBe(false);
  });

  it('ignores unchecked and unmatched rows, so cooking with nothing to deduct is allowed', () => {
    expect(checkCook([line('eggs', 99, false), line(null, 1)], lookup)).toEqual({ ok: true, uses: [] });
  });
});
