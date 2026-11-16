import { db } from '~~/utils/db';
import { getSyncState, setSyncState } from '~~/utils/sync-state';

/**
 * Reconciles the signed-in account against whoever owns the local data.
 *
 * IndexedDB is scoped to the origin, not the account, so a shared browser
 * would otherwise show a second user the first user's data. On a switch we
 * wipe every synced store and reset the cursors so the new account pulls
 * from scratch. `device_id` survives, because it identifies the browser
 * rather than the person.
 *
 * A null incoming id means "signed out" and is deliberately a no-op: keeping
 * the data makes re-login instant, and the route guard blocks the UI anyway.
 */
export async function resolveAccountChange(
  incomingUserId: string | null
): Promise<'same' | 'switched' | 'first-login'> {
  const state = await getSyncState();

  if (incomingUserId === null) return 'same';
  if (state.user_id === incomingUserId) return 'same';

  if (state.user_id === null) {
    await setSyncState({ user_id: incomingUserId });
    return 'first-login';
  }

  await wipeRecords();
  await setSyncState({ user_id: incomingUserId, cursors: {}, hydrated_at: null });
  return 'switched';
}

/**
 * "Clear local data": drops every record, queued op and cursor so the next
 * sync pulls from scratch. Unlike an account switch, the account and device
 * identity stay — otherwise the next boot would read as a first login.
 * Anything not yet pushed is lost; callers warn first.
 */
export async function clearLocalData(): Promise<void> {
  await wipeRecords();
  await setSyncState({ cursors: {} });
}

async function wipeRecords(): Promise<void> {
  const synced = db.tables.filter((t) => t.name !== 'syncState');
  await db.transaction('rw', synced, async () => {
    await Promise.all(synced.map((t) => t.clear()));
  });
}
