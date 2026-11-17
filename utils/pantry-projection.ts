import type {
  BagEntryRow,
  BagId,
  CommandId,
  CommandLogRow,
  HouseholdId,
  Inverse,
  Item,
  ItemEvent,
  ItemEventRow,
  ItemId,
  ItemRow,
  Rejection,
  Snapshot
} from '~~/types/pantry';
import type { PendingEdit, QueuedCommand } from '~~/types/sync';
import type { FooderinoDb } from '~~/utils/db';
import { replayPending } from '~~/utils/pantry';
import { readSyncState } from '~~/utils/sync-state';

/** One consistent read of the device: confirmed household state and both outboxes. */
export interface DeviceRows {
  household_id: HouseholdId | null;
  hydrated: boolean;
  items: readonly ItemRow[];
  bag: readonly BagEntryRow[];
  log: readonly CommandLogRow[];
  commands: readonly QueuedCommand[];
  edits: readonly PendingEdit[];
  /** Ops leave this out: they need state, not history. */
  events?: readonly ItemEventRow[];
}

export interface Projection {
  /** Confirmed state, with pending commands replayed and pending metadata on top. */
  snapshot: Snapshot;
  /** Confirmed history plus the events pending commands will emit. */
  events: ItemEvent[];
  /** Pending commands the replay refused. The server decides; these only stay invisible meanwhile. */
  rejected: Rejection[];
}

/** An edit applies until the server holds a sheet at least as new: by then it either landed or lost. */
function overlayEdits(items: Map<ItemId, Item>, edits: readonly PendingEdit[], confirmed: ReadonlyMap<ItemId, ItemRow>) {
  for (const { updated_at, ...sheet } of edits) {
    const item = items.get(sheet.id);
    const row = confirmed.get(sheet.id);
    if (!item || item.household_id !== sheet.household_id) continue;
    if (row && Date.parse(row.updated_at) >= Date.parse(updated_at)) continue;
    items.set(sheet.id, { ...item, ...sheet });
  }
}

export function projectPantry(rows: DeviceRows): Projection {
  const confirmedItems = new Map(rows.items.map((i): [ItemId, ItemRow] => [i.id, i]));
  const log = new Map(rows.log.map((r): [CommandId, Inverse | null] => [r.command_id, r.undone_by ? null : r.inverse]));
  const confirmed: Snapshot = {
    items: confirmedItems,
    bag: new Map(rows.bag.map((b): [BagId, BagEntryRow] => [b.id, b])),
    log
  };
  const pending = [...rows.commands].sort((a, b) => a.created_seq - b.created_seq);
  const replayed = replayPending(confirmed, pending, new Set(log.keys()));

  const items = new Map(replayed.state.items);
  overlayEdits(items, rows.edits, confirmedItems);

  return {
    snapshot: { ...replayed.state, items },
    events: [...(rows.events ?? []), ...replayed.events],
    rejected: replayed.rejected
  };
}

/**
 * Reads every store the projection needs in one read transaction. IndexedDB orders it after
 * any overlapping write, so a sync that retires a command and writes its effect is seen whole
 * or not at all, and replay never counts that command twice. Inside a write transaction that
 * covers these stores, it joins that transaction.
 */
export function readDeviceRows(db: FooderinoDb, { events }: { events: boolean }): Promise<DeviceRows> {
  const tables = [db.syncState, db.items, db.bag, db.log, db.commands, db.edits, ...(events ? [db.events] : [])];
  return db.transaction('r', tables, async () => {
    const [sync, items, bag, log, commands, edits, history] = await Promise.all([
      readSyncState(db),
      db.items.toArray(),
      db.bag.toArray(),
      db.log.toArray(),
      db.commands.orderBy('created_seq').toArray(),
      db.edits.toArray(),
      events ? db.events.toArray() : undefined
    ]);
    return {
      household_id: sync.household_id,
      hydrated: sync.hydrated_at !== null,
      items,
      bag,
      log,
      commands,
      edits,
      ...(history ? { events: history } : {})
    };
  });
}
