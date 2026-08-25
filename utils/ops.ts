import type { ItemRecord, PendingOp, OpField, OpKind } from '~~/types/sync';

export function makeOp(input: {
  item_id: string;
  list_id: string;
  field: OpField;
  kind: OpKind;
  value: number;
  actor: string | null;
}): PendingOp {
  return { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...input };
}

/**
 * Replays unpushed local ops over a freshly pulled item row.
 *
 * The server's `amount` already reflects every op it has received. Ops still
 * sitting in `pendingOps` have not reached it, so they are applied on top —
 * otherwise a pull landing mid-flight would render the pre-tap value and the
 * user's tap would look lost.
 *
 * Ordering is by `created_at`, not array position, because a `set` must
 * discard the deltas that preceded it and keep the ones that followed.
 */
export function applyOps(item: ItemRecord, ops: PendingOp[]): ItemRecord {
  const mine = ops
    .filter((o) => o.item_id === item.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (mine.length === 0) return item;

  const next: ItemRecord = { ...item };
  for (const o of mine) {
    const field: OpField = o.field;
    next[field] = o.kind === 'delta' ? next[field] + o.value : o.value;
  }
  return next;
}
