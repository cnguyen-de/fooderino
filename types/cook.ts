import type { CommandId, HouseholdId, Instant, ItemId, LocalDate, Unit } from './pantry';

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type RecipeId = Brand<string, 'RecipeId'>;
export type CookedId = Brand<string, 'CookedId'>;
export type MealIngredientId = Brand<string, 'MealIngredientId'>;

export type RecipeKind = 'dish' | 'soup';

/** `amount > 0`. Amount and unit come together or not at all. */
export interface Quantity {
  amount: number;
  unit: Unit;
}

export interface Ingredient {
  /** As picked or typed. Shown, and matched by name, when `item_id` no longer resolves. */
  name: string;
  /** The household item it was picked from, followed through merges. Null for a typed name. */
  item_id: ItemId | null;
  /** Null means "some" or "to taste". */
  qty: Quantity | null;
}

export interface RecipeSheet {
  id: RecipeId;
  household_id: HouseholdId;
  name: string;
  kind: RecipeKind;
  ingredients: Ingredient[];
  /** Markdown. */
  instructions: string;
  deleted_at: Instant | null;
}
export type RecipeRow = RecipeSheet & { updated_at: Instant; seq: number };

/**
 * One fact: the household cooked this recipe on this date. A meal is every live
 * row sharing a date, so two phones adding dishes to one dinner never write the same row.
 */
export interface CookedSheet {
  id: CookedId;
  household_id: HouseholdId;
  recipe_id: RecipeId;
  date: LocalDate;
  /** The `use` commands this cooking queued. Empty when nothing was deducted. */
  uses: CommandId[];
  deleted_at: Instant | null;
}
export type CookedRow = CookedSheet & { updated_at: Instant; seq: number };

/** One fact: the household used this ingredient in the meal on this date, without a recipe. */
export interface MealIngredientSheet {
  id: MealIngredientId;
  household_id: HouseholdId;
  date: LocalDate;
  /** A null `qty` means used, but too little to count, such as salt. */
  ingredient: Ingredient;
  /** The `use` commands this queued. Empty when nothing was deducted. */
  uses: CommandId[];
  deleted_at: Instant | null;
}
export type MealIngredientRow = MealIngredientSheet & { updated_at: Instant; seq: number };
