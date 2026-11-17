import { SYNC_STATE_KEY, type FooderinoDb } from '~~/utils/db';
import type { SyncStateRow } from '~~/types/sync';

export function freshSyncState(): SyncStateRow {
  return {
    key: SYNC_STATE_KEY,
    device_id: crypto.randomUUID(),
    user_id: null,
    household_id: null,
    hydrated_at: null,
    cursors: {},
    recipes: { pulled: null, pushed: null }
  };
}

/** Read-only, so it is safe inside a liveQuery: a missing row reads as fresh without writing one. */
export async function readSyncState(db: FooderinoDb): Promise<SyncStateRow> {
  return (await db.syncState.get(SYNC_STATE_KEY)) ?? freshSyncState();
}

export async function getSyncState(db: FooderinoDb): Promise<SyncStateRow> {
  const existing = await db.syncState.get(SYNC_STATE_KEY);
  if (existing) return existing;
  const fresh = freshSyncState();
  await db.syncState.put(fresh);
  return fresh;
}

/** Read-modify-write in one transaction: every writer shares this row. */
export async function setSyncState(db: FooderinoDb, patch: Partial<Omit<SyncStateRow, 'key'>>): Promise<void> {
  await db.transaction('rw', db.syncState, async () => {
    const current = await getSyncState(db);
    await db.syncState.put({ ...current, ...patch, key: SYNC_STATE_KEY });
  });
}
