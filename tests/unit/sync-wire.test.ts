import { describe, expect, it } from 'vitest';
import { parseItem, parseMealIngredient, parseRecipe, recipeToWire, WireError } from '~~/utils/sync-wire';

const row = (over: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-0000000000aa',
  household_id: '00000000-0000-4000-8000-000000000001',
  name: 'Kale',
  aliases: [],
  tags: [],
  unit: 'count',
  default_amount: 1,
  shelf_life_days: null,
  season: null,
  amount: 0,
  to_buy: 0,
  best_before: null,
  merged_into: null,
  deleted_at: null,
  updated_at: '2026-11-01T00:00:00Z',
  seq: 1,
  ...over
});

describe('parseItem: season', () => {
  it('reads a season, including one that runs past December', () => {
    expect(parseItem(row({ season: { from: 11, to: 2 } })).season).toEqual({ from: 11, to: 2 });
    expect(parseItem(row({ season: { from: 7, to: 7 } })).season).toEqual({ from: 7, to: 7 });
  });

  it('reads null, and a row from before seasons existed, as no season', () => {
    expect(parseItem(row({ season: null })).season).toBeNull();
    const { season: _, ...legacy } = row();
    expect(parseItem(legacy).season).toBeNull();
  });

  it.each([
    ['a month of 0', { from: 0, to: 2 }],
    ['a month of 13', { from: 1, to: 13 }],
    ['a fractional month', { from: 1.5, to: 3 }],
    ['a month as text', { from: '1', to: 3 }],
    ['a missing end', { from: 1 }],
    ['an extra key', { from: 1, to: 3, note: 'x' }],
    ['an array', [1, 3]]
  ])('refuses %s', (_, season) => {
    expect(() => parseItem(row({ season }))).toThrow(WireError);
  });
});

const entry = (over: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-0000000000bb',
  household_id: '00000000-0000-4000-8000-000000000001',
  date: '2026-11-20',
  ingredient: { name: 'Tofu', item_id: '00000000-0000-4000-8000-0000000000aa', qty: { amount: 0.5, unit: 'count' } },
  uses: ['00000000-0000-4000-8000-0000000000cc'],
  deleted_at: null,
  updated_at: '2026-11-20T18:00:00+00:00',
  seq: 7,
  ...over
});

describe('parseMealIngredient', () => {
  it('reads what the server sends and reads its own output back unchanged', () => {
    const parsed = parseMealIngredient(entry());
    expect(parsed).toEqual({ ...entry(), updated_at: '2026-11-20T18:00:00.000Z' });
    expect(parseMealIngredient(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it('reads an ingredient with no amount and no item, such as salt', () => {
    const salt = { name: 'Salt', item_id: null, qty: null };
    expect(parseMealIngredient(entry({ ingredient: salt, uses: [] }))).toMatchObject({ ingredient: salt, uses: [] });
  });

  it.each([
    ['no ingredient', { ingredient: null }],
    ['an ingredient without a name', { ingredient: { item_id: null, qty: null } }],
    ['an amount of zero', { ingredient: { name: 'Salt', item_id: null, qty: { amount: 0, unit: 'count' } } }],
    ['a use that is not a command id', { uses: ['salt'] }]
  ])('refuses %s', (_, over) => {
    expect(() => parseMealIngredient(entry(over))).toThrow(WireError);
  });
});

const recipe = (over: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-0000000000dd',
  household_id: '00000000-0000-4000-8000-000000000001',
  name: 'Pho',
  kind: 'dish',
  whole_meal: false,
  ingredients: [],
  instructions: '',
  deleted_at: null,
  updated_at: '2026-11-20T18:00:00.000Z',
  seq: 3,
  ...over
});

describe('parseRecipe: kind', () => {
  it('reads a dish marked whole_meal as a whole meal, and a plain dish or soup as itself', () => {
    expect(parseRecipe(recipe({ whole_meal: true })).kind).toBe('whole_meal');
    expect(parseRecipe(recipe()).kind).toBe('dish');
    expect(parseRecipe(recipe({ kind: 'soup' })).kind).toBe('soup');
  });

  it('reads a row from before whole_meal existed as a dish or a soup', () => {
    const { whole_meal: _, ...legacy } = recipe();
    expect(parseRecipe(legacy).kind).toBe('dish');
    expect(parseRecipe({ ...legacy, kind: 'soup' }).kind).toBe('soup');
  });

  it('reads a soup still marked whole_meal as a soup, as an older client that changed it to one wrote it', () => {
    expect(parseRecipe(recipe({ kind: 'soup', whole_meal: true })).kind).toBe('soup');
  });

  it.each([
    ['text', 'true'],
    ['null', null],
    ['a number', 1]
  ])('refuses whole_meal as %s', (_, whole_meal) => {
    expect(() => parseRecipe(recipe({ whole_meal }))).toThrow(WireError);
  });

  it('refuses whole_meal as a kind, which older clients cannot read', () => {
    expect(() => parseRecipe(recipe({ kind: 'whole_meal' }))).toThrow(WireError);
  });
});

describe('recipeToWire', () => {
  it('stores a whole meal as a dish marked whole_meal, and a dish or soup unmarked', () => {
    const pick = (kind: 'dish' | 'soup' | 'whole_meal') => {
      const { kind: k, whole_meal } = recipeToWire({ ...parseRecipe(recipe()), kind });
      return { kind: k, whole_meal };
    };
    expect(pick('whole_meal')).toEqual({ kind: 'dish', whole_meal: true });
    expect(pick('dish')).toEqual({ kind: 'dish', whole_meal: false });
    expect(pick('soup')).toEqual({ kind: 'soup', whole_meal: false });
  });

  it('reads back as the recipe it was made from, for every kind', () => {
    for (const row of [recipe({ whole_meal: true }), recipe(), recipe({ kind: 'soup' })]) {
      const parsed = parseRecipe(row);
      expect(parseRecipe(recipeToWire(parsed))).toEqual(parsed);
    }
  });
});
