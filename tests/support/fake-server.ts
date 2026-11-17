import type {
  BagEntryRow,
  BagId,
  Command,
  CommandId,
  CommandLogRow,
  HouseholdId,
  HouseholdRow,
  Instant,
  ItemEventRow,
  ItemId,
  ItemRow,
  MemberRow,
  RejectionReason,
  Snapshot
} from '~~/types/pantry';
import type { HouseholdRows, HouseholdStore, PendingEdit, PulledRecipe, RecipeRecord } from '~~/types/sync';
import { applyCommand } from '~~/utils/pantry';
import { TransportRefused, type SyncTransport } from '~~/utils/sync-engine';
import type { ApplyResponse, CommandResult } from '~~/utils/sync-wire';

export const HOUSEHOLD = '00000000-0000-4000-8000-000000000001' as HouseholdId;
export const OTHER_HOUSEHOLD = '00000000-0000-4000-8000-000000000002' as HouseholdId;

type Fault = 'before' | 'after-commit';

/**
 * An in-memory household server. It applies commands with the TS reducer, the twin of
 * the SQL effects, and keeps the server's contract: one clock per household stamps
 * `seq` on every write, receipts make retries idempotent, and metadata is LWW.
 */
export class FakeServer {
  private clock = 0;
  household: HouseholdRow;
  members = new Map<string, MemberRow>();
  items = new Map<ItemId, ItemRow>();
  bag = new Map<BagId, BagEntryRow>();
  events = new Map<string, ItemEventRow>();
  log = new Map<CommandId, CommandLogRow>();
  rejected = new Map<CommandId, RejectionReason>();
  recipes = new Map<string, PulledRecipe>();
  /** Each actor's live household. */
  membership = new Map<string, HouseholdId | null>();
  batches: Command[][] = [];
  private faults: Fault[] = [];

  constructor() {
    this.household = {
      id: HOUSEHOLD,
      legacy_id: null,
      name: 'Home',
      seq: this.tick(),
      updated_at: '2026-01-01T00:00:00.000Z' as Instant,
      deleted_at: null
    };
  }

  private tick(): number {
    return ++this.clock;
  }

  /** The next apply call throws, before applying or after committing (a lost response). */
  failNextApply(fault: Fault): void {
    this.faults.push(fault);
  }

  snapshot(): Snapshot {
    const log = new Map([...this.log.values()].map((r) => [r.command_id, r.undone_by ? null : r.inverse] as const));
    return { items: new Map(this.items), bag: new Map(this.bag), log };
  }

  apply(actor: string, batch: readonly Command[]): ApplyResponse {
    const results: CommandResult[] = [];
    const touchedItems = new Set<ItemId>();
    const touchedBag = new Set<BagId>();
    const ids: CommandId[] = [];
    for (const command of batch) {
      ids.push(command.id);
      if (this.log.has(command.id)) {
        results.push({ id: command.id, status: 'accepted' });
        continue;
      }
      const prior = this.rejected.get(command.id);
      if (prior) {
        results.push({ id: command.id, status: 'rejected', reason: prior });
        continue;
      }
      if ((this.membership.get(actor) ?? HOUSEHOLD) !== command.household_id) {
        this.rejected.set(command.id, 'not_member');
        results.push({ id: command.id, status: 'rejected', reason: 'not_member' });
        continue;
      }
      const before = this.snapshot();
      const outcome = applyCommand(before, command);
      if ('reason' in outcome) {
        this.rejected.set(command.id, outcome.reason);
        results.push({ id: command.id, status: 'rejected', reason: outcome.reason });
        continue;
      }
      const touched: ItemId[] = [];
      for (const [id, item] of outcome.state.items) {
        if (before.items.get(id) === item) continue;
        const prev = this.items.get(id);
        const updated_at = prev?.updated_at ?? command.at;
        this.items.set(id, { ...item, updated_at, seq: this.tick() });
        touched.push(id);
        touchedItems.add(id);
      }
      for (const [id, entry] of outcome.state.bag) {
        if (before.bag.get(id) === entry) continue;
        this.bag.set(id, { ...entry, seq: this.tick() });
        touchedBag.add(id);
      }
      for (const event of outcome.events) this.events.set(event.id, { ...event, actor, seq: this.tick() });
      this.log.set(command.id, {
        command_id: command.id,
        household_id: command.household_id,
        kind: command.kind,
        actor,
        item_ids: touched,
        at: command.at,
        inverse: outcome.state.log.get(command.id) ?? null,
        undone_by: null,
        seq: this.tick()
      });
      if (command.kind === 'undo') {
        const target = this.log.get(command.target)!;
        this.log.set(target.command_id, { ...target, undone_by: command.id, seq: this.tick() });
      }
      results.push({ id: command.id, status: 'accepted' });
    }
    return {
      results,
      items: [...touchedItems].map((id) => this.items.get(id)!),
      bag: [...touchedBag].map((id) => this.bag.get(id)!),
      events: [...this.events.values()].filter((e) => e.command_id && ids.includes(e.command_id)),
      log: [...this.log.values()].filter((r) => ids.includes(r.command_id) || (r.undone_by && ids.includes(r.undone_by)))
    };
  }

