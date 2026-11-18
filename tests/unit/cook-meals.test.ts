import { describe, expect, it } from 'vitest';
import { buildMeals, buildRecipeViews, mealNeeds, suggestFor, type PantryLookup } from '~~/utils/cook';
import { buildSearchIndex, resolveItem } from '~~/utils/pantry';
import type { CommandId, HouseholdId, Instant, Item, ItemId, LocalDate } from '~~/types/pantry';
import type { CookedId, CookedRow, Ingredient, RecipeId, RecipeKind, RecipeRow } from '~~/types/cook';

const TODAY = '2026-11-18' as LocalDate;
const H = 'h' as HouseholdId;

const item = (id: string, name: string, amount: number): Item => ({
  id: id as ItemId,
  household_id: H,
  name,
  aliases: [],
  tags: [],
  unit: 'count',
  amount,
  to_buy: 0,
  default_amount: 1,
  shelf_life_days: null,
  best_before: null,
  deleted_at: null,
  merged_into: null
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

const ing = (name: string, amount?: number): Ingredient => ({
  name,
  item_id: null,
  qty: amount === undefined ? null : { amount, unit: 'count' }
});

const recipe = (id: string, kind: RecipeKind, ingredients: Ingredient[], deleted = false): RecipeRow => ({
  id: id as RecipeId,
  household_id: H,
  name: id,
  kind,
  ingredients,
  instructions: '',
  deleted_at: deleted ? ('2026-11-10T00:00:00Z' as Instant) : null,
  updated_at: '2026-11-01T00:00:00Z' as Instant,
  seq: 1
});

let n = 0;
const cooked = (recipe_id: string, date: string, opts: { deleted?: boolean; at?: string } = {}): CookedRow => ({
  id: `c${++n}` as CookedId,
  household_id: H,
  recipe_id: recipe_id as RecipeId,
  date: date as LocalDate,
  uses: [`cmd${n}` as CommandId],
  deleted_at: opts.deleted ? ('2026-11-18T12:00:00Z' as Instant) : null,
  updated_at: (opts.at ?? `${date}T18:00:00Z`) as Instant,
  seq: n
});

const lookup = pantry([
  item('pork', 'Pork', 2),
  item('tofu', 'Tofu', 1),
  item('eggs', 'Eggs', 0),
  item('tomato', 'Tomato', 5),
  item('fish', 'Fish', 1)
]);

function suggest(recipes: RecipeRow[], rows: CookedRow[] = [], useSoon?: Set<ItemId>) {
  const views = buildRecipeViews(recipes, rows, lookup);
  const meals = buildMeals(rows, new Map(recipes.map((r) => [r.id, r])));
  return suggestFor({ recipes: views, meals, today: TODAY, useSoon });
}
const names = (list: { recipe: { name: string } }[]) => list.map((s) => s.recipe.name);

describe('meal history', () => {
  it('groups live cooked rows by date, newest first, with dishes in the order added', () => {
    const recipes = [recipe('canh chua', 'soup', []), recipe('thit kho', 'dish', []), recipe('rau muong', 'dish', [])];
    const rows = [
      cooked('thit kho', '2026-11-17', { at: '2026-11-17T18:05:00Z' }),
      cooked('canh chua', '2026-11-17', { at: '2026-11-17T18:00:00Z' }),
      cooked('rau muong', '2026-11-18'),
      cooked('rau muong', '2026-11-17', { deleted: true })
    ];
    const meals = buildMeals(rows, new Map(recipes.map((r) => [r.id, r])));
    expect(meals.map((m) => [m.date, m.dishes.map((d) => d.recipe.name)])).toEqual([
      ['2026-11-18', ['rau muong']],
      ['2026-11-17', ['canh chua', 'thit kho']]
    ]);
    expect(meals[1]!.dishes[1]!.uses).toEqual([rows[0]!.uses[0]]);
  });

  it('keeps a deleted recipe readable in past meals', () => {
    const recipes = [recipe('bun bo', 'soup', [], true)];
    const [meal] = buildMeals([cooked('bun bo', '2026-11-10')], new Map(recipes.map((r) => [r.id, r])));
    expect(meal!.dishes[0]!.recipe).toEqual({ id: 'bun bo', name: 'bun bo', kind: 'soup', deleted: true });
  });

  it('reports what a meal still needs to reach a soup and two dishes', () => {
    const recipes = [recipe('canh', 'soup', []), recipe('ga', 'dish', []), recipe('ca', 'dish', [])];
    const map = new Map(recipes.map((r) => [r.id, r]));
    const needs = (ids: string[]) =>
      buildMeals(
        ids.map((id) => cooked(id, TODAY)),
        map
      )[0]!.needs;
    expect(needs(['ga'])).toEqual({ soup: true, dishes: 1 });
    expect(needs(['canh', 'ga', 'ca'])).toEqual({ soup: false, dishes: 0 });
    expect(mealNeeds([])).toEqual({ soup: true, dishes: 2 });
  });
});

describe('recipe views', () => {
  it('lists live recipes with their last cooked date and stock counts', () => {
    const views = buildRecipeViews(
      [recipe('trung', 'dish', [ing('Eggs'), ing('Pork', 3), ing('Salt')]), recipe('old', 'dish', [], true)],
      [cooked('trung', '2026-11-01'), cooked('trung', '2026-11-12'), cooked('trung', '2026-11-15', { deleted: true })],
      lookup
    );
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ name: 'trung', lastEaten: '2026-11-12', out: 1, short: 1 });
  });
});

