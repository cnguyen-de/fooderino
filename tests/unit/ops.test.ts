import { describe, it, expect } from 'vitest';
import { makeOp, applyOps } from '~~/utils/ops';
import type { ItemRecord, PendingOp } from '~~/types/sync';

const item = (over: Partial<ItemRecord> = {}): ItemRecord => ({
  id: 'item-1',
  list_id: 'list-1',
  name: 'milk',
  location: '',
  store: '',
  amount: 0,
  amount_to_purchase: 0,
  amount_type: 'count',
  default_amount: 1,
  created_by: null,
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  ...over
});

const op = (over: Partial<PendingOp>): PendingOp => ({
  id: crypto.randomUUID(),
  item_id: 'item-1',
  list_id: 'list-1',
  field: 'amount',
  kind: 'delta',
  value: 1,
  actor: null,
  created_at: '2026-01-01T00:00:00.000Z',
  ...over
});

describe('makeOp', () => {
  it('assigns a uuid and an ISO timestamp', () => {
    const o = makeOp({
      item_id: 'i',
      list_id: 'l',
      field: 'amount',
      kind: 'delta',
      value: 1,
      actor: 'a@b.c'
    });
    expect(o.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(o.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});

describe('applyOps', () => {
  it('returns the item unchanged when there are no ops', () => {
    expect(applyOps(item({ amount: 5 }), []).amount).toBe(5);
  });

  it('sums concurrent deltas — the property the whole design exists for', () => {
    const result = applyOps(item({ amount: 3 }), [
      op({ value: 1, created_at: '2026-01-01T00:00:01.000Z' }),
      op({ value: 1, created_at: '2026-01-01T00:00:02.000Z' })
    ]);
    expect(result.amount).toBe(5);
  });

  it('applies a set as a replacement, discarding what came before it', () => {
    const result = applyOps(item({ amount: 3 }), [
      op({ value: 1, created_at: '2026-01-01T00:00:01.000Z' }),
      op({ kind: 'set', value: 10, created_at: '2026-01-01T00:00:02.000Z' })
    ]);
    expect(result.amount).toBe(10);
  });

  it('applies a delta that arrives after a set on top of it', () => {
    const result = applyOps(item({ amount: 3 }), [
      op({ kind: 'set', value: 10, created_at: '2026-01-01T00:00:01.000Z' }),
      op({ value: 2, created_at: '2026-01-01T00:00:02.000Z' })
    ]);
    expect(result.amount).toBe(12);
  });

  it('orders by created_at, not array position', () => {
    const result = applyOps(item({ amount: 0 }), [
      op({ value: 5, created_at: '2026-01-01T00:00:09.000Z' }),
      op({ kind: 'set', value: 1, created_at: '2026-01-01T00:00:01.000Z' })
    ]);
    expect(result.amount).toBe(6);
  });

  it('keeps the two counter fields independent', () => {
    const result = applyOps(item({ amount: 1, amount_to_purchase: 1 }), [
      op({ field: 'amount_to_purchase', value: 4 })
    ]);
    expect(result.amount).toBe(1);
    expect(result.amount_to_purchase).toBe(5);
  });

  it('ignores ops belonging to a different item', () => {
    const result = applyOps(item({ amount: 1 }), [op({ item_id: 'other', value: 99 })]);
    expect(result.amount).toBe(1);
  });

  it('does not mutate the input item', () => {
    const original = item({ amount: 1 });
    applyOps(original, [op({ value: 1 })]);
    expect(original.amount).toBe(1);
  });
});
