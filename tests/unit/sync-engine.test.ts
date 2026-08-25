import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '~~/utils/db';
import { defFor } from '~~/utils/sync-registry';
import { getCursor, setCursor } from '~~/utils/sync-state';
import { createSyncEngine, PAGE_SIZE, type Row, type SyncTransport } from '~~/utils/sync-engine';
import type { ItemRecord, PendingOp } from '~~/types/sync';

/** In-memory stand-in for Supabase. Records what was sent for assertions. */
function fakeTransport(seed: Record<string, Row[]> = {}) {
  const remote: Record<string, Row[]> = { ...seed };
  const upserted: { table: string; rows: Row[] }[] = [];
  const ops: PendingOp[] = [];
  let failOpsAfter = Number.POSITIVE_INFINITY;
  const duplicateIds = new Set<string>();

  const transport: SyncTransport = {
    async fetchSince(table, cursorField, since, offset, limit) {
      const all = (remote[table] ?? [])
        .filter((r) => !since || String(r[cursorField]) > since)
        .sort((a, b) => String(a[cursorField]).localeCompare(String(b[cursorField])));
      return all.slice(offset, offset + limit);
    },
    async upsertRows(table, rows) {
      upserted.push({ table, rows });
    },
    async insertOp(op) {
      if (ops.length >= failOpsAfter) throw new Error('network down');
      if (duplicateIds.has(op.id)) return 'duplicate';
      ops.push(op);
      return 'inserted';
    }
  };

  return {
    transport,
    upserted,
    ops,
    failOpsAfter: (n: number) => {
      failOpsAfter = n;
    },
    markDuplicate: (id: string) => duplicateIds.add(id)
  };
}

