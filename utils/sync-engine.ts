import { db } from '~~/utils/db';
import { SYNC_TABLES, tableFor, type SyncTableDef } from '~~/utils/sync-registry';
import { remoteWins } from '~~/utils/sync-merge';
import { applyOps } from '~~/utils/ops';
import { getCursor, setCursor } from '~~/utils/sync-state';
import type { ItemRecord, PendingOp, SyncRecord } from '~~/types/sync';

export type Row = Record<string, unknown>;

/**
 * The engine's only view of the network. Keeping it this narrow means every
 * merge rule below is testable against an in-memory fake, and swapping the
 * backend never touches this file.
 */
export interface SyncTransport {
  fetchSince(
    table: string,
    cursorField: string,
    since: string | null,
    offset: number,
    limit: number
  ): Promise<Row[]>;
  upsertRows(table: string, rows: Row[]): Promise<void>;
  /** Resolves 'duplicate' when the row already exists; throws on real errors. */
  insertOp(op: PendingOp): Promise<'inserted' | 'duplicate'>;
}

export const PAGE_SIZE = 1000;

/** Tables whose rows belong to a list, and so become visible on joining one. */
const LIST_SCOPED = new Set(['lists', 'list_members', 'items', 'logs']);

function strip(row: Row, omit: string[]): Row {
  if (omit.length === 0) return { ...row };
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (!omit.includes(k)) out[k] = v;
  }
  return out;
}

export function createSyncEngine(transport: SyncTransport) {
  async function pushDirty(def: SyncTableDef): Promise<void> {
    const { pushed } = await getCursor(def.local);
    const all = (await tableFor(def.local).toArray()) as Row[];
    const dirty = all.filter((r) => !pushed || String(r[def.cursor]) > pushed);
    if (dirty.length === 0) return;

    await transport.upsertRows(
      def.remote,
      dirty.map((r) => strip(r, def.pushOmit))
    );

    let max = pushed;
    for (const r of dirty) {
      const v = String(r[def.cursor]);
      if (!max || v > max) max = v;
    }
    await setCursor(def.local, { pushed: max });
  }

  /**
   * Drains the op queue oldest-first. A throw aborts the loop with the
   * remaining ops still queued, so a dropped connection costs nothing.
   * A 'duplicate' means an earlier attempt did land and the server already
   * folded it — deleting locally is correct, not data loss.
   */
  async function pushOutbox(): Promise<void> {
    const ops = await db.pendingOps.orderBy('created_at').toArray();
    for (const op of ops) {
      await transport.insertOp(op);
      await db.pendingOps.delete(op.id);
    }
  }

  async function applyRemote(def: SyncTableDef, row: Row): Promise<void> {
    const id = row.id as string | undefined;
    if (!id) return;
    const table = tableFor(def.local);

    if (def.appendOnly) {
      await table.put(row);
      return;
    }

    const local = (await table.get(id)) as SyncRecord | undefined;
    if (!remoteWins(local, row as unknown as { updated_at: string })) return;

    if (def.local === 'items') {
      const pending = await db.pendingOps.where('item_id').equals(id).toArray();
      await table.put(applyOps(row as unknown as ItemRecord, pending));
      return;
    }
    await table.put(row);
  }

  async function pull(def: SyncTableDef): Promise<void> {
    const { pulled } = await getCursor(def.local);
    let max = pulled;

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const rows = await transport.fetchSince(def.remote, def.cursor, pulled, offset, PAGE_SIZE);
      for (const row of rows) {
        await applyRemote(def, row);
        const v = String(row[def.cursor]);
        if (!max || v > max) max = v;
      }
      if (rows.length < PAGE_SIZE) break;
    }

    await setCursor(def.local, { pulled: max });
  }

  /**
   * Dirty rows first, then ops, then pulls. Ops carry a foreign key to their
   * item, so an item created while offline must reach the server before any
   * op that references it. Pushing rows first is safe because item pushes
   * omit the counter columns and therefore cannot mask a pending delta.
   */
  async function runOnce(): Promise<void> {
    for (const def of SYNC_TABLES) await pushDirty(def);
    await pushOutbox();
    for (const def of SYNC_TABLES) await pull(def);
    await backfillJoinedLists();
  }

  /**
   * Joining a list makes rows visible that were last written long before this
   * device's pull cursor, so an incremental pull brings in the new membership
   * row and nothing else. A live membership whose list is missing locally is
   * the tell: re-pull the list-scoped tables from the beginning. LWW makes
   * re-applying rows already held a no-op.
   */
  async function backfillJoinedLists(): Promise<void> {
    const known = new Set(await db.lists.toCollection().primaryKeys());
    const members = await db.list_members.toArray();
    const orphaned = members.some((m) => m.deleted_at === null && !known.has(m.list_id));
    if (!orphaned) return;

    for (const def of SYNC_TABLES) {
      if (!LIST_SCOPED.has(def.local)) continue;
      await setCursor(def.local, { pulled: null });
      await pull(def);
    }
  }

  return { pushDirty, pushOutbox, pull, applyRemote, runOnce };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
