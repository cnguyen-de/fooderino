import type { RealtimeChannel } from '@supabase/supabase-js';
import { createSyncEngine, type SyncEngine, type Row } from '~~/utils/sync-engine';
import { createSupabaseTransport } from '~/utils/supabase-transport';
import { SYNC_TABLES, defFor } from '~~/utils/sync-registry';
import { setLocalChangeHook } from '~~/utils/sync-hook';
import { db } from '~~/utils/db';

// Module-level, not function-local: SyncStatus and the bootstrap both call
// useSyncEngine(), and a remount must be able to tear down the channel a
// previous instance opened. Function-local state leaks duplicate
// subscriptions on the same topic.
let engine: SyncEngine | null = null;
let channels: RealtimeChannel[] = [];
let startInFlight: Promise<void> | null = null;

export function useSyncEngine() {
  const status = useState<'idle' | 'syncing' | 'offline' | 'error'>('sync-status', () => 'idle');
  const lastSyncedAt = useState<string | null>('sync-last', () => null);
  const supabase = useSupabaseClient();

  function markFailure(context: string, err?: unknown): void {
    status.value = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error';
    console.error(`[sync] ${context} failed`, err);
  }

  async function syncNow(): Promise<void> {
    if (!engine) return;
    status.value = 'syncing';
    try {
      await engine.runOnce();
      lastSyncedAt.value = new Date().toISOString();
      status.value = 'idle';
    } catch (e) {
      markFailure('sync', e);
    }
  }

  /** Push one record as soon as it changes, so edits land without waiting. */
  function installChangeHook(): void {
    setLocalChangeHook((collection) => {
      if (!engine) return;
      engine
        .pushDirty(defFor(collection))
        .then(() => engine?.pushOutbox())
        .then(() => {
          lastSyncedAt.value = new Date().toISOString();
          if (status.value !== 'syncing') status.value = 'idle';
        })
        .catch((e) => markFailure('write-through push', e));
    });
  }

  function subscribeRealtime(): void {
    for (const def of SYNC_TABLES) {
      const channel = supabase
        .channel(`sync:${def.remote}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: def.remote },
          (payload) => {
            const row = payload.new as Row;
            engine
              ?.applyRemote(def, row)
              .then(async () => {
                // A membership for a list this device has never seen means
                // the user joined it elsewhere. Its rows predate the pull
                // cursor, so only a full sync (which back-fills) brings them in.
                if (def.local !== 'list_members' || row.deleted_at) return;
                if (!(await db.lists.get(row.list_id as string))) await syncNow();
              })
              .catch((e) => markFailure(`realtime ${def.remote}`, e));
          }
        )
        .subscribe();
      channels.push(channel);
    }
  }

  async function runStart(): Promise<void> {
    stop();
    engine = createSyncEngine(createSupabaseTransport(supabase));
    status.value = 'syncing';
    installChangeHook();
    try {
      await engine.runOnce();
      subscribeRealtime();
      lastSyncedAt.value = new Date().toISOString();
      status.value = 'idle';
    } catch (e) {
      // Never leave the UI stuck on 'syncing'. A later write-through push or
      // a re-run of start() clears this back to idle.
      markFailure('start', e);
    }
  }

  async function start(): Promise<void> {
    if (startInFlight) return startInFlight;
    startInFlight = runStart().finally(() => {
      startInFlight = null;
    });
    return startInFlight;
  }

  function stop(): void {
    setLocalChangeHook(null);
    for (const c of channels) supabase.removeChannel(c);
    channels = [];
    engine = null;
  }

  return { status, lastSyncedAt, start, stop, syncNow };
}

export { clearLocalData } from '~~/utils/account';
