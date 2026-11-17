import type {
  BagId,
  Command,
  CommandId,
  CommandKind,
  HouseholdId,
  Instant,
  Item,
  ItemId,
  ItemMetadata,
  ItemSheet,
  LocalDate,
  Snapshot,
  Stock,
  Tag,
  Unit
} from '~~/types/pantry';
import type { PendingEdit, QueuedCommand, RejectionNotice } from '~~/types/sync';
import type { FooderinoDb } from '~~/utils/db';
import { applyCommand, newId, normalizeAliases, normalizeTags, resolveItem } from '~~/utils/pantry';
import { projectPantry, readDeviceRows } from '~~/utils/pantry-projection';

/** What `undo` needs to reverse one gesture. Opaque to the UI. */
export interface UndoHandle {
  readonly commands: readonly { readonly id: CommandId; readonly item_id: ItemId }[];
  /** The metadata sheet to restore, when the gesture changed one. */
  readonly sheet: ItemSheet | null;
}

export interface ItemDraft {
  name: string;
  aliases?: string[];
  tags?: Tag[];
  unit?: Unit;
  default_amount?: number;
  shelf_life_days?: number | null;
  amount?: number;
  to_buy?: number;
  best_before?: LocalDate | null;
}

/** Any subset of an item's fields. Metadata goes out as an LWW sheet, `amount` and `best_before` as `set`, `to_buy` as `want`. */
export type ItemEdit = Partial<ItemMetadata & Stock>;

export interface UnpackLine {
  bag_id: BagId;
  best_before?: LocalDate;
  /** A place tag added to the item if it has none by that name. */
  place?: string;
}

export interface PantryOps {
  /** Resolves with the new item's id, or null when the draft was refused. */
  createItem(draft: ItemDraft): Promise<ItemId | null>;
  /** Throws a RangeError when the metadata is invalid, such as a blank name; the edit sheet validates first. */
  editItem(id: ItemId, edit: ItemEdit): Promise<UndoHandle | null>;
  /** Defaults to 1. */
  useUp(id: ItemId, qty?: number): Promise<UndoHandle | null>;
  /** Like `useUp`, logged as waste. Defaults to 1. */
  bin(id: ItemId, qty?: number): Promise<UndoHandle | null>;
  /** Sets the listed amount to `qty`. Without one, adds the item's default quantity to the list. */
  addToShopping(id: ItemId, qty?: number): Promise<UndoHandle | null>;
  /** Moves `qty` (default: the listed amount, else the default amount) into the bag. */
  tick(id: ItemId, qty?: number): Promise<UndoHandle | null>;
  cancelBag(bagId: BagId): Promise<UndoHandle | null>;
  unpack(lines: readonly UnpackLine[]): Promise<UndoHandle | null>;
  dismiss(id: ItemId): Promise<UndoHandle | null>;
  merge(src: ItemId, into: ItemId): Promise<UndoHandle | null>;
  deleteItem(id: ItemId): Promise<UndoHandle | null>;
  undo(handle: UndoHandle): Promise<UndoHandle | null>;
}

export interface PantryOpsOptions {
  db: FooderinoDb;
  /** Called after every write that queued something, to wake the sync engine. */
  notify?: () => void;
  /** Called with commands the local state already refuses; they are not queued. */
  onRejection?: (notices: RejectionNotice[]) => void;
  now?: () => Date;
}

const UNDOABLE: ReadonlySet<CommandKind> = new Set(['use', 'want', 'set', 'tick', 'unpack']);
const META_KEYS = ['name', 'aliases', 'tags', 'unit', 'default_amount', 'shelf_life_days'] as const;

/** Everything one gesture reads: the projected state, and the stamps a sheet edit has to beat. */
interface Ctx {
  state: Snapshot;
  household: HouseholdId;
  at: Instant;
  /** The newest `updated_at` the server or the outbox already holds for each item. */
  stamps: ReadonlyMap<ItemId, number>;
}

interface Plan {
  commands: Command[];
  sheet?: PendingEdit;
  /** The sheet an undo of this gesture restores. */
  restore?: ItemSheet;
}

