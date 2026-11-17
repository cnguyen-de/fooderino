import { db, notifyLocalChange } from '~~/utils/legacy-db';
import { makeOp } from '~~/utils/ops';
import type { ItemRecord, OpField } from '~~/types/sync';

/**
 * Every counter value crossing this boundary is forced to a finite number.
 *
 * The create/edit drawers bind their inputs to strings, so an amount arrives
 * as '3'. Postgres used to coerce that on the way in; IndexedDB stores exactly
 * what it is handed, and `'3' + 1` is `'31'` — which would then be pushed as
 * an op and corrupt the server's counter as well as the local one.
 */
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildItem(input: {
  list_id: string;
  name: string;
  location: string;
  store: string;
  amount_type: string;
  default_amount: number;
  created_by: string | null;
}): ItemRecord {
  return {
    id: crypto.randomUUID(),
    ...input,
    default_amount: num(input.default_amount),
    // Both counters open at zero. The caller queues `set` ops for the real
    // opening values, so the server's trigger stays the sole writer of these.
    amount: 0,
    amount_to_purchase: 0,
    updated_at: new Date().toISOString(),
    deleted_at: null
  };
}

async function queue(
  item: ItemRecord,
  field: OpField,
  kind: 'delta' | 'set',
  value: number,
  actor: string | null
): Promise<void> {
  const amount = num(value);
  const op = makeOp({ item_id: item.id, list_id: item.list_id, field, kind, value: amount, actor });

  await db.transaction('rw', db.items, db.pendingOps, async () => {
    // Read the stored row rather than trusting `item`. Callers hold a snapshot
    // handed to them by liveQuery, which refreshes asynchronously, so a rapid
    // double-tap passes the same stale object twice. Compounding off the
    // snapshot would render the second tap as no change at all until the next
    // pull corrected it.
    const row = await db.items.get(item.id);

    // No row means the caller is holding something that outlived the record —
    // most likely a shopping basket restored from localStorage across the
    // cutover. `item_ops.item_id` is a NOT NULL FK, so such an op is rejected
    // at push, and the outbox drain stops at the first throw: one orphan would
    // wedge every pending op on this device. Drop it instead.
    if (!row) return;

    const next = kind === 'delta' ? num(row[field]) + amount : amount;

    // Only the counter changes. `updated_at` deliberately stays put: it is
    // the LWW cursor for the *other* fields, and bumping it here would make
    // a pure counter change masquerade as an edit to name/store/location.
    await db.items.update(item.id, { [field]: next });
    await db.pendingOps.add(op);
  });

  notifyLocalChange('items', item.id);
}

export function queueDelta(item: ItemRecord, field: OpField, delta: number, actor: string | null) {
  return queue(item, field, 'delta', delta, actor);
}

export function queueSet(item: ItemRecord, field: OpField, value: number, actor: string | null) {
  return queue(item, field, 'set', value, actor);
}
