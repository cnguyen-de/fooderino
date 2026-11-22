import type { CommandId } from '~~/types/pantry';
import type { HouseholdRows, HouseholdStore, PendingSheet, SheetStore } from '~~/types/sync';
import {
  parseBagEntry,
  parseCommandLog,
  parseCooked,
  parseEvent,
  parseHousehold,
  parseItem,
  parseMealIngredient,
  parseMember,
  parseRecipe,
  recipeToWire,
  type RecipeWire
} from '~~/utils/sync-wire';

export interface HouseholdTableDef<S extends HouseholdStore = HouseholdStore> {
  /** Dexie store. */
  store: S;
  /** Server table. */
  remote: string;
  /** The column that holds the household id; `households` is scoped by its own id. */
  scope: 'id' | 'household_id';
  /** The row's primary key, as the Dexie store keys it. */
  key: (row: HouseholdRows[S]) => string;
  parse: (raw: unknown) => HouseholdRows[S];
  sheet?: S extends SheetStore ? SheetDef<S> : never;
}

/** A sheet as its server table stores it. Only a recipe differs. */
type WireSheet<S extends SheetStore> = S extends 'recipes' ? RecipeWire<PendingSheet<'recipes'>> : PendingSheet<S>;

export interface SheetDef<S extends SheetStore> {
  /** Each one granted to clients: a column they are not granted gets the whole upsert refused. */
  columns: readonly Exclude<keyof WireSheet<S>, 'store'>[];
  toWire?: (sheet: PendingSheet<S>) => WireSheet<S>;
  waitsFor?: (sheet: PendingSheet<S>) => readonly CommandId[];
}

export type SheetTableDef<S extends SheetStore = SheetStore> = HouseholdTableDef<S> & { sheet: SheetDef<S> };

function def<S extends HouseholdStore>(d: HouseholdTableDef<S>): HouseholdTableDef<S> {
  return d;
}

/**
 * Pull order. The log comes last: a command commits its effects and its log row
 * together, so any effect a pull saw has its receipt in the same pull, and replay
 * never applies an accepted pending command on top of its own effect.
 */
export const HOUSEHOLD_TABLES = [
  def({ store: 'households', remote: 'households', scope: 'id', key: (r) => r.id, parse: parseHousehold }),
  def({ store: 'members', remote: 'household_members', scope: 'household_id', key: (r) => r.id, parse: parseMember }),
  def({
    store: 'items',
    remote: 'items_v2',
    scope: 'household_id',
    key: (r) => r.id,
    parse: parseItem,
    sheet: {
      columns: ['id', 'household_id', 'name', 'aliases', 'tags', 'unit', 'default_amount', 'shelf_life_days', 'season', 'updated_at', 'deleted_at']
    }
  }),
  def({
    store: 'recipes',
    remote: 'household_recipes',
    scope: 'household_id',
    key: (r) => r.id,
    parse: parseRecipe,
    sheet: {
      columns: [
        'id',
        'household_id',
        'name',
        'kind',
        'whole_meal',
        'ingredients',
        'instructions',
        'updated_at',
        'deleted_at'
      ],
      toWire: recipeToWire
    }
  }),
  def({
    store: 'cooked',
    remote: 'cooked_recipes',
    scope: 'household_id',
    key: (r) => r.id,
    parse: parseCooked,
    sheet: {
      columns: ['id', 'household_id', 'recipe_id', 'date', 'uses', 'updated_at', 'deleted_at'],
      waitsFor: (dish) => dish.uses
    }
  }),
  def({
    store: 'mealIngredients',
    remote: 'meal_ingredients',
    scope: 'household_id',
    key: (r) => r.id,
    parse: parseMealIngredient,
    sheet: {
      columns: ['id', 'household_id', 'date', 'ingredient', 'uses', 'updated_at', 'deleted_at'],
      waitsFor: (entry) => entry.uses
    }
  }),
  def({ store: 'bag', remote: 'bag_entries', scope: 'household_id', key: (r) => r.id, parse: parseBagEntry }),
  def({ store: 'events', remote: 'item_events', scope: 'household_id', key: (r) => r.id, parse: parseEvent }),
  def({ store: 'log', remote: 'command_log', scope: 'household_id', key: (r) => r.command_id, parse: parseCommandLog })
] as const;

export const HOUSEHOLD_STORES: readonly HouseholdStore[] = HOUSEHOLD_TABLES.map((d) => d.store);

export const SHEET_TABLES = HOUSEHOLD_TABLES.filter((d) => d.sheet !== undefined) as readonly SheetTableDef[];

export function wireRow<S extends SheetStore>(def: SheetTableDef<S>, sheet: PendingSheet<S>): Record<string, unknown> {
  const wire = (def.sheet.toWire ? def.sheet.toWire(sheet) : sheet) as Record<string, unknown>;
  return Object.fromEntries(def.sheet.columns.map((c) => [c, wire[c as string]]));
}

export const PAGE_SIZE = 1000;
export const COMMAND_BATCH = 50;
