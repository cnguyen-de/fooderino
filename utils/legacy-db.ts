import Dexie, { type EntityTable } from 'dexie';
import type { ItemRecord, ListMemberRecord, ListRecord, LogRecord, PendingOp } from '~~/types/sync';

/**
 * Dead. The list-era UI (useItems, useLists, useLogs, item-ops, log-ops and the pages on
 * them) compiles against this until the household UI replaces it. It is a private,
 * never-synced database, so that UI cannot write list-era rows into the v3 stores.
 */
export const db = new Dexie('FooderinoListEra') as Dexie & {
  lists: EntityTable<ListRecord, 'id'>;
  list_members: EntityTable<ListMemberRecord, 'id'>;
  items: EntityTable<ItemRecord, 'id'>;
  logs: EntityTable<LogRecord, 'id'>;
  pendingOps: EntityTable<PendingOp, 'id'>;
};

db.version(1).stores({
  lists: 'id, updated_at, deleted_at',
  list_members: 'id, list_id, user_id, updated_at, deleted_at',
  items: 'id, list_id, name, updated_at, deleted_at',
  logs: 'id, list_id, created_at',
  pendingOps: 'id, item_id, created_at'
});

export function notifyLocalChange(_collection: string, _id: string): void {}
