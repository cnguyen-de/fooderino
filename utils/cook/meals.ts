import { daysBetween } from '~~/utils/pantry';
import type { CommandId, ItemId, LocalDate } from '~~/types/pantry';
import type { CookedId, CookedRow as Cooked, RecipeId, RecipeKind, RecipeRow as Recipe, RecipeSheet } from '~~/types/cook';

/** Rows as the device shows them, pending sheets included, so no server `seq`. */
type RecipeRow = Omit<Recipe, 'seq'>;
type CookedRow = Omit<Cooked, 'seq'>;
import { ingredientStatus, type IngredientStatus, type PantryLookup } from './match';

/** A Vietnamese dinner: at least one soup and 2 to 3 dishes. */
export const MEAL_RULE = { soups: 1, dishes: 2, maxDishes: 3 } as const;
/** A recipe cooked fewer than this many days ago is ranked after every other suggestion. */
export const RECENT_DAYS = 7;
const SUGGESTION_LIMIT = { soups: 2, dishes: 3 } as const;

/** A live recipe as every Cook page reads it. */
export interface RecipeView extends Omit<RecipeSheet, 'household_id' | 'deleted_at'> {
  lastEaten: LocalDate | null;
  ingredientsAtHome: IngredientStatus[];
  /** Counts of `out` and `short` ingredients, for badges and ranking. */
  out: number;
  short: number;
}

/** Live recipes by name, each with its stock and the last date it was cooked. */
export function buildRecipeViews(
  recipes: readonly RecipeRow[],
  cooked: readonly CookedRow[],
  lookup: PantryLookup
): RecipeView[] {
  const lastEaten = new Map<RecipeId, LocalDate>();
  for (const row of cooked) {
    const prev = lastEaten.get(row.recipe_id);
    if (row.deleted_at === null && (!prev || row.date > prev)) lastEaten.set(row.recipe_id, row.date);
  }
  return recipes
    .filter((r) => r.deleted_at === null)
    .map(({ id, name, kind, ingredients, instructions }) => {
      const ingredientsAtHome = ingredients.map((i) => ingredientStatus(i, lookup));
      return {
        id,
        name,
        kind,
        ingredients,
        instructions,
        lastEaten: lastEaten.get(id) ?? null,
        ingredientsAtHome,
        out: ingredientsAtHome.filter((s) => s.stock === 'out').length,
        short: ingredientsAtHome.filter((s) => s.stock === 'short').length
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface MealDish {
  id: CookedId;
  /** Deleted recipes stay readable here, so history never loses a name. */
  recipe: { id: RecipeId; name: string; kind: RecipeKind; deleted: boolean };
  uses: CommandId[];
}

export interface MealNeeds {
  soup: boolean;
  /** Dishes still missing to reach `MEAL_RULE.dishes`. Zero once met. */
  dishes: number;
}

/** Every live cooked row sharing a date. A meal has no row of its own. */
export interface Meal {
  date: LocalDate;
  dishes: MealDish[];
  needs: MealNeeds;
}

const countKind = (dishes: readonly MealDish[], kind: RecipeKind) =>
  dishes.filter((d) => d.recipe.kind === kind).length;

export function mealNeeds(dishes: readonly MealDish[]): MealNeeds {
  return {
    soup: countKind(dishes, 'soup') < MEAL_RULE.soups,
    dishes: Math.max(0, MEAL_RULE.dishes - countKind(dishes, 'dish'))
  };
}

/** Live cooked rows grouped by date, newest first, dishes in the order they were added. */
export function buildMeals(cooked: readonly CookedRow[], recipes: ReadonlyMap<RecipeId, RecipeRow>): Meal[] {
  const byDate = new Map<LocalDate, CookedRow[]>();
  for (const row of cooked) {
    if (row.deleted_at !== null || !recipes.has(row.recipe_id)) continue;
    const rows = byDate.get(row.date) ?? [];
    rows.push(row);
    byDate.set(row.date, rows);
  }
  return [...byDate]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, rows]) => {
      const dishes = rows
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id))
        .map((row): MealDish => {
          const recipe = recipes.get(row.recipe_id)!;
          return {
            id: row.id,
            recipe: { id: recipe.id, name: recipe.name, kind: recipe.kind, deleted: recipe.deleted_at !== null },
            uses: row.uses
          };
        });
      return { date, dishes, needs: mealNeeds(dishes) };
    });
}

export interface Suggestion {
  recipe: RecipeView;
  /** Days since last cooked; null when never. */
  daysSince: number | null;
  /** At-home ingredients whose item is on Home's use-soon list. */
  expiring: number;
}

export interface MealSuggestions {
  needs: MealNeeds;
  /** Empty once today's meal has a soup. */
  soups: Suggestion[];
  /** Empty once today's meal has `MEAL_RULE.maxDishes` dishes. */
  dishes: Suggestion[];
}

function rank(a: Suggestion, b: Suggestion): number {
  const recent = (s: Suggestion) => (s.daysSince !== null && s.daysSince < RECENT_DAYS ? 1 : 0);
  const since = (s: Suggestion) => s.daysSince ?? Infinity;
  return (
    recent(a) - recent(b) ||
    a.recipe.short - b.recipe.short ||
    b.expiring - a.expiring ||
    since(b) - since(a) ||
    a.recipe.name.localeCompare(b.recipe.name)
  );
}

/**
 * What to cook today. A candidate has at least one tracked ingredient, none of them out,
 * and was not cooked today. Recently cooked recipes go last, then more short ingredients.
 */
export function suggestFor(input: {
  recipes: readonly RecipeView[];
  meals: readonly Meal[];
  today: LocalDate;
  useSoon?: ReadonlySet<ItemId>;
}): MealSuggestions {
  const { recipes, meals, today, useSoon = new Set() } = input;
  const dishes = meals.find((m) => m.date === today)?.dishes ?? [];
  const ranked = recipes
    .filter((r) => r.lastEaten !== today && r.out === 0 && r.ingredientsAtHome.some((s) => s.stock !== 'untracked'))
    .map((recipe) => ({
      recipe,
      daysSince: recipe.lastEaten ? daysBetween(recipe.lastEaten, today) : null,
      expiring: recipe.ingredientsAtHome.filter((s) => s.match.kind === 'item' && useSoon.has(s.match.item.id)).length
    }))
    .sort(rank);
  const pick = (kind: RecipeKind, limit: number, open: boolean) =>
    open ? ranked.filter((s) => s.recipe.kind === kind).slice(0, limit) : [];
  return {
    needs: mealNeeds(dishes),
    soups: pick('soup', SUGGESTION_LIMIT.soups, countKind(dishes, 'soup') < MEAL_RULE.soups),
    dishes: pick('dish', SUGGESTION_LIMIT.dishes, countKind(dishes, 'dish') < MEAL_RULE.maxDishes)
  };
}
