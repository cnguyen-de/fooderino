import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '~~/utils/db';

describe('db', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('stores and reads back an item by its string uuid', async () => {
    const id = crypto.randomUUID();
    await db.items.add({
      id,
      list_id: 'list-1',
      name: 'milk',
      location: 'fridge',
      store: 'aldi',
      amount: 0,
      amount_to_purchase: 0,
      amount_type: 'count',
      default_amount: 1,
      created_by: null,
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null
    });

    const found = await db.items.get(id);
    expect(found?.name).toBe('milk');
  });

  it('indexes items by list_id', async () => {
    const base = {
      location: '',
      store: '',
      amount: 0,
      amount_to_purchase: 0,
      amount_type: 'count',
      default_amount: 1,
      created_by: null,
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null
    };
    await db.items.bulkAdd([
      { ...base, id: crypto.randomUUID(), list_id: 'a', name: 'milk' },
      { ...base, id: crypto.randomUUID(), list_id: 'b', name: 'eggs' }
    ]);

    const inA = await db.items.where('list_id').equals('a').toArray();
    expect(inA.map((i) => i.name)).toEqual(['milk']);
  });

  it('queries pending ops in insertion order', async () => {
    await db.pendingOps.bulkAdd([
      {
        id: 'op-2',
        item_id: 'i',
        list_id: 'l',
        field: 'amount',
        kind: 'delta',
        value: 1,
        actor: null,
        created_at: '2026-01-01T00:00:02.000Z'
      },
      {
        id: 'op-1',
        item_id: 'i',
        list_id: 'l',
        field: 'amount',
        kind: 'delta',
        value: 1,
        actor: null,
        created_at: '2026-01-01T00:00:01.000Z'
      }
    ]);

    const ordered = await db.pendingOps.orderBy('created_at').toArray();
    expect(ordered.map((o) => o.id)).toEqual(['op-1', 'op-2']);
  });
});
