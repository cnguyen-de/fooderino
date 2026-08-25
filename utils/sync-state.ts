import { db } from '~~/utils/db';
import type { SyncStateRow } from '~~/types/sync';

const SINGLETON = 'singleton';

export async function getSyncState(): Promise<SyncStateRow> {
  const existing = await db.syncState.get(SINGLETON);
  if (existing) return existing;

  const fresh: SyncStateRow = {
    key: SINGLETON,
    device_id: crypto.randomUUID(),
    user_id: null,
    hydrated_at: null,
    cursors: {}
  };
  await db.syncState.put(fresh);
  return fresh;
}

export async function setSyncState(patch: Partial<SyncStateRow>): Promise<void> {
  await db.transaction('rw', db.syncState, async () => {
    const current = await getSyncState();
    await db.syncState.put({ ...current, ...patch, key: SINGLETON });
  });
}

export async function getCursor(
  table: string
): Promise<{ pulled: string | null; pushed: string | null }> {
  const state = await getSyncState();
  return state.cursors[table] ?? { pulled: null, pushed: null };
}

/**
 * Read-modify-write inside a transaction. Pulls for different tables run
 * concurrently, and since all cursors share one row, a plain read-then-write
 * would let the last writer silently discard its peers' updates.
 */
export async function setCursor(
  table: string,
  patch: { pulled?: string | null; pushed?: string | null }
): Promise<void> {
  await db.transaction('rw', db.syncState, async () => {
    const current = await getSyncState();
    const existing = current.cursors[table] ?? { pulled: null, pushed: null };
    await db.syncState.put({
      ...current,
      cursors: { ...current.cursors, [table]: { ...existing, ...patch } }
    });
  });
}
