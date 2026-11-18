import { db, type FooderinoDb } from '~~/utils/db';
import { getSyncState, setSyncState } from '~~/utils/sync-state';
import type { SyncStateRow } from '~~/types/sync';

const FROM_SCRATCH: Partial<SyncStateRow> = {
  household_id: null,
  hydrated_at: null,
  cursors: {}
};

/**
 * Reconciles the signed-in account against whoever owns the local data.
 *
 * IndexedDB is scoped to the origin, not the account, so a shared browser would
 * otherwise show a second user the first user's data. On a switch every store is
 * wiped, outboxes included, and the new account pulls from scratch. `device_id`
 * survives, because it identifies the browser rather than the person.
 *
 * A null incoming id means "signed out" and is deliberately a no-op: keeping the
 * data makes re-login instant, and the route guard blocks the UI anyway.
 */
export async function resolveAccountChange(
  incomingUserId: string | null,
  target: FooderinoDb = db
): Promise<'same' | 'switched' | 'first-login'> {
  const state = await getSyncState(target);

  if (incomingUserId === null) return 'same';
  if (state.user_id === incomingUserId) return 'same';

  if (state.user_id === null) {
    await setSyncState(target, { user_id: incomingUserId });
    return 'first-login';
  }

  await wipeRecords(target);
  await setSyncState(target, { ...FROM_SCRATCH, user_id: incomingUserId });
  return 'switched';
}

/**
 * "Clear local data": drops every record, queued change and cursor so the next sync
 * pulls from scratch. The account and device identity stay. Anything not yet pushed
 * is lost; callers warn first with `countPendingChanges`.
 */
export async function clearLocalData(target: FooderinoDb = db): Promise<void> {
  await wipeRecords(target);
  await setSyncState(target, FROM_SCRATCH);
}

/** Commands and metadata edits that have not reached the server. */
export async function countPendingChanges(target: FooderinoDb = db): Promise<number> {
  const [commands, edits] = await Promise.all([target.commands.count(), target.edits.count()]);
  return commands + edits;
}

async function wipeRecords(target: FooderinoDb): Promise<void> {
  const synced = target.tables.filter((t) => t.name !== 'syncState');
  await target.transaction('rw', synced, async () => {
    await Promise.all(synced.map((t) => t.clear()));
  });
}
