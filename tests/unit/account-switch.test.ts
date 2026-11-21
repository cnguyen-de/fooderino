import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import type { HouseholdId, ItemId, ItemRow, Instant, CommandId } from '~~/types/pantry';
import type { QueuedCommand } from '~~/types/sync';
import { openFooderinoDb, type FooderinoDb } from '~~/utils/db';
import { getSyncState, setSyncState } from '~~/utils/sync-state';
import { clearLocalData, countPendingChanges, resolveAccountChange } from '~~/utils/account';

const H = '00000000-0000-4000-8000-000000000001' as HouseholdId;
const opened: FooderinoDb[] = [];

async function fresh(): Promise<FooderinoDb> {
  const db = openFooderinoDb(`account-${crypto.randomUUID()}`);
  await db.open();
  opened.push(db);
  return db;
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
    await Dexie.delete(db.name);
  }
});

const row: ItemRow = {
  id: 'i1' as ItemId, household_id: H, name: 'Milk', aliases: [], tags: [], unit: 'count', default_amount: 1,
  shelf_life_days: null, season: null, amount: 1, to_buy: 0, best_before: null, merged_into: null, deleted_at: null,
  updated_at: '2026-01-01T00:00:00.000Z' as Instant, seq: 1
};

async function seed(db: FooderinoDb): Promise<void> {
  await db.items.put(row);
  const use: QueuedCommand = { id: 'c1' as CommandId, household_id: H, item_id: row.id, at: row.updated_at, kind: 'use', qty: 1, waste: false, created_seq: 1 };
  await db.commands.put(use);
  await setSyncState(db, { household_id: H, cursors: { items: 9 }, hydrated_at: row.updated_at });
}

describe('resolveAccountChange', () => {
  it('reports first-login and records the user', async () => {
    const db = await fresh();
    expect(await resolveAccountChange('user-a', db)).toBe('first-login');
    expect((await getSyncState(db)).user_id).toBe('user-a');
  });

  it('keeps everything for the same user, and for a sign-out', async () => {
    const db = await fresh();
    await resolveAccountChange('user-a', db);
    await seed(db);
    expect(await resolveAccountChange('user-a', db)).toBe('same');
    expect(await resolveAccountChange(null, db)).toBe('same');
    expect(await db.items.count()).toBe(1);
  });

  it('wipes every store, outboxes included, when another user signs in, and keeps the device id', async () => {
    const db = await fresh();
    await resolveAccountChange('user-a', db);
    const device = (await getSyncState(db)).device_id;
    await seed(db);

    expect(await resolveAccountChange('user-b', db)).toBe('switched');

    expect(await db.items.count()).toBe(0);
    expect(await db.commands.count()).toBe(0);
    expect(await getSyncState(db)).toMatchObject({
      user_id: 'user-b', device_id: device, household_id: null, cursors: {}, hydrated_at: null
    });
  });
});

describe('clearLocalData', () => {
  it('counts unsynced changes, then drops data and cursors but keeps the account', async () => {
    const db = await fresh();
    await resolveAccountChange('user-a', db);
    await seed(db);
    expect(await countPendingChanges(db)).toBe(1);

    await clearLocalData(db);

    expect(await countPendingChanges(db)).toBe(0);
    expect(await db.items.count()).toBe(0);
    expect(await getSyncState(db)).toMatchObject({ user_id: 'user-a', household_id: null, cursors: {} });
  });
});
