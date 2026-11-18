import Dexie, { type EntityTable, type Table, type Transaction } from 'dexie';
import type {
  BagEntryRow,
  CommandLogRow,
  HouseholdRow,
  ItemEventRow,
  ItemRow,
  MemberRow
} from '~~/types/pantry';
import type { CookedRow, RecipeRow } from '~~/types/cook';
import type { ItemRecord, PendingOp, PendingSheet, QueuedCommand, SyncStateRow } from '~~/types/sync';
import { convertPendingOps, legacyRecipeSheet, type LegacyRecipe } from '~~/utils/db-upgrade';

/**
 * The device holds confirmed server state for one household, plus two outboxes:
 * `commands` (state changes, drained in order) and `edits` (LWW metadata sheets).
 */
export type FooderinoDb = Dexie & {
  households: EntityTable<HouseholdRow, 'id'>;
  members: EntityTable<MemberRow, 'id'>;
  items: EntityTable<ItemRow, 'id'>;
  bag: EntityTable<BagEntryRow, 'id'>;
  events: EntityTable<ItemEventRow, 'id'>;
  /** Confirmed `command_log` rows: receipts for replay, and the inverses undo applies. */
  log: EntityTable<CommandLogRow, 'command_id'>;
  recipes: EntityTable<RecipeRow, 'id'>;
  cooked: EntityTable<CookedRow, 'id'>;
  commands: EntityTable<QueuedCommand, 'id'>;
  edits: Table<PendingSheet, PendingSheet['id'], PendingSheet>;
  syncState: EntityTable<SyncStateRow, 'key'>;
};

export const SYNC_STATE_KEY = 'singleton';

/** Converts the v2 outbox into commands, then drops every list-era row. */
async function upgradeToV3(tx: Transaction): Promise<void> {
  const ops = (await tx.table('pendingOps').toArray()) as PendingOp[];
  const legacyItems = (await tx.table('items').toArray()) as ItemRecord[];
  const { commands, discarded } = convertPendingOps(ops, legacyItems);
  if (discarded > 0) console.warn(`[db] v3 upgrade discarded ${discarded} pending op(s) it could not convert`);

  await tx.table('items').clear();
  await tx.table('commands').bulkAdd(commands.map((c, i): QueuedCommand => ({ ...c, created_seq: i + 1 })));

  const state = (await tx.table('syncState').get(SYNC_STATE_KEY)) as Partial<SyncStateRow> | undefined;
  if (state) {
    const next: SyncStateRow = {
      key: SYNC_STATE_KEY,
      device_id: state.device_id ?? crypto.randomUUID(),
      user_id: state.user_id ?? null,
      household_id: null,
      hydrated_at: null,
      cursors: {}
    };
    await tx.table('syncState').put(next);
  }
}

async function upgradeToV4(tx: Transaction): Promise<void> {
  await tx
    .table('edits')
    .toCollection()
    .modify((e: Partial<PendingSheet>) => {
      e.store ??= 'items';
    });

  const state = (await tx.table('syncState').get(SYNC_STATE_KEY)) as (SyncStateRow & { recipes?: unknown }) | undefined;
  const household = state?.household_id;
  if (household) {
    const legacy = (await tx.table('recipes').toArray()) as LegacyRecipe[];
    const sheets = legacy.flatMap((r) => legacyRecipeSheet(r, household) ?? []);
    await tx.table('edits').bulkPut(sheets);
  }
  await tx.table('recipes').clear();
  if (state && 'recipes' in state) {
    const { recipes: _, ...next } = state;
    await tx.table('syncState').put(next);
  }
}

export function openFooderinoDb(name = 'FooderinoDB'): FooderinoDb {
  const db = new Dexie(name) as FooderinoDb;

  // Only indexed fields are listed; the rest of each record is stored regardless.
  db.version(1).stores({
    lists: 'id, updated_at, deleted_at',
    list_members: 'id, list_id, user_id, updated_at, deleted_at',
    items: 'id, list_id, name, updated_at, deleted_at',
    logs: 'id, list_id, created_at',
    recipes: 'id, user_id, updated_at, deleted_at',
    user_settings: 'id, user_id, updated_at, deleted_at',
    pendingOps: 'id, item_id, created_at',
    syncState: 'key'
  });

  db.version(2).stores({ user_settings: null });

  db.version(3)
    .stores({
      lists: null,
      list_members: null,
      logs: null,
      pendingOps: null,
      households: 'id',
      members: 'id, user_id',
      items: 'id, seq',
      bag: 'id, item_id, seq',
      events: 'id, item_id, occurred_at, seq',
      log: 'command_id, seq',
      commands: 'id, created_seq',
      edits: 'id'
    })
    .upgrade(upgradeToV3);

  db.version(4)
    .stores({ recipes: 'id, seq', cooked: 'id, seq', edits: 'id, store' })
    .upgrade(upgradeToV4);

  return db;
}

export const db = openFooderinoDb();