const item = (over: Partial<ItemRecord> = {}): ItemRecord => ({
  id: crypto.randomUUID(),
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

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('pushDirty', () => {
  it('sends rows newer than the pushed cursor and skips the rest', async () => {
    await db.items.bulkAdd([
      item({ id: 'old', updated_at: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'new', updated_at: '2026-01-03T00:00:00.000Z' })
    ]);
    await setCursor('items', { pushed: '2026-01-02T00:00:00.000Z' });

    const f = fakeTransport();
    await createSyncEngine(f.transport).pushDirty(defFor('items'));

    expect(f.upserted).toHaveLength(1);
    expect(f.upserted[0]!.rows.map((r) => r.id)).toEqual(['new']);
  });

  it('strips the trigger-owned counter columns from item pushes', async () => {
    await db.items.add(item({ id: 'a', amount: 7, amount_to_purchase: 3 }));

    const f = fakeTransport();
    await createSyncEngine(f.transport).pushDirty(defFor('items'));

    const sent = f.upserted[0]!.rows[0]!;
    expect(sent).not.toHaveProperty('amount');
    expect(sent).not.toHaveProperty('amount_to_purchase');
    expect(sent.name).toBe('milk');
  });

  it('advances the pushed cursor to the newest row sent', async () => {
    await db.items.bulkAdd([
      item({ id: 'a', updated_at: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'b', updated_at: '2026-01-05T00:00:00.000Z' })
    ]);

    const f = fakeTransport();
    await createSyncEngine(f.transport).pushDirty(defFor('items'));

    expect((await getCursor('items')).pushed).toBe('2026-01-05T00:00:00.000Z');
  });

  it('sends nothing and leaves the cursor alone when no rows are dirty', async () => {
    const f = fakeTransport();
    await createSyncEngine(f.transport).pushDirty(defFor('items'));

    expect(f.upserted).toHaveLength(0);
    expect((await getCursor('items')).pushed).toBeNull();
  });
});

describe('pushOutbox', () => {
  const op = (over: Partial<PendingOp> = {}): PendingOp => ({
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

  it('sends queued ops oldest first and empties the queue', async () => {
    await db.pendingOps.bulkAdd([
      op({ id: 'second', created_at: '2026-01-01T00:00:02.000Z' }),
      op({ id: 'first', created_at: '2026-01-01T00:00:01.000Z' })
    ]);

    const f = fakeTransport();
    await createSyncEngine(f.transport).pushOutbox();

    expect(f.ops.map((o) => o.id)).toEqual(['first', 'second']);
    expect(await db.pendingOps.count()).toBe(0);
  });

  it('drops a duplicate op, because the server already folded it', async () => {
    await db.pendingOps.add(op({ id: 'dupe' }));

    const f = fakeTransport();
    f.markDuplicate('dupe');
    await createSyncEngine(f.transport).pushOutbox();

    expect(await db.pendingOps.count()).toBe(0);
  });

  it('keeps unsent ops queued when the transport throws', async () => {
    await db.pendingOps.bulkAdd([
      op({ id: 'a', created_at: '2026-01-01T00:00:01.000Z' }),
      op({ id: 'b', created_at: '2026-01-01T00:00:02.000Z' })
    ]);

    const f = fakeTransport();
    f.failOpsAfter(1);
    await expect(createSyncEngine(f.transport).pushOutbox()).rejects.toThrow('network down');

    expect(await db.pendingOps.toArray()).toHaveLength(1);
    expect((await db.pendingOps.toArray())[0]!.id).toBe('b');
  });
});

describe('pull', () => {
  it('writes rows we have never seen', async () => {
    const f = fakeTransport({
      items_v2: [{ ...item({ id: 'remote-1', name: 'eggs' }) }]
    });
    await createSyncEngine(f.transport).pull(defFor('items'));

    expect((await db.items.get('remote-1'))?.name).toBe('eggs');
  });

  it('does not overwrite a locally newer row', async () => {
    await db.items.add(item({ id: 'x', name: 'local', updated_at: '2026-01-05T00:00:00.000Z' }));
    const f = fakeTransport({
      items_v2: [{ ...item({ id: 'x', name: 'remote', updated_at: '2026-01-01T00:00:00.000Z' }) }]
    });

    await createSyncEngine(f.transport).pull(defFor('items'));

    expect((await db.items.get('x'))?.name).toBe('local');
  });

  it('replays unpushed ops on top of a pulled item', async () => {
    const f = fakeTransport({
      items_v2: [{ ...item({ id: 'x', amount: 5, updated_at: '2026-01-09T00:00:00.000Z' }) }]
    });
    await db.pendingOps.add({
      id: 'op-1',
      item_id: 'x',
      list_id: 'list-1',
      field: 'amount',
      kind: 'delta',
      value: 1,
      actor: null,
      created_at: '2026-01-09T00:00:01.000Z'
    });

    await createSyncEngine(f.transport).pull(defFor('items'));

    // Server says 5; our un-acked +1 must still show, or the tap looks lost.
    expect((await db.items.get('x'))?.amount).toBe(6);
  });

  it('pages past the row limit', async () => {
    const many = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => ({
      ...item({
        id: `id-${String(i).padStart(5, '0')}`,
        updated_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`
      })
    }));
    const f = fakeTransport({ items_v2: many });

    await createSyncEngine(f.transport).pull(defFor('items'));

    expect(await db.items.count()).toBe(PAGE_SIZE + 5);
  });

  it('advances the pulled cursor to the newest row seen', async () => {
    const f = fakeTransport({
      items_v2: [
        { ...item({ id: 'a', updated_at: '2026-01-01T00:00:00.000Z' }) },
        { ...item({ id: 'b', updated_at: '2026-01-04T00:00:00.000Z' }) }
      ]
    });
    await createSyncEngine(f.transport).pull(defFor('items'));

    expect((await getCursor('items')).pulled).toBe('2026-01-04T00:00:00.000Z');
  });

  it('writes append-only log rows without consulting the merge rule', async () => {
    const f = fakeTransport({
      logs_v2: [
        {
          id: 'log-1',
          list_id: 'l',
          actor_email: 'a@b.c',
          item_name: 'milk',
          action: 'created',
          payload: '',
          created_at: '2026-01-01T00:00:00.000Z'
        }
      ]
    });
    await createSyncEngine(f.transport).pull(defFor('logs'));

    expect(await db.logs.count()).toBe(1);
    expect((await getCursor('logs')).pulled).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('runOnce', () => {
  it('pushes rows before ops, so an op never precedes the item it references', async () => {
    const order: string[] = [];
    const f = fakeTransport();
    const spy: SyncTransport = {
      fetchSince: f.transport.fetchSince,
      async upsertRows(t, r) {
        order.push(`upsert:${t}`);
        return f.transport.upsertRows(t, r);
      },
      async insertOp(o) {
        order.push('op');
        return f.transport.insertOp(o);
      }
    };

    await db.items.add(item({ id: 'x' }));
    await db.pendingOps.add({
      id: 'op-1',
      item_id: 'x',
      list_id: 'list-1',
      field: 'amount',
      kind: 'set',
      value: 2,
      actor: null,
      created_at: '2026-01-01T00:00:00.000Z'
    });

    await createSyncEngine(spy).runOnce();

    expect(order.indexOf('upsert:items_v2')).toBeLessThan(order.indexOf('op'));
  });
});
