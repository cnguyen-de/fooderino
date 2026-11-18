import type { CommandId } from '~~/types/pantry';
import type { HouseholdRows, HouseholdStore, PendingSheet, SheetStore } from '~~/types/sync';
import {
  parseBagEntry,
  parseCommandLog,
  parseCooked,
  parseEvent,
  parseHousehold,
  parseItem,
  parseMember,
  parseRecipe
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
  /** Set on the stores the client writes whole. */
  sheet?: S extends SheetStore ? SheetDef<S> : never;
}

export interface SheetDef<S extends SheetStore> {
  /** The columns a push sends. Mirrors the SQL column grants; every other column is server-owned. */
  columns: readonly Exclude<keyof PendingSheet<S>, 'store'>[];
  /** Commands the sheet points at. It waits while any of them is queued, so a reader never sees it ahead of their effects. */
  waitsFor?: (sheet: PendingSheet<S>) => readonly CommandId[];
}

export type SheetTableDef<S extends SheetStore = SheetStore> = HouseholdTableDef<S> & { sheet: SheetDef<S> };

function def<S extends HouseholdStore>(d: HouseholdTableDef<S>): HouseholdTableDef<S> {
  return d;
}

/**
 * Pull order, and push order for sheets. The log comes last: a command commits its
 * effects and its log row together, so any effect a pull saw has its receipt in the
 * same pull, and replay never applies an accepted pending command on top of its own
 * effect. Recipes come before cooked dishes, so a dish never pushes ahead of its recipe.
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
      columns: ['id', 'household_id', 'name', 'aliases', 'tags', 'unit', 'default_amount', 'shelf_life_days', 'updated_at', 'deleted_at']
    }
  }),
  def({
    store: 'recipes',
    remote: 'household_recipes',
    scope: 'household_id',
    key: (r) => r.id,
    parse: parseRecipe,
    sheet: { columns: ['id', 'household_id', 'name', 'kind', 'ingredients', 'instructions', 'updated_at', 'deleted_at'] }
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
  def({ store: 'bag', remote: 'bag_entries', scope: 'household_id', key: (r) => r.id, parse: parseBagEntry }),
  def({ store: 'events', remote: 'item_events', scope: 'household_id', key: (r) => r.id, parse: parseEvent }),
  def({ store: 'log', remote: 'command_log', scope: 'household_id', key: (r) => r.command_id, parse: parseCommandLog })
] as const;

export const HOUSEHOLD_STORES: readonly HouseholdStore[] = HOUSEHOLD_TABLES.map((d) => d.store);

/** Push order is registry order, so a row lands after the rows it references. */
export const SHEET_TABLES = HOUSEHOLD_TABLES.filter((d) => d.sheet !== undefined) as readonly SheetTableDef[];

export const PAGE_SIZE = 1000;
export const COMMAND_BATCH = 50;
