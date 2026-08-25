import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '~~/utils/db';
import { queueDelta, queueSet, buildItem } from '~~/utils/item-ops';
import type { ItemRecord } from '~~/types/sync';

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

const seed = async (over: Partial<ItemRecord> = {}) => {
  const item = {
    ...buildItem({
      list_id: 'l',
      name: 'milk',
      location: 'fridge',
      store: 'aldi',
      amount_type: 'count',
      default_amount: 1,
      created_by: 'a@b.c'
    }),
    ...over
  };
  await db.items.add(item);
  return item;
};

describe('buildItem', () => {
  it('starts both counters at zero, because ops carry the opening values', () => {
    const item = buildItem({
      list_id: 'l',
      name: 'milk',
      location: '',
      store: '',
      amount_type: 'count',
      default_amount: 1,
      created_by: null
    });
    expect(item.amount).toBe(0);
    expect(item.amount_to_purchase).toBe(0);
  });

  // The create drawer binds its inputs to strings, so `default_amount` arrives
  // as '3'. Postgres used to coerce it; IndexedDB stores whatever it is given.
  it('coerces a numeric-looking default_amount to a number', () => {
    const item = buildItem({
      list_id: 'l',
      name: 'milk',
      location: '',
      store: '',
      amount_type: 'count',
      default_amount: '3' as unknown as number,
      created_by: null
    });
    expect(item.default_amount).toBe(3);
  });
});

describe('queueDelta', () => {
  it('updates the local value immediately so the UI never lags', async () => {
    const item = await seed({ amount: 2 });
    await queueDelta(item, 'amount', 1, 'a@b.c');
    expect((await db.items.get(item.id))?.amount).toBe(3);
  });

  it('queues exactly one op per call', async () => {
    const item = await seed();
    await queueDelta(item, 'amount', 1, 'a@b.c');
    await queueDelta(item, 'amount', 1, 'a@b.c');

    const ops = await db.pendingOps.toArray();
    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.kind === 'delta' && o.value === 1)).toBe(true);
  });

  // Callers hold a row handed to them by liveQuery, which refreshes
  // asynchronously — so a double-tap passes the SAME stale object twice. The
  // delta must compound off the stored row, not off the caller's snapshot,
  // or the second tap renders 1 and then jumps to 2 when the pull lands.
  it('compounds off the stored row, not the caller stale snapshot', async () => {
    const item = await seed({ amount: 0 });
    await queueDelta(item, 'amount', 1, 'a@b.c');
    await queueDelta(item, 'amount', 1, 'a@b.c');
    expect((await db.items.get(item.id))?.amount).toBe(2);
  });

  it('does not bump updated_at, which belongs to the LWW fields', async () => {
    const item = await seed({ updated_at: '2026-01-01T00:00:00.000Z' });
    await queueDelta(item, 'amount', 1, 'a@b.c');
    expect((await db.items.get(item.id))?.updated_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('handles the two counters independently', async () => {
    const item = await seed({ amount: 1, amount_to_purchase: 1 });
    await queueDelta(item, 'amount_to_purchase', 4, 'a@b.c');
    const after = await db.items.get(item.id);
    expect(after?.amount).toBe(1);
    expect(after?.amount_to_purchase).toBe(5);
  });

  it('allows a negative delta for undo', async () => {
    const item = await seed({ amount: 3 });
    await queueDelta(item, 'amount', -1, 'a@b.c');
    expect((await db.items.get(item.id))?.amount).toBe(2);
  });

  // Guards the string-concatenation trap: '2' + 1 is '21', and that value
  // would then be pushed as an op and corrupt the server counter too.
  it('adds numerically even when the stored counter is a numeric string', async () => {
    const item = await seed({ amount: '2' as unknown as number });
    await queueDelta(item, 'amount', 1, 'a@b.c');
    expect((await db.items.get(item.id))?.amount).toBe(3);
  });
});

describe('queueing against a row that is gone', () => {
  // The shopping basket is persisted to localStorage, so it survives the
  // cutover holding legacy rows whose ids are not in Dexie. An op for a
  // nonexistent item violates the item_ops FK at push time, and the outbox
  // drain stops at the first throw — one stale basket entry would wedge every
  // pending op on the device, for every list.
  it('queues nothing when the item is not in the local store', async () => {
    const ghost = buildItem({
      list_id: 'l',
      name: 'ghost',
      location: '',
      store: '',
      amount_type: 'count',
      default_amount: 1,
      created_by: null
    });

    await queueDelta(ghost, 'amount', 1, 'a@b.c');
    await queueSet(ghost, 'amount_to_purchase', 0, 'a@b.c');

    expect(await db.pendingOps.count()).toBe(0);
    expect(await db.items.get(ghost.id)).toBeUndefined();
  });
});

describe('queueSet', () => {
  it('replaces the local value and queues a set op', async () => {
    const item = await seed({ amount: 3 });
    await queueSet(item, 'amount', 10, 'a@b.c');

    expect((await db.items.get(item.id))?.amount).toBe(10);
    const ops = await db.pendingOps.toArray();
    expect(ops[0]?.kind).toBe('set');
    expect(ops[0]?.value).toBe(10);
  });

  it('stores a numeric-string value as a number, locally and on the op', async () => {
    const item = await seed({ amount: 0 });
    await queueSet(item, 'amount', '10' as unknown as number, 'a@b.c');

    expect((await db.items.get(item.id))?.amount).toBe(10);
    expect((await db.pendingOps.toArray())[0]?.value).toBe(10);
  });
});
