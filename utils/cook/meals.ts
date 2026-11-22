import { daysBetween } from '~~/utils/pantry';
import type { CommandId, ItemId, LocalDate } from '~~/types/pantry';
import type {
  CookedId,
  CookedRow as Cooked,
  Ingredient,
  MealIngredientId,
  MealIngredientRow as Used,
  RecipeId,
  RecipeKind,
  RecipeRow as Recipe,
  RecipeSheet
} from '~~/types/cook';

type RecipeRow = Omit<Recipe, 'seq'>;
type CookedRow = Omit<Cooked, 'seq'>;
type MealIngredientRow = Omit<Used, 'seq'>;
import { ingredientStatus, type IngredientStatus, type PantryLookup } from './match';

export const MEAL_RULE = { soups: 1, dishes: 2, maxDishes: 3 } as const;
export const RECENT_DAYS = 7;
const SUGGESTION_LIMIT = { soups: 2, dishes: 3 } as const;

export interface RecipeView extends Omit<RecipeSheet, 'household_id' | 'deleted_at'> {
  lastEaten: LocalDate | null;
  ingredientsAtHome: IngredientStatus[];
  out: number;
  short: number;
}

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
  recipe: { id: RecipeId; name: string; kind: RecipeKind; deleted: boolean };
  uses: CommandId[];
}

/** An ingredient used in the meal without a recipe. It does not count toward the meal rule. */
export interface MealIngredient {
  id: MealIngredientId;
  ingredient: Ingredient;
  uses: CommandId[];
}

export interface MealNeeds {
  soup: boolean;
  dishes: number;
}

export interface Meal {
  date: LocalDate;
  dishes: MealDish[];
  ingredients: MealIngredient[];
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

const inOrderAdded = (a: { updated_at: string; id: string }, b: { updated_at: string; id: string }) =>
  a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id);

export function buildMeals(
  cooked: readonly CookedRow[],
  recipes: ReadonlyMap<RecipeId, RecipeRow>,
  ingredients: readonly MealIngredientRow[]
): Meal[] {
  const days = new Map<LocalDate, { dishes: CookedRow[]; ingredients: MealIngredientRow[] }>();
  const day = (date: LocalDate) => {
    const rows = days.get(date) ?? { dishes: [], ingredients: [] };
    days.set(date, rows);
    return rows;
  };
  for (const row of cooked) {
    if (row.deleted_at === null && recipes.has(row.recipe_id)) day(row.date).dishes.push(row);
  }
  for (const row of ingredients) {
    if (row.deleted_at === null) day(row.date).ingredients.push(row);
  }
  return [...days]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, rows]) => {
      const dishes = rows.dishes.sort(inOrderAdded).map((row): MealDish => {
        const recipe = recipes.get(row.recipe_id)!;
        return {
          id: row.id,
          recipe: { id: recipe.id, name: recipe.name, kind: recipe.kind, deleted: recipe.deleted_at !== null },
          uses: row.uses
        };
      });
      const used = rows.ingredients
        .sort(inOrderAdded)
        .map(({ id, ingredient, uses }): MealIngredient => ({ id, ingredient, uses }));
      return { date, dishes, ingredients: used, needs: mealNeeds(dishes) };
    });
}

export interface Suggestion {
  recipe: RecipeView;
  daysSince: number | null;
  expiring: number;
}

export interface MealSuggestions {
  needs: MealNeeds;
  soups: Suggestion[];
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
