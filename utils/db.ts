import Dexie, { type EntityTable } from 'dexie';
import type {
  ListRecord,
  ListMemberRecord,
  ItemRecord,
  LogRecord,
  RecipeRecord,
  PendingOp,
  SyncStateRow
} from '~~/types/sync';

const db = new Dexie('FooderinoDB') as Dexie & {
  lists: EntityTable<ListRecord, 'id'>;
  list_members: EntityTable<ListMemberRecord, 'id'>;
  items: EntityTable<ItemRecord, 'id'>;
  logs: EntityTable<LogRecord, 'id'>;
  recipes: EntityTable<RecipeRecord, 'id'>;
  pendingOps: EntityTable<PendingOp, 'id'>;
  syncState: EntityTable<SyncStateRow, 'key'>;
};

// Only indexed fields are listed here; the rest of each record is stored regardless.
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

export { db };
