import { db } from '~~/utils/db';
import type { LogRecord } from '~~/types/sync';

/** Local retention. The server keeps full history; this bounds IndexedDB. */
export const LOCAL_LOG_LIMIT = 200;

export function buildLog(
  listId: string,
  actorEmail: string | null,
  itemName: string | null,
  action: string,
  payload: string
): LogRecord {
  return {
    id: crypto.randomUUID(),
    list_id: listId,
    actor_email: actorEmail,
    item_name: itemName,
    action,
    payload,
    created_at: new Date().toISOString()
  };
}

/** Drops all but the newest `keep` entries for one list. Returns how many went. */
export async function pruneLogs(listId: string, keep: number): Promise<number> {
  const ids = await db.logs.where('list_id').equals(listId).sortBy('created_at');
  if (ids.length <= keep) return 0;

  const stale = ids.slice(0, ids.length - keep).map((l) => l.id);
  await db.logs.bulkDelete(stale);
  return stale.length;
}
