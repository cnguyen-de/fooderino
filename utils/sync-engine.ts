import type { Command, CommandId, HouseholdId, Instant, ItemRow } from '~~/types/pantry';
import type {
  HouseholdRows,
  HouseholdStore,
  PendingEdit,
  PulledRecipe,
  QueuedCommand,
  RecipeCursor,
  RecipeRecord,
  RejectionNotice,
  SyncStateRow
} from '~~/types/sync';
import type { FooderinoDb } from '~~/utils/db';
import { SYNC_STATE_KEY } from '~~/utils/db';
import {
  COMMAND_BATCH,
  HOUSEHOLD_STORES,
  HOUSEHOLD_TABLES,
  PAGE_SIZE,
  type HouseholdTableDef
} from '~~/utils/sync-registry';
import { getSyncState } from '~~/utils/sync-state';
import { remoteWins } from '~~/utils/sync-merge';
import type { ApplyResponse, CommandResult } from '~~/utils/sync-wire';

/**
 * The engine's only view of the network. Every method parses what it receives into
 * domain rows, and throws on any transport or server error.
 */
export interface SyncTransport {
  /** Rejections are results, not errors. */
  applyCommands(batch: readonly Command[]): Promise<ApplyResponse>;
  pull<S extends HouseholdStore>(
    table: HouseholdTableDef<S>,
    household: HouseholdId,
    afterSeq: number,
    limit: number
  ): Promise<HouseholdRows[S][]>;
  /** Resolves with the rows that landed. A sheet older than the stored row is dropped by the server. */
  pushItemSheets(sheets: readonly PendingEdit[]): Promise<ItemRow[]>;
  /** The household this user is a live member of, or null. */
  myHousehold(): Promise<HouseholdId | null>;
  pullRecipes(after: RecipeCursor | null, limit: number): Promise<PulledRecipe[]>;
  pushRecipes(rows: readonly RecipeRecord[]): Promise<void>;
}

/** The server refused the request itself. Sending it again unchanged cannot succeed. */
export class TransportRefused extends Error {
  override name = 'TransportRefused';
}

/** Household data cannot be reset while commands for the old household wait to sync. */
export class PendingCommandsError extends Error {
  override name = 'PendingCommandsError';
  constructor(readonly pending: number) {
    super(`${pending} change(s) have not synced yet`);
  }
}

/** `push` sends the outboxes; `full` also pulls. */
export type SyncMode = 'push' | 'full';

export interface SyncEngineOptions {
  db: FooderinoDb;
  transport: SyncTransport;
  onRejection?: (notices: RejectionNotice[]) => void;
}

const nowInstant = () => new Date().toISOString() as Instant;

function toCommand({ created_seq: _, ...command }: QueuedCommand): Command {
  return command as Command;
}

