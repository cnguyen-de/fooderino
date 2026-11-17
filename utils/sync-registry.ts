import type { HouseholdRows, HouseholdStore } from '~~/types/sync';
import {
  parseBagEntry,
  parseCommandLog,
  parseEvent,
  parseHousehold,
  parseItem,
  parseMember
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
}

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
  def({ store: 'items', remote: 'items_v2', scope: 'household_id', key: (r) => r.id, parse: parseItem }),
  def({ store: 'bag', remote: 'bag_entries', scope: 'household_id', key: (r) => r.id, parse: parseBagEntry }),
  def({ store: 'events', remote: 'item_events', scope: 'household_id', key: (r) => r.id, parse: parseEvent }),
  def({ store: 'log', remote: 'command_log', scope: 'household_id', key: (r) => r.command_id, parse: parseCommandLog })
] as const;

export const HOUSEHOLD_STORES: readonly HouseholdStore[] = HOUSEHOLD_TABLES.map((d) => d.store);

export const PAGE_SIZE = 1000;
export const COMMAND_BATCH = 50;
