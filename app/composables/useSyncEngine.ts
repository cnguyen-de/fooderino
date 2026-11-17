import type { RealtimeChannel } from '@supabase/supabase-js';
import { createSyncEngine, type SyncEngine } from '~~/utils/sync-engine';
import { createSupabaseTransport } from '~/utils/supabase-transport';
import { HOUSEHOLD_TABLES } from '~~/utils/sync-registry';
import { setLocalChangeHook } from '~~/utils/sync-hook';
import { getSyncState } from '~~/utils/sync-state';
import { db } from '~~/utils/db';
import { recordRejections } from './usePantry';

// Module-level, not function-local: SyncStatus, the bootstrap and the household
// composable all call useSyncEngine(), and a remount must be able to tear down the
// channel a previous instance opened. Function-local state leaks duplicate
// subscriptions on the same topic.
let engine: SyncEngine | null = null;
let channel: RealtimeChannel | null = null;
let channelKey: string | null = null;
let startInFlight: Promise<void> | null = null;
let onOffline: (() => void) | null = null;
let onOnline: (() => void) | null = null;
let onVisible: (() => void) | null = null;
let realtimeTimer: ReturnType<typeof setTimeout> | null = null;
let membershipChanged = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2_000;
let needsRecovery = false;
let active = 0;

export function useSyncEngine() {
  const status = useState<'idle' | 'syncing' | 'offline' | 'error'>('sync-status', () => 'idle');
  const lastSyncedAt = useState<string | null>('sync-last', () => null);
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();

  function clearTimer(): void {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  // Reconcile occasionally even with a connected socket: a missed notification
  // on a quiet household may otherwise leave a foreground device stale indefinitely.
  function scheduleCheck(delay: number): void {
    clearTimer();
    if (!navigator.onLine || document.visibilityState === 'hidden') return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (document.visibilityState !== 'hidden') void checkMembership();
    }, delay);
  }

  async function track(context: string, work: (e: SyncEngine) => Promise<unknown>): Promise<void> {
    const current = engine;
    if (!current) return;
    active++;
    status.value = navigator.onLine ? 'syncing' : 'offline';
    try {
      if (!navigator.onLine) throw new Error('Offline');
      await work(current);
      if (current !== engine) return;
      lastSyncedAt.value = new Date().toISOString();
      if (context === 'membership') {
        needsRecovery = false;
        scheduleCheck(60_000);
        retryDelay = 2_000;
      }
    } catch (err) {
      if (current !== engine) return;
      if (!needsRecovery || !retryTimer) {
        scheduleCheck(retryDelay);
        retryDelay = Math.min(retryDelay * 2, 60_000);
      }
      needsRecovery = true;
      if (navigator.onLine) console.error(`[sync] ${context} failed`, err);
    } finally {
      if (current === engine) {
        active--;
        status.value = !navigator.onLine ? 'offline' : active ? 'syncing' : needsRecovery ? 'error' : 'idle';
      }
    }
  }

  const syncNow = () => track('sync', (e) => e.sync('full'));

  // One command can touch several tables, and bulk metadata edits emit one
  // notification per item. Group those nudges into one pull.
  function nudge(membership = false): void {
    membershipChanged ||= membership;
    if (realtimeTimer) return;
    realtimeTimer = setTimeout(() => {
      realtimeTimer = null;
      const check = membershipChanged;
      membershipChanged = false;
      void (check ? checkMembership() : syncNow());
    }, 150);
  }

  /** Sends both outboxes without pulling. Resolves even when offline; check the outbox after. */
  const flush = () => track('push', (e) => e.flush());

  /** Asks the server which household this user is in, resets local data on a change, then pulls. */
  async function checkMembership(): Promise<void> {
    await track('membership', async (e) => {
      await e.syncMembership();
      if (engine !== e) return;
      await e.sync('full');
      if (engine === e) await subscribe();
    });
  }

  /** Write-through: every local write is pushed as soon as it is queued. */
  function installChangeHook(): void {
    setLocalChangeHook(() => {
      void flush();
    });
  }

  function unsubscribe(): void {
    if (channel) void supabase.removeChannel(channel);
    channel = null;
    channelKey = null;
  }

  /** Realtime only nudges: a change triggers a pull, and a member change re-checks membership. */
  async function subscribe(): Promise<void> {
    const { household_id } = await getSyncState(db);
    const userId = user.value?.id ?? null;
    const key = `${household_id}:${userId}`;
    if (!engine || !userId || key === channelKey) return;
    unsubscribe();
    channelKey = key;

    let next = supabase.channel(`sync:${key}`);
    const listen = (table: string, filter: string, on: () => void) => {
      next = next.on('postgres_changes', { event: '*', schema: 'public', table, filter }, on);
    };
    if (household_id) {
      for (const def of HOUSEHOLD_TABLES) {
        listen(def.remote, `${def.scope}=eq.${household_id}`, () => nudge(def.store === 'members'));
      }
    }
    listen('household_members', `user_id=eq.${userId}`, () => nudge(true));
    listen('recipes_v2', `user_id=eq.${userId}`, () => nudge());
    // Changes made before the subscription went live reach this device only by a pull.
    channel = next.subscribe((state) => {
      if (state === 'SUBSCRIBED') void syncNow();
    });
  }

  async function runStart(): Promise<void> {
    stop();
    engine = createSyncEngine({ db, transport: createSupabaseTransport(supabase), onRejection: recordRejections });
    installChangeHook();
    onOffline = () => {
      clearTimer();
      status.value = 'offline';
    };
    window.addEventListener('offline', onOffline);
    onOnline = () => void checkMembership();
    window.addEventListener('online', onOnline);
    // A phone suspends the socket in the background, and a Realtime that just came up can
    // drop its first changes, so coming back to the app always pulls.
    onVisible = () => {
      if (document.visibilityState === 'visible') void checkMembership();
    };
    document.addEventListener('visibilitychange', onVisible);
    await checkMembership();
  }

  async function start(): Promise<void> {
    if (startInFlight) return startInFlight;
    startInFlight = runStart().finally(() => {
      startInFlight = null;
    });
    return startInFlight;
  }

  function stop(): void {
    if (realtimeTimer) clearTimeout(realtimeTimer);
    realtimeTimer = null;
    membershipChanged = false;
    setLocalChangeHook(null);
    unsubscribe();
    if (onOffline) window.removeEventListener('offline', onOffline);
    onOffline = null;
    if (onOnline) window.removeEventListener('online', onOnline);
    if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    onOnline = null;
    onVisible = null;
    engine = null;
    clearTimer();
    retryDelay = 2_000;
    needsRecovery = false;
    active = 0;
    status.value = 'idle';
    lastSyncedAt.value = null;
  }

  return { status, lastSyncedAt, start, stop, syncNow, flush, checkMembership };
}
