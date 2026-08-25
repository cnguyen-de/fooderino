import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '~~/utils/db';
import { getSyncState, setSyncState, getCursor, setCursor } from '~~/utils/sync-state';

describe('sync state', () => {
  beforeEach(async () => {
    await db.open();
    await db.syncState.clear();
  });

  it('creates a singleton with a device id on first read', async () => {
    const state = await getSyncState();
    expect(state.device_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.user_id).toBeNull();
    expect(state.hydrated_at).toBeNull();
  });

  it('returns the same device id on a second read', async () => {
    const first = await getSyncState();
    const second = await getSyncState();
    expect(second.device_id).toBe(first.device_id);
  });

  it('patches without dropping untouched fields', async () => {
    const { device_id } = await getSyncState();
    await setSyncState({ user_id: 'user-1' });
    const state = await getSyncState();
    expect(state.user_id).toBe('user-1');
    expect(state.device_id).toBe(device_id);
  });

  it('returns null cursors for a table never synced', async () => {
    expect(await getCursor('items')).toEqual({ pulled: null, pushed: null });
  });

  it('advances one cursor field without clearing the other', async () => {
    await setCursor('items', { pulled: '2026-01-01T00:00:00.000Z' });
    await setCursor('items', { pushed: '2026-01-02T00:00:00.000Z' });
    expect(await getCursor('items')).toEqual({
      pulled: '2026-01-01T00:00:00.000Z',
      pushed: '2026-01-02T00:00:00.000Z'
    });
  });

  it('keeps cursors for different tables independent', async () => {
    await setCursor('items', { pulled: '2026-01-01T00:00:00.000Z' });
    await setCursor('lists', { pulled: '2026-02-02T00:00:00.000Z' });
    expect((await getCursor('items')).pulled).toBe('2026-01-01T00:00:00.000Z');
    expect((await getCursor('lists')).pulled).toBe('2026-02-02T00:00:00.000Z');
  });

  it('survives concurrent cursor writes without losing one', async () => {
    await Promise.all([
      setCursor('items', { pulled: '2026-01-01T00:00:00.000Z' }),
      setCursor('lists', { pulled: '2026-01-01T00:00:00.000Z' }),
      setCursor('logs', { pulled: '2026-01-01T00:00:00.000Z' })
    ]);
    const state = await getSyncState();
    expect(Object.keys(state.cursors).sort()).toEqual(['items', 'lists', 'logs']);
  });
});