export function createSyncEngine({ db, transport, onRejection = () => {} }: SyncEngineOptions) {
  const householdTables = () => HOUSEHOLD_STORES.map((s) => db.table(s));

  /** Never lets an older version of a row replace a newer one, whatever order rows arrive in. */
  async function putNewer<S extends HouseholdStore>(def: HouseholdTableDef<S>, rows: readonly HouseholdRows[S][]) {
    if (rows.length === 0) return;
    const table = db.table<HouseholdRows[S], string>(def.store);
    const local = await table.bulkGet(rows.map(def.key));
    await table.bulkPut(rows.filter((row, i) => !local[i] || local[i]!.seq <= row.seq));
  }

  const tableDef = <S extends HouseholdStore>(store: S) =>
    HOUSEHOLD_TABLES.find((d) => d.store === store) as unknown as HouseholdTableDef<S>;

  async function updateState(fn: (s: SyncStateRow) => SyncStateRow): Promise<void> {
    await db.transaction('rw', db.syncState, async () => {
      await db.syncState.put({ ...fn(await getSyncState(db)), key: SYNC_STATE_KEY });
    });
  }

  /** Writes a response's rows and retires the commands it answered, in one transaction. */
  async function settle(batch: readonly QueuedCommand[], response: ApplyResponse): Promise<number> {
    const byId = new Map<CommandId, QueuedCommand>(batch.map((c) => [c.id, c]));
    // Results come back in batch order; a malformed command echoes an id that matches nothing.
    const answered = response.results.flatMap((result: CommandResult, i) => {
      const command = byId.get(result.id) ?? batch[i];
      return command ? [{ command, result }] : [];
    });
    const notices: RejectionNotice[] = [];

    await db.transaction('rw', [db.items, db.bag, db.events, db.log, db.commands, db.edits], async () => {
      await putNewer(tableDef('items'), response.items);
      await putNewer(tableDef('bag'), response.bag);
      await putNewer(tableDef('events'), response.events);
      await putNewer(tableDef('log'), response.log);
      await db.commands.bulkDelete(answered.map((a) => a.command.id));
      for (const { command, result } of answered) {
        if (result.status !== 'rejected') continue;
        // Metadata for an item that never came to exist could never be pushed.
        if (command.kind === 'create') await db.edits.delete(command.item_id);
        const name = (await db.items.get(command.item_id))?.name ?? (command.kind === 'create' ? command.item.name : null);
        notices.push({
          command: command.id,
          kind: command.kind,
          item_id: command.item_id,
          item_name: name,
          reason: result.reason
        });
      }
    });

    if (notices.length > 0) onRejection(notices);
    return answered.length;
  }

  /** Sends the outbox oldest first. A transport error leaves the current batch queued. */
  async function drain(): Promise<void> {
    for (;;) {
      const batch = await db.commands.orderBy('created_seq').limit(COMMAND_BATCH).toArray();
      if (batch.length === 0) return;
      const response = await transport.applyCommands(batch.map(toCommand));
      if ((await settle(batch, response)) === 0) throw new Error('apply_commands answered none of the batch');
    }
  }

  /** Sends rows one at a time, dropping those the server refuses, so one bad row cannot block the rest. */
  async function pushEach<T, R>(rows: readonly T[], push: (rows: readonly T[]) => Promise<readonly R[]>) {
    try {
      return { landed: [...(await push(rows))], refused: [] as T[] };
    } catch (e) {
      if (!(e instanceof TransportRefused)) throw e;
    }
    const landed: R[] = [];
    const refused: T[] = [];
    for (const row of rows) {
      try {
        landed.push(...(await push([row])));
      } catch (e) {
        if (!(e instanceof TransportRefused)) throw e;
        refused.push(row);
      }
    }
    return { landed, refused };
  }

  /** Metadata goes after commands: an item exists on the server only once its `create` landed. */
  async function pushEdits(): Promise<void> {
    const [edits, commands] = await db.transaction('r', db.edits, db.commands, () =>
      Promise.all([db.edits.toArray(), db.commands.toArray()])
    );
    const unborn = new Set(commands.filter((c) => c.kind === 'create').map((c) => c.item_id));
    const ready = edits.filter((e) => !unborn.has(e.id));
    if (ready.length === 0) return;

    const { landed, refused } = await pushEach(ready, (rows) => transport.pushItemSheets(rows));
    if (refused.length > 0) console.warn(`[sync] the server refused ${refused.length} item edit(s); dropped them`);

    await db.transaction('rw', db.items, db.edits, async () => {
      await putNewer(tableDef('items'), landed);
      // An edit saved again while this push was in flight stays queued.
      for (const sent of ready) {
        if ((await db.edits.get(sent.id))?.updated_at === sent.updated_at) await db.edits.delete(sent.id);
      }
    });
  }

  async function pullHousehold(): Promise<void> {
    const { household_id: household, cursors } = await getSyncState(db);
    if (!household) {
      await updateState((s) => ({ ...s, hydrated_at: s.hydrated_at ?? nowInstant() }));
      return;
    }

    const fetched = new Map<HouseholdStore, { seq: number }[]>();
    for (const def of HOUSEHOLD_TABLES) {
      const rows: { seq: number }[] = [];
      let after = cursors[def.store] ?? 0;
      for (;;) {
        const page = await transport.pull(def as HouseholdTableDef, household, after, PAGE_SIZE);
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
        after = page[page.length - 1]!.seq;
      }
      fetched.set(def.store, rows);
    }

    // One transaction for every table, so the view never sees half a pull.
    await db.transaction('rw', [...householdTables(), db.edits, db.syncState], async () => {
      const state = await getSyncState(db);
      if (state.household_id !== household) return;
      const next = { ...state.cursors };
      for (const def of HOUSEHOLD_TABLES) {
        const rows = fetched.get(def.store)!;
        await putNewer(def as HouseholdTableDef, rows as HouseholdRows[HouseholdStore][]);
        for (const row of rows) next[def.store] = Math.max(next[def.store] ?? 0, row.seq);
      }
      const items = fetched.get('items') as ItemRow[];
      const edits = await db.edits.bulkGet(items.map((i) => i.id));
      const settled = items.filter((row, i) => {
        const edit = edits[i];
        return edit && Date.parse(row.updated_at) >= Date.parse(edit.updated_at);
      });
      await db.edits.bulkDelete(settled.map((row) => row.id));
      await db.syncState.put({ ...state, cursors: next, hydrated_at: state.hydrated_at ?? nowInstant() });
    });
  }

  async function pushRecipes(): Promise<void> {
    const { pushed } = (await getSyncState(db)).recipes;
    const dirty = (await db.recipes.toArray()).filter((r) => !pushed || r.updated_at > pushed);
    if (dirty.length === 0) return;
    const { refused } = await pushEach(dirty, async (rows) => {
      await transport.pushRecipes(rows);
      return rows;
    });
    if (refused.length > 0) console.warn(`[sync] the server refused ${refused.length} recipe(s); skipped them`);
    const max = dirty.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), pushed ?? '');
    await updateState((s) => ({ ...s, recipes: { ...s.recipes, pushed: max } }));
  }

  async function pullRecipes(): Promise<void> {
    let after = (await getSyncState(db)).recipes.pulled;
    for (;;) {
      const page = await transport.pullRecipes(after, PAGE_SIZE);
      if (page.length === 0) return;
      const last = page[page.length - 1]!;
      after = { synced_at: last.synced_at, id: last.id };
      const cursor = after;
      await db.transaction('rw', db.recipes, db.syncState, async () => {
        for (const { synced_at: _, ...recipe } of page) {
          if (remoteWins(await db.recipes.get(recipe.id), recipe)) await db.recipes.put(recipe);
        }
        await updateState((s) => ({ ...s, recipes: { ...s.recipes, pulled: cursor } }));
      });
      if (page.length < PAGE_SIZE) return;
    }
  }

  /** Every phase runs even when an earlier one failed; the first error is rethrown. */
  async function runOnce(mode: SyncMode): Promise<void> {
    const errors: unknown[] = [];
    const attempt = async (phase: () => Promise<void>) => {
      try {
        await phase();
      } catch (e) {
        errors.push(e);
      }
    };
    await attempt(drain);
    await attempt(pushEdits);
    await attempt(pushRecipes);
    if (mode === 'full') {
      await attempt(pullHousehold);
      await attempt(pullRecipes);
    }
    if (errors.length > 0) throw errors[0];
  }

  async function reset(next: HouseholdId | null): Promise<void> {
    if ((await db.commands.count()) > 0) await drain().catch(() => {});
    const pending = await db.commands.count();
    if (pending > 0) throw new PendingCommandsError(pending);
    // Best effort: an edit that cannot land now belongs to a household this device is leaving.
    await pushEdits().catch(() => {});
    await db.transaction('rw', [...householdTables(), db.edits, db.syncState], async () => {
      await Promise.all([...householdTables(), db.edits].map((t) => t.clear()));
      const state = await getSyncState(db);
      await db.syncState.put({ ...state, household_id: next, cursors: {}, hydrated_at: null });
    });
  }

  async function checkMembership(): Promise<'same' | 'changed'> {
    const next = await transport.myHousehold();
    if ((await getSyncState(db)).household_id === next) return 'same';
    await reset(next);
    return 'changed';
  }

  // Every operation that writes synced state runs one at a time, in request order.
  let tail: Promise<unknown> = Promise.resolve();
  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => {});
    return run;
  }

  let queued: { mode: SyncMode; done: Promise<void> } | null = null;

  /** Requests that arrive while one is queued join it, so a burst of triggers costs one run. */
  function sync(mode: SyncMode = 'full'): Promise<void> {
    if (queued) {
      if (mode === 'full') queued.mode = 'full';
      return queued.done;
    }
    const entry: { mode: SyncMode; done: Promise<void> } = { mode, done: Promise.resolve() };
    entry.done = exclusive(() => {
      queued = null;
      return runOnce(entry.mode);
    });
    queued = entry;
    return entry.done;
  }

  return {
    sync,
    /** Sends both outboxes and resolves when they are as empty as the network allows. */
    flush: () => sync('push'),
    /** Compares the server's membership with the device's household, and resets on a change. */
    syncMembership: () => exclusive(checkMembership),
    /** Wipes household data and cursors, keeping recipes. Drains first; refuses while commands remain. */
    resetHouseholdData: (next: HouseholdId | null) => exclusive(() => reset(next))
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
