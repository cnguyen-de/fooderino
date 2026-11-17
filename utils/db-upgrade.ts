import type { Command, CommandId, HouseholdId, Instant, ItemId } from '~~/types/pantry';
import type { ItemRecord, PendingOp } from '~~/types/sync';

export interface ConvertedOps {
  commands: Command[];
  /** Ops that could not be turned into a command without guessing. */
  discarded: number;
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

function instantOf(s: string): Instant | null {
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : (new Date(ms).toISOString() as Instant);
}

/**
 * Turns the v2 outbox into v3 commands. A list's id is its household's id. The stored
 * row already has every pending op folded in, so a group that is not purely decrements
 * becomes one absolute command carrying the stored value, which replays to the same
 * state however many ops it replaces.
 */
export function convertPendingOps(ops: readonly PendingOp[], items: readonly ItemRecord[]): ConvertedOps {
  const stored = new Map(items.map((i) => [i.id, i]));
  const groups = new Map<string, PendingOp[]>();
  for (const op of [...ops].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key = `${op.item_id}:${op.field}`;
    groups.set(key, [...(groups.get(key) ?? []), op]);
  }

  const out: { at: Instant; command: Command }[] = [];
  let discarded = 0;
  for (const group of groups.values()) {
    const first = group[0]!;
    const last = group[group.length - 1]!;
    const item = stored.get(first.item_id);
    const at = instantOf(last.created_at);
    if (!item || !at || group.some((op) => op.list_id !== item.list_id || !instantOf(op.created_at))) {
      discarded += group.length;
      continue;
    }
    const base = { household_id: item.list_id as HouseholdId, item_id: item.id as ItemId };

    const decrements = group.every((op) => op.kind === 'delta' && Number.isFinite(op.value) && op.value < 0);
    if (first.field === 'amount' && decrements) {
      for (const op of group) {
        const opAt = instantOf(op.created_at)!;
        out.push({ at: opAt, command: { ...base, id: op.id as CommandId, at: opAt, kind: 'use', qty: -op.value, waste: false } });
      }
    } else if (first.field === 'amount' && isCount(item.amount)) {
      out.push({ at, command: { ...base, id: last.id as CommandId, at, kind: 'set', amount: item.amount } });
    } else if (first.field === 'amount_to_purchase' && isCount(item.amount_to_purchase)) {
      out.push({ at, command: { ...base, id: last.id as CommandId, at, kind: 'want', qty: item.amount_to_purchase } });
    } else {
      discarded += group.length;
    }
  }

  out.sort((a, b) => a.at.localeCompare(b.at));
  return { commands: out.map((o) => o.command), discarded };
}
