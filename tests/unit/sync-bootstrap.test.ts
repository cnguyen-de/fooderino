import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, watch } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { useSyncBootstrap } from '../../app/composables/useSyncBootstrap';
import { resolveAccountChange } from '~~/utils/account';

vi.mock('~~/utils/account', () => ({ resolveAccountChange: vi.fn().mockResolvedValue(undefined) }));
vi.mock('~~/utils/sync-state', () => ({ getSyncState: vi.fn().mockResolvedValue({ hydrated_at: '2026-11-17' }) }));
vi.mock('~~/utils/db', () => ({ db: {} }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('session sync bootstrap', () => {
  it('keeps one session across token refreshes and only restarts when the account changes', async () => {
    const user = ref<{ id: string; token?: string } | null>({ id: 'alice' });
    const hydrated = ref(false);
    const start = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn();
    let mount: () => void = () => {};
    vi.stubGlobal('useSupabaseUser', () => user);
    vi.stubGlobal('useSyncEngine', () => ({ start, stop }));
    vi.stubGlobal('useState', () => hydrated);
    vi.stubGlobal('onMounted', (fn: () => void) => {
      mount = fn;
    });
    vi.stubGlobal('watch', watch);
    const scope = effectScope();
    scope.run(useSyncBootstrap);
    try {
      mount();
      await flushPromises();
      expect(start).toHaveBeenCalledTimes(1);
      expect(hydrated.value).toBe(true);
      user.value = { id: 'alice', token: 'refreshed' };
      await flushPromises();
      expect(start).toHaveBeenCalledTimes(1);
      expect(resolveAccountChange).toHaveBeenCalledTimes(1);
      user.value = { id: 'bob' };
      await flushPromises();
      expect(start).toHaveBeenCalledTimes(2);
      expect(resolveAccountChange).toHaveBeenLastCalledWith('bob');
      user.value = null;
      await flushPromises();
      expect(stop).toHaveBeenCalledOnce();
      expect(hydrated.value).toBe(false);
    } finally {
      scope.stop();
    }
  });
});
