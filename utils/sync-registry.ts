import type { Table } from 'dexie';
import { db } from '~~/utils/db';
import type { SyncCollection } from '~~/utils/sync-hook';

export interface SyncTableDef {
  /** Dexie store name. */
  local: SyncCollection;
  /** Supabase table name. */
  remote: string;
  /** Column the incremental pull and catch-up push page on. */
  cursor: 'updated_at' | 'created_at';
  /** Append-only tables never participate in LWW merge. */
  appendOnly: boolean;
  /** Columns stripped before push because the server owns them. */
  pushOmit: string[];
}

/**
 * Order matters: pushes walk this array in sequence, so a table must appear
 * after anything it holds a foreign key to. Items reference lists; members
 * reference lists.
 */
export const SYNC_TABLES: SyncTableDef[] = [
  { local: 'lists', remote: 'lists_v2', cursor: 'updated_at', appendOnly: false, pushOmit: [] },
  {
    local: 'list_members',
    remote: 'list_members',
    cursor: 'updated_at',
    appendOnly: false,
    pushOmit: []
  },
  // `amount` and `amount_to_purchase` are owned by the item_ops trigger.
  // Upserting them here would overwrite increments other devices folded in.
  {
    local: 'items',
    remote: 'items_v2',
    cursor: 'updated_at',
    appendOnly: false,
    pushOmit: ['amount', 'amount_to_purchase']
  },
  { local: 'logs', remote: 'logs_v2', cursor: 'created_at', appendOnly: true, pushOmit: [] },
  {
    local: 'recipes',
    remote: 'recipes_v2',
    cursor: 'updated_at',
    appendOnly: false,
    pushOmit: []
  },
  {
    local: 'user_settings',
    remote: 'user_settings',
    cursor: 'updated_at',
    appendOnly: false,
    pushOmit: []
  }
];

const BY_LOCAL = new Map(SYNC_TABLES.map((d) => [d.local, d]));

export function defFor(local: SyncCollection): SyncTableDef {
  const def = BY_LOCAL.get(local);
  if (!def) throw new Error(`No sync table registered for "${local}"`);
  return def;
}

export function tableFor(local: SyncCollection): Table {
  return db.table(local);
}
