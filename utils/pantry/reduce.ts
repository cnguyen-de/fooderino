import type {
  BagEntry,
  BagId,
  Command,
  CommandId,
  EventId,
  HouseholdId,
  Inverse,
  Item,
  ItemEvent,
  ItemId,
  Rejection,
  RejectionReason,
  Snapshot,
  Stock
} from '~~/types/pantry';
import { isLocalDate, minDate } from './dates';
import { normalizeAliases, normalizeTags } from './ids';
import { absorb, resolveItem } from './merge';

export interface Applied {
  state: Snapshot;
  events: ItemEvent[];
}

export interface Replayed extends Applied {
  rejected: Rejection[];
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventDraft = DistributiveOmit<
  ItemEvent,
  'id' | 'household_id' | 'command_id' | 'occurred_at' | 'actor' | 'origin'
>;

interface Effect {
  items?: Item[];
  bag?: BagEntry;
  event?: EventDraft;
  inverse: Inverse | null;
  undoes?: CommandId;
}

type Outcome = Effect | RejectionReason;

const isQty = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** A command emits at most one event, so the event takes the command's id. Replays then mint identical events. */
const eventIdOf = (id: CommandId) => id as string as EventId;

const stockOf = (item: Item): Stock => ({ amount: item.amount, to_buy: item.to_buy, best_before: item.best_before });

function liveItem(state: Snapshot, id: ItemId, household: HouseholdId): Item | undefined {
  const item = resolveItem(state.items, id);
  return item?.household_id === household ? item : undefined;
}

function openEntry(state: Snapshot, cmd: Command, bagId: BagId): { entry: BagEntry; item: Item } | RejectionReason {
  const entry = state.bag.get(bagId);
  if (!entry || entry.household_id !== cmd.household_id) return 'not_found';
  if (entry.state !== 'open') return 'bag_closed';
  const item = liveItem(state, entry.item_id, cmd.household_id);
  if (!item) return 'not_found';
  return { entry, item };
}

function cancelBag(state: Snapshot, cmd: Command, bagId: BagId): Outcome {
  const found = openEntry(state, cmd, bagId);
  if (typeof found === 'string') return found;
  const { entry, item } = found;
  const next = { ...item, to_buy: item.to_buy + entry.from_list };
  return {
    items: [next],
    bag: { ...entry, state: 'cancelled', closed_by_command: cmd.id },
    event: {
      kind: 'correction',
      item_id: item.id,
      before: stockOf(item),
      after: stockOf(next),
      reverses: entry.purchase_event
    },
    inverse: null
  };
}

function unpack(state: Snapshot, cmd: Command & { kind: 'unpack' }): Outcome {
  const found = openEntry(state, cmd, cmd.bag_id);
  if (typeof found === 'string') return found;
  const { entry, item } = found;
  if (cmd.best_before !== undefined && !isLocalDate(cmd.best_before)) return 'invalid';
  if (cmd.place !== undefined && cmd.place.trim() === '') return 'invalid';
  const wasEmpty = item.amount === 0;
  // An empty item's old date belonged to stock that is gone, so it never survives a restock.
  const kept = wasEmpty ? null : item.best_before;
  const best_before = cmd.best_before === undefined ? kept : (minDate(kept, cmd.best_before) ?? cmd.best_before);
  const tags = cmd.place === undefined ? item.tags : normalizeTags([...item.tags, { kind: 'place', name: cmd.place }]);
  return {
    items: [{ ...item, amount: item.amount + entry.qty, best_before, tags }],
    bag: { ...entry, state: 'unpacked', closed_by_command: cmd.id },
    inverse: { kind: 'unstock', item_id: item.id, qty: entry.qty }
  };
}

function undo(state: Snapshot, cmd: Command & { kind: 'undo' }): Outcome {
  const inverse = state.log.get(cmd.target);
  if (!inverse) return 'cannot_undo';
  if (inverse.kind === 'cancel_bag') {
    const outcome = cancelBag(state, cmd, inverse.bag_id);
    return typeof outcome === 'string' ? outcome : { ...outcome, undoes: cmd.target };
  }
  const item = liveItem(state, inverse.item_id, cmd.household_id);
  if (!item) return 'cannot_undo';
  const done = (next: Item, reverses?: EventId): Effect => ({
    items: [next],
    event: reverses
      ? { kind: 'correction', item_id: item.id, before: stockOf(item), after: stockOf(next), reverses }
      : undefined,
    inverse: null,
    undoes: cmd.target
  });
  switch (inverse.kind) {
    case 'restock':
      return done({ ...item, amount: item.amount + inverse.qty }, inverse.reverses);
    case 'restore_to_buy':
      return done({ ...item, to_buy: inverse.to_buy });
    case 'restore_stock':
      return done({ ...item, ...inverse.before }, inverse.reverses);
    case 'unstock':
      if (item.amount < inverse.qty) return 'cannot_undo';
      return done({ ...item, amount: item.amount - inverse.qty });
  }
}

function effectOf(state: Snapshot, cmd: Command): Outcome {
  if (cmd.kind === 'create') {
    const { item: meta, start } = cmd;
    const name = meta.name.trim().replace(/\s+/g, ' ');
    const valid =
      !state.items.has(cmd.item_id) &&
      name !== '' &&
      (meta.unit === 'count' || meta.unit === 'gram') &&
      isCount(meta.default_amount) &&
      (meta.shelf_life_days === null || (Number.isInteger(meta.shelf_life_days) && meta.shelf_life_days >= 0)) &&
      (start.amount === undefined || isCount(start.amount)) &&
      (start.to_buy === undefined || isCount(start.to_buy)) &&
      (start.best_before == null || isLocalDate(start.best_before));
    if (!valid) return 'invalid';
    const item: Item = {
      id: cmd.item_id,
      household_id: cmd.household_id,
      name,
      aliases: normalizeAliases(name, meta.aliases),
      tags: normalizeTags(meta.tags),
      unit: meta.unit,
      default_amount: meta.default_amount,
      shelf_life_days: meta.shelf_life_days,
      amount: start.amount ?? 0,
      to_buy: start.to_buy ?? 0,
      best_before: start.best_before ?? null,
      merged_into: null,
      deleted_at: null
    };
    return { items: [item], inverse: null };
  }

  if (cmd.kind === 'undo') return undo(state, cmd);
  if (cmd.kind === 'cancel_bag') return cancelBag(state, cmd, cmd.bag_id);
  if (cmd.kind === 'unpack') return unpack(state, cmd);

  const item = liveItem(state, cmd.item_id, cmd.household_id);
  if (!item) return 'not_found';
  const eventId = eventIdOf(cmd.id);

  switch (cmd.kind) {
    case 'use': {
      if (!isQty(cmd.qty)) return 'invalid';
      if (item.amount < cmd.qty) return 'insufficient_stock';
      const after = item.amount - cmd.qty;
      return {
        items: [{ ...item, amount: after }],
        event: { kind: cmd.waste ? 'waste' : 'consume', item_id: item.id, qty: cmd.qty, after },
        inverse: { kind: 'restock', item_id: item.id, qty: cmd.qty, reverses: eventId }
      };
    }
    case 'want':
      if (!isCount(cmd.qty)) return 'invalid';
      return {
        items: [{ ...item, to_buy: cmd.qty }],
        inverse: { kind: 'restore_to_buy', item_id: item.id, to_buy: item.to_buy }
      };
    case 'tick':
      if (!isQty(cmd.qty) || !isCount(cmd.from_list) || cmd.from_list > cmd.qty) return 'invalid';
      if (cmd.from_list > item.to_buy || state.bag.has(cmd.bag_id)) return 'invalid';
      return {
        items: [{ ...item, to_buy: item.to_buy - cmd.from_list }],
        bag: {
          id: cmd.bag_id,
          household_id: cmd.household_id,
          item_id: item.id,
          qty: cmd.qty,
          from_list: cmd.from_list,
          bought_at: cmd.at,
          purchase_event: eventId,
          state: 'open',
          closed_by_command: null
        },
        event: { kind: 'purchase', item_id: item.id, qty: cmd.qty },
        inverse: { kind: 'cancel_bag', bag_id: cmd.bag_id }
      };
    case 'set': {
      const touched: Partial<Pick<Stock, 'amount' | 'best_before'>> = {};
      if (cmd.amount !== undefined) touched.amount = cmd.amount;
      if (cmd.best_before !== undefined) touched.best_before = cmd.best_before;
      if (Object.keys(touched).length === 0) return 'invalid';
      if (touched.amount !== undefined && !isCount(touched.amount)) return 'invalid';
      if (touched.best_before != null && !isLocalDate(touched.best_before)) return 'invalid';
      const next = { ...item, ...touched };
      const before: typeof touched = {};
      if ('amount' in touched) before.amount = item.amount;
      if ('best_before' in touched) before.best_before = item.best_before;
      return {
        items: [next],
        event: { kind: 'correction', item_id: item.id, before: stockOf(item), after: stockOf(next), reverses: null },
        inverse: { kind: 'restore_stock', item_id: item.id, before, reverses: eventId }
      };
    }
    case 'dismiss':
      return { event: { kind: 'dismiss', item_id: item.id }, inverse: null };
    case 'merge': {
      const into = liveItem(state, cmd.into, cmd.household_id);
      if (!into) return 'not_found';
      if (into.id === item.id || into.unit !== item.unit) return 'invalid';
      return {
        items: [absorb(into, item), { ...item, merged_into: into.id, amount: 0, to_buy: 0 }],
        inverse: null
      };
    }
  }
}

function commit(state: Snapshot, cmd: Command, effect: Effect): Applied {
  const items = new Map(state.items);
  for (const item of effect.items ?? []) items.set(item.id, item);
  const bag = effect.bag ? new Map(state.bag).set(effect.bag.id, effect.bag) : state.bag;
  const log = new Map(state.log).set(cmd.id, effect.inverse);
  if (effect.undoes) log.set(effect.undoes, null);
  const events: ItemEvent[] = effect.event
    ? [
        {
          ...effect.event,
          id: eventIdOf(cmd.id),
          household_id: cmd.household_id,
          command_id: cmd.id,
          occurred_at: cmd.at,
          actor: null,
          origin: 'live'
        }
      ]
    : [];
  return { state: { items, bag, log }, events };
}

/** The TS twin of the server's `apply_commands` effects. Re-applying an accepted command id is a no-op. */
export function applyCommand(state: Snapshot, cmd: Command): Applied | Rejection {
  if (state.log.has(cmd.id)) return { state, events: [] };
  const outcome = effectOf(state, cmd);
  if (typeof outcome === 'string') return { command: cmd.id, reason: outcome };
  return commit(state, cmd, outcome);
}

/** Folds the outbox over confirmed state, skipping commands the server already accepted or rejected. */
export function replayPending(
  confirmed: Snapshot,
  pending: readonly Command[],
  receipts: ReadonlySet<CommandId>
): Replayed {
  let state = confirmed;
  const events: ItemEvent[] = [];
  const rejected: Rejection[] = [];
  for (const cmd of pending) {
    if (receipts.has(cmd.id)) continue;
    const result = applyCommand(state, cmd);
    if ('reason' in result) {
      rejected.push(result);
    } else {
      state = result.state;
      events.push(...result.events);
    }
  }
  return { state, events, rejected };
}
