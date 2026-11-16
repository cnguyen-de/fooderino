import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '~~/utils/db';
import { getSyncState, setCursor } from '~~/utils/sync-state';
import { resolveAccountChange, clearLocalData } from '~~/utils/account';

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('resolveAccountChange', () => {
  it('reports first-login when no user has ever been recorded', async () => {
    expect(await resolveAccountChange('user-a')).toBe('first-login');
    expect((await getSyncState()).user_id).toBe('user-a');
  });

  it('reports same when the user is unchanged and keeps local data', async () => {
    await resolveAccountChange('user-a');
    await db.items.add({
      id: 'keep',
      list_id: 'l',
      name: 'milk',
      location: '',
      store: '',
      amount: 0,
      amount_to_purchase: 0,
      amount_type: 'count',
      default_amount: 1,
      created_by: null,
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null
    });

    expect(await resolveAccountChange('user-a')).toBe('same');
    expect(await db.items.count()).toBe(1);
  });

  it('wipes every synced store when a different user signs in', async () => {
    await resolveAccountChange('user-a');
    await db.items.add({
      id: 'gone',
      list_id: 'l',
      name: 'milk',
      location: '',
      store: '',
      amount: 0,
      amount_to_purchase: 0,
      amount_type: 'count',
      default_amount: 1,
      created_by: null,
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null
    });
    await setCursor('items', { pulled: '2026-01-01T00:00:00.000Z' });

    expect(await resolveAccountChange('user-b')).toBe('switched');
    expect(await db.items.count()).toBe(0);
  });

  it('resets cursors on switch, so the new account pulls from scratch', async () => {
    await resolveAccountChange('user-a');
    await setCursor('items', { pulled: '2026-01-01T00:00:00.000Z' });

    await resolveAccountChange('user-b');

    const state = await getSyncState();
    expect(state.cursors).toEqual({});
    expect(state.hydrated_at).toBeNull();
  });

  it('records the new user id after a switch', async () => {
    await resolveAccountChange('user-a');
    await resolveAccountChange('user-b');
    expect((await getSyncState()).user_id).toBe('user-b');
  });

  it('leaves local data intact on sign-out, so re-login is instant', async () => {
    await resolveAccountChange('user-a');
    await db.items.add({
      id: 'keep',
      list_id: 'l',
      name: 'milk',
      location: '',
      store: '',
      amount: 0,
      amount_to_purchase: 0,
      amount_type: 'count',
      default_amount: 1,
      created_by: null,
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null
    });

    expect(await resolveAccountChange(null)).toBe('same');
    expect(await db.items.count()).toBe(1);
  });

  it('preserves the device id across a switch', async () => {
    await resolveAccountChange('user-a');
    const before = (await getSyncState()).device_id;
    await resolveAccountChange('user-b');
    expect((await getSyncState()).device_id).toBe(before);
  });
});

describe('clearLocalData', () => {
  it('wipes records, ops and cursors but keeps who and what this device is', async () => {
    await resolveAccountChange('user-a');
    const { device_id } = await getSyncState();
    await db.lists.add({ id: 'l', name: 'x', owner: 'user-a', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null });
    await db.pendingOps.add({
      id: 'op',
      item_id: 'i',
      list_id: 'l',
      field: 'amount',
      kind: 'delta',
      value: 1,
      actor: null,
      created_at: '2026-01-01T00:00:00.000Z'
    });
    await setCursor('lists', { pulled: '2026-01-01T00:00:00.000Z', pushed: '2026-01-01T00:00:00.000Z' });

    await clearLocalData();

    expect(await db.lists.count()).toBe(0);
    expect(await db.pendingOps.count()).toBe(0);
    const state = await getSyncState();
    expect(state.cursors).toEqual({});
    expect(state.user_id).toBe('user-a');
    expect(state.device_id).toBe(device_id);
    // A clear followed by another boot is not an account switch.
    expect(await resolveAccountChange('user-a')).toBe('same');
  });
});