function sheetOf(item: Item): ItemSheet {
  const { id, household_id, name, aliases, tags, unit, default_amount, shelf_life_days, deleted_at } = item;
  return { id, household_id, name, aliases, tags, unit, default_amount, shelf_life_days, deleted_at };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function validSheet(s: ItemSheet): boolean {
  return (
    s.name !== '' &&
    (s.unit === 'count' || s.unit === 'gram') &&
    Number.isFinite(s.default_amount) &&
    s.default_amount >= 0 &&
    (s.shelf_life_days === null || (Number.isInteger(s.shelf_life_days) && s.shelf_life_days >= 0))
  );
}

/** A sheet must outrank what the server holds, even when this device's clock runs behind. */
function stampFor(ctx: Ctx, id: ItemId): Instant {
  const floor = (ctx.stamps.get(id) ?? 0) + 1;
  return new Date(Math.max(Date.parse(ctx.at), floor)).toISOString() as Instant;
}

function defaultQty(item: Item): number {
  return item.default_amount > 0 ? item.default_amount : 1;
}

export function createPantryOps({
  db,
  notify = () => {},
  onRejection = () => {},
  now = () => new Date()
}: PantryOpsOptions): PantryOps {
  /**
   * One gesture, one transaction: read the device, plan against the projected state,
   * keep the commands that state accepts, and queue them with any sheet edit. Reading
   * inside the transaction serializes rapid taps, so each plans on the one before it.
   */
  async function execute(plan: (ctx: Ctx) => Plan | null): Promise<{ handle: UndoHandle | null; queued: number }> {
    const notices: RejectionNotice[] = [];
    const outcome = await db.transaction('rw', [db.items, db.bag, db.log, db.commands, db.edits, db.syncState], async () => {
      const rows = await readDeviceRows(db, { events: false });
      const household = rows.household_id;
      if (!household) throw new Error('This device holds no household yet');

      const stamps = new Map<ItemId, number>();
      const stamp = (id: ItemId, at: string) => stamps.set(id, Math.max(stamps.get(id) ?? 0, Date.parse(at)));
      for (const row of rows.items) stamp(row.id, row.updated_at);
      for (const edit of rows.edits) stamp(edit.id, edit.updated_at);
      for (const c of rows.commands) if (c.kind === 'create') stamp(c.item_id, c.at);

      const { snapshot } = projectPantry(rows);
      const ctx: Ctx = { state: snapshot, household, at: now().toISOString() as Instant, stamps };
      const p = plan(ctx);
      if (!p) return { handle: null, queued: 0 };

      let state = snapshot;
      let seq = rows.commands.at(-1)?.created_seq ?? 0;
      const queued: QueuedCommand[] = [];
      for (const command of p.commands) {
        const result = applyCommand(state, command);
        if ('reason' in result) {
          const item = resolveItem(state.items, command.item_id) ?? state.items.get(command.item_id);
          notices.push({
            command: command.id,
            kind: command.kind,
            item_id: command.item_id,
            item_name: item?.name ?? (command.kind === 'create' ? command.item.name : null),
            reason: result.reason
          });
          continue;
        }
        state = result.state;
        queued.push({ ...command, created_seq: ++seq });
      }
      await db.commands.bulkAdd(queued);
      if (p.sheet) await db.edits.put(p.sheet);

      const undoable = queued.filter((c) => UNDOABLE.has(c.kind)).map((c) => ({ id: c.id, item_id: c.item_id }));
      const restore = p.sheet && p.restore ? p.restore : null;
      const handle = undoable.length > 0 || restore ? { commands: undoable, sheet: restore } : null;
      return { handle, queued: queued.length + (p.sheet ? 1 : 0) };
    });
    if (notices.length > 0) onRejection(notices);
    if (outcome.queued > 0) notify();
    return outcome;
  }

  const run = async (plan: (ctx: Ctx) => Plan | null) => (await execute(plan)).handle;

  const base = (ctx: Ctx, item_id: ItemId) => ({
    id: newId<CommandId>(),
    household_id: ctx.household,
    item_id,
    at: ctx.at
  });

  /** The live item an id stands for, following merges. */
  const live = (ctx: Ctx, id: ItemId) => resolveItem(ctx.state.items, id);

  function sheetPlan(ctx: Ctx, item: Item, patch: Partial<ItemSheet>): Pick<Plan, 'sheet' | 'restore'> {
    const before = sheetOf(item);
    const after = { ...before, ...patch };
    if (same(before, after)) return {};
    return { sheet: { ...after, updated_at: stampFor(ctx, item.id) }, restore: before };
  }

  const one = (command: (ctx: Ctx) => Command | null) =>
    run((ctx) => {
      const c = command(ctx);
      return c ? { commands: [c] } : null;
    });

  return {
    async createItem(draft) {
      const id = newId<ItemId>();
      const { queued } = await execute((ctx) => {
        const name = draft.name.trim().replace(/\s+/g, ' ');
        const start: Partial<Stock> = {};
        if (draft.amount !== undefined) start.amount = draft.amount;
        if (draft.to_buy !== undefined) start.to_buy = draft.to_buy;
        if (draft.best_before !== undefined) start.best_before = draft.best_before;
        const item: ItemMetadata = {
          name,
          aliases: normalizeAliases(name, draft.aliases ?? []),
          tags: normalizeTags(draft.tags ?? []),
          unit: draft.unit ?? 'count',
          default_amount: draft.default_amount ?? 1,
          shelf_life_days: draft.shelf_life_days ?? null
        };
        return { commands: [{ ...base(ctx, id), kind: 'create', item, start }] };
      });
      return queued > 0 ? id : null;
    },

    editItem(id, edit) {
      return run((ctx) => {
        const item = live(ctx, id);
        if (!item) return null;
        const commands: Command[] = [];
        const set: { amount?: number; best_before?: LocalDate | null } = {};
        if (edit.amount !== undefined && edit.amount !== item.amount) set.amount = edit.amount;
        if (edit.best_before !== undefined && edit.best_before !== item.best_before) set.best_before = edit.best_before;
        if (Object.keys(set).length > 0) commands.push({ ...base(ctx, item.id), kind: 'set', ...set });
        if (edit.to_buy !== undefined && edit.to_buy !== item.to_buy) {
          commands.push({ ...base(ctx, item.id), kind: 'want', qty: edit.to_buy });
        }

        const patch: Partial<ItemSheet> = {};
        for (const key of META_KEYS) if (edit[key] !== undefined) Object.assign(patch, { [key]: edit[key] });
        if (patch.name !== undefined) patch.name = patch.name.trim().replace(/\s+/g, ' ');
        const name = patch.name ?? item.name;
        if (patch.aliases !== undefined || patch.name !== undefined) {
          patch.aliases = normalizeAliases(name, patch.aliases ?? item.aliases);
        }
        if (patch.tags !== undefined) patch.tags = normalizeTags(patch.tags);
        const sheet = sheetPlan(ctx, item, patch);
        if (sheet.sheet && !validSheet(sheet.sheet)) throw new RangeError(`Invalid edit for item ${id}`);
        return { commands, ...sheet };
      });
    },

    useUp: (id, qty = 1) => one((ctx) => ({ ...base(ctx, id), kind: 'use', qty, waste: false })),

    bin: (id, qty = 1) => one((ctx) => ({ ...base(ctx, id), kind: 'use', qty, waste: true })),

    addToShopping: (id, qty) =>
      one((ctx) => {
        const item = live(ctx, id);
        if (!item) return { ...base(ctx, id), kind: 'want', qty: qty ?? 1 };
        const target = qty ?? item.to_buy + defaultQty(item);
        return target === item.to_buy ? null : { ...base(ctx, item.id), kind: 'want', qty: target };
      }),

    tick: (id, qty) =>
      one((ctx) => {
        const item = live(ctx, id);
        const q = qty ?? (item ? (item.to_buy > 0 ? item.to_buy : defaultQty(item)) : 1);
        const from_list = Math.min(q, item?.to_buy ?? 0);
        return { ...base(ctx, item?.id ?? id), kind: 'tick', bag_id: newId<BagId>(), qty: q, from_list };
      }),

    cancelBag: (bagId) =>
      one((ctx) => {
        const entry = ctx.state.bag.get(bagId);
        return entry ? { ...base(ctx, entry.item_id), kind: 'cancel_bag', bag_id: bagId } : null;
      }),

    unpack: (lines) =>
      run((ctx) => ({
        commands: lines.flatMap((line): Command[] => {
          const entry = ctx.state.bag.get(line.bag_id);
          if (!entry) return [];
          const command: Command = { ...base(ctx, entry.item_id), kind: 'unpack', bag_id: line.bag_id };
          if (line.best_before !== undefined) command.best_before = line.best_before;
          if (line.place !== undefined) command.place = line.place;
          return [command];
        })
      })),

    dismiss: (id) => one((ctx) => ({ ...base(ctx, id), kind: 'dismiss' })),

    merge: (src, into) => one((ctx) => ({ ...base(ctx, src), kind: 'merge', into })),

    deleteItem: (id) =>
      run((ctx) => {
        const item = live(ctx, id);
        return item ? { commands: [], ...sheetPlan(ctx, item, { deleted_at: ctx.at }) } : null;
      }),

    undo: (handle) =>
      run((ctx) => {
        const commands: Command[] = [...handle.commands]
          .reverse()
          .map(({ id, item_id }) => ({ ...base(ctx, item_id), kind: 'undo', target: id }));
        if (!handle.sheet) return { commands };
        const current = ctx.state.items.get(handle.sheet.id);
        if (!current) return { commands };
        const sheet: PendingEdit = { ...handle.sheet, updated_at: stampFor(ctx, current.id) };
        return { commands, sheet };
      })
  };
}
