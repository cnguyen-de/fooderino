import { afterEach, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseTransport } from '~/utils/supabase-transport';
import { useSyncEngine } from '~/composables/useSyncEngine';

const engine = vi.hoisted(() => ({ syncMembership: vi.fn(), sync: vi.fn(), flush: vi.fn() }));
vi.mock('~~/utils/sync-engine', async (original) => ({
  ...(await original<typeof import('~~/utils/sync-engine')>()),
  createSyncEngine: () => engine
}));
vi.mock('~~/utils/sync-state', () => ({ getSyncState: async () => ({ household_id: null }) }));
vi.mock('~/composables/usePantry', () => ({ recordRejections: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('aborts a stalled request and releases its caller even while the SDK is waiting for auth', async () => {
  vi.useFakeTimers();
  const abortSignal = vi.fn((_signal: AbortSignal) => new Promise(() => {}));
  const client = { rpc: () => ({ abortSignal }) } as unknown as SupabaseClient;
  const transport = createSupabaseTransport(client);
  const failure = expect(transport.myHousehold()).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(30_000);
  await failure;
  expect(abortSignal.mock.calls[0]![0].aborted).toBe(true);
});

it('recovers from a failed push on the same connection and cancels future checks on stop', async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('useState', (_key: string, init: () => unknown) => ref(init()));
  vi.stubGlobal('useSupabaseUser', () => ref({ id: 'alice' }));
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  vi.stubGlobal('useSupabaseClient', () => ({ channel: () => channel, removeChannel: vi.fn() }));
  const session = useSyncEngine();
  try {
    await session.start();
    engine.flush.mockRejectedValueOnce(new Error('Connection lost'));
    await session.flush();
    expect(session.status.value).toBe('error');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(engine.syncMembership).toHaveBeenCalledTimes(2);
    expect(engine.sync).toHaveBeenLastCalledWith('full');
    expect(session.status.value).toBe('idle');
  } finally {
    session.stop();
  }
  expect(vi.getTimerCount()).toBe(0);
});
