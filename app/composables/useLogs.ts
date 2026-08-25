import type { Ref, ComputedRef } from 'vue';
import { liveQuery } from 'dexie';
import { db } from '~~/utils/db';
import { notifyLocalChange } from '~~/utils/sync-hook';
import { buildLog, pruneLogs, LOCAL_LOG_LIMIT } from '~~/utils/log-ops';
import type { LogRecord } from '~~/types/sync';

const all = ref<LogRecord[]>([]);
let started = false;

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  liveQuery(() => db.logs.toArray()).subscribe({
    next: (rows) => {
      all.value = rows;
    },
    error: (e) => console.error('useLogs:', e)
  });
}

export function useLogs(listId?: Ref<string | null> | ComputedRef<string | null>) {
  onBeforeMount(ensureStarted);

  const logs = computed(() =>
    all.value
      .filter((l) => (listId?.value ? l.list_id === listId.value : true))
      // Carried over from the legacy `.neq('payload', '')` query: entries with
      // no payload (creates, deletes) were never shown and still are not.
      .filter((l) => l.payload !== '')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  );

  async function append(
    list_id: string,
    actor: string | null,
    itemName: string | null,
    action: string,
    payload: string
  ): Promise<void> {
    const log = buildLog(list_id, actor, itemName, action, payload);
    await db.logs.add(log);
    notifyLocalChange('logs', log.id);
    await pruneLogs(list_id, LOCAL_LOG_LIMIT);
  }

  return { logs, append };
}