  rows<S extends HouseholdStore>(store: S): HouseholdRows[S][] {
    const all: Record<HouseholdStore, unknown[]> = {
      households: [this.household],
      members: [...this.members.values()],
      items: [...this.items.values()],
      bag: [...this.bag.values()],
      events: [...this.events.values()],
      log: [...this.log.values()]
    };
    return all[store] as HouseholdRows[S][];
  }

  /** A metadata upsert: dropped when older than the stored row, as `stamp_lww` does. */
  pushSheet(sheet: PendingEdit): ItemRow | null {
    const row = this.items.get(sheet.id);
    if (!row || row.household_id !== sheet.household_id) throw new TransportRefused('new row violates row-level security');
    if (Date.parse(sheet.updated_at) < Date.parse(row.updated_at)) return null;
    const next: ItemRow = { ...row, ...sheet, seq: this.tick() };
    this.items.set(row.id, next);
    return next;
  }

  /** A transport bound to one signed-in actor, as a supabase-js client is. */
  transport(actor: string): SyncTransport & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      applyCommands: async (batch) => {
        calls.push(`apply:${batch.length}`);
        this.batches.push([...batch]);
        const fault = this.faults.shift();
        if (fault === 'before') throw new Error('network down');
        const response = this.apply(actor, batch);
        if (fault === 'after-commit') throw new Error('connection reset');
        return structuredClone(response);
      },
      pull: async (def, household, afterSeq, limit) => {
        calls.push(`pull:${def.store}`);
        const scoped = this.rows(def.store).filter((r) =>
          def.scope === 'id' ? (r as HouseholdRow).id === household : (r as { household_id: string }).household_id === household
        );
        return structuredClone(
          scoped.filter((r) => r.seq > afterSeq).sort((a, b) => a.seq - b.seq).slice(0, limit)
        ) as typeof scoped;
      },
      pushItemSheets: async (sheets) => {
        calls.push(`push:${sheets.length}`);
        const landed = sheets.map((s) => this.pushSheet(s));
        return structuredClone(landed.filter((r): r is ItemRow => r !== null));
      },
      myHousehold: async () => this.membership.get(actor) ?? HOUSEHOLD,
      pullRecipes: async (after, limit) => {
        const all = [...this.recipes.values()].sort(
          (a, b) => a.synced_at.localeCompare(b.synced_at) || a.id.localeCompare(b.id)
        );
        const later = all.filter(
          (r) => !after || r.synced_at > after.synced_at || (r.synced_at === after.synced_at && r.id > after.id)
        );
        return structuredClone(later.slice(0, limit));
      },
      pushRecipes: async (rows: readonly RecipeRecord[]) => {
        for (const r of rows) {
          this.recipes.set(r.id, { ...r, synced_at: new Date(Date.now() + this.tick()).toISOString() });
        }
      }
    };
  }
}