describe('suggestions for today', () => {
  it('suggests only recipes with a tracked ingredient and none out', () => {
    const out = suggest([
      recipe('ok', 'dish', [ing('Pork'), ing('Fish sauce')]),
      recipe('needs eggs', 'dish', [ing('Pork'), ing('Eggs')]),
      recipe('only staples', 'dish', [ing('Salt'), ing('Fish sauce')]),
      recipe('nothing', 'dish', [])
    ]);
    expect(names(out.dishes)).toEqual(['ok']);
  });

  it('leaves out what was cooked today', () => {
    const out = suggest([recipe('a', 'dish', [ing('Pork')]), recipe('b', 'dish', [ing('Tofu')])], [cooked('a', TODAY)]);
    expect(names(out.dishes)).toEqual(['b']);
  });

  it('ranks recently cooked last, then short ingredients, then use-soon items, then longest since cooked', () => {
    const recipes = [
      recipe('recent', 'dish', [ing('Pork')]),
      recipe('short', 'dish', [ing('Pork', 5)]),
      recipe('stale', 'dish', [ing('Tomato')]),
      recipe('never', 'dish', [ing('Tomato')]),
      recipe('expiring', 'dish', [ing('Fish')])
    ];
    const rows = [cooked('recent', '2026-11-12'), cooked('stale', '2026-11-01'), cooked('expiring', '2026-11-11')];
    const out = suggest(recipes, rows, new Set(['fish' as ItemId]));
    expect(names(out.dishes)).toEqual(['expiring', 'never', 'stale']);
    expect(out.dishes[0]).toMatchObject({ daysSince: 7, expiring: 1 });
    expect(out.dishes[1]!.daysSince).toBeNull();

    const all = suggest(recipes.slice(0, 2), rows);
    expect(names(all.dishes)).toEqual(['short', 'recent']);
  });

  it('offers up to two soups and three dishes while today lacks them', () => {
    const soups = ['s1', 's2', 's3'].map((id) => recipe(id, 'soup', [ing('Tomato')]));
    const dishes = ['d1', 'd2', 'd3', 'd4'].map((id) => recipe(id, 'dish', [ing('Pork')]));
    const out = suggest([...soups, ...dishes]);
    expect(out.soups).toHaveLength(2);
    expect(out.dishes).toHaveLength(3);
    expect(out.needs).toEqual({ soup: true, dishes: 2 });
  });

  it('stops offering soups once today has one, and dishes once today has three', () => {
    const recipes = [
      recipe('canh', 'soup', []),
      recipe('ga', 'dish', []),
      recipe('ca', 'dish', []),
      recipe('bo', 'dish', []),
      recipe('s', 'soup', [ing('Tomato')]),
      recipe('d', 'dish', [ing('Pork')])
    ];
    const withSoup = suggest(recipes, [cooked('canh', TODAY)]);
    expect(withSoup.soups).toEqual([]);
    expect(names(withSoup.dishes)).toEqual(['d']);

    const full = suggest(
      recipes,
      ['canh', 'ga', 'ca', 'bo'].map((id) => cooked(id, TODAY))
    );
    expect(full.dishes).toEqual([]);
    expect(full.needs).toEqual({ soup: false, dishes: 0 });
  });
});
