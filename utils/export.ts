import type { ListRecord, ItemRecord, RecipeRecord, UserSettingsRecord, SyncRecord, OpField } from '~~/types/sync';

export const EXPORT_VERSION = 1;

export interface ExportPayload {
  version: number;
  lists: ListRecord[];
  items: ItemRecord[];
  recipes: RecipeRecord[];
  user_settings: UserSettingsRecord[];
}

export interface ImportSummaryItem {
  label: string;
  total: number;
  newCount: number;
  skipCount: number;
}

export type Collection = 'lists' | 'items' | 'recipes' | 'user_settings';
const COLLECTIONS: Collection[] = ['lists', 'items', 'recipes', 'user_settings'];

const alive = <T extends SyncRecord>(rows: T[]): T[] => rows.filter((r) => r.deleted_at === null);

/** Tombstones are dropped: an export is a snapshot, not a change log. */
export function buildExportPayload(
  lists: ListRecord[],
  items: ItemRecord[],
  recipes: RecipeRecord[],
  settings: UserSettingsRecord[]
): ExportPayload {
  return {
    version: EXPORT_VERSION,
    lists: alive(lists),
    items: alive(items),
    recipes: alive(recipes),
    user_settings: alive(settings)
  };
}

const hasId = (r: unknown): boolean =>
  typeof r === 'object' && r !== null && typeof (r as { id?: unknown }).id === 'string';

export function isValidPayload(data: unknown): data is ExportPayload {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.version !== 'number' || d.version > EXPORT_VERSION) return false;
  return COLLECTIONS.every((key) => Array.isArray(d[key]) && (d[key] as unknown[]).every(hasId));
}

export interface ImportContext {
  userId: string;
  /** Stamped onto every imported row as `updated_at`. */
  now: string;
  /** Every id held locally, tombstones included. */
  existing: Record<Collection, Set<string>>;
  /** Lists on this device that are not deleted. */
  liveListIds: Set<string>;
  /** Whether this account already has a settings row. */
  hasSettings: boolean;
}

export interface ImportPlan {
  lists: ListRecord[];
  items: ItemRecord[];
  recipes: RecipeRecord[];
  user_settings: UserSettingsRecord[];
  /** Opening counter values, to be queued as `set` ops. */
  counters: { item_id: string; field: OpField; value: number }[];
  summary: ImportSummaryItem[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Decides what an import adds. Additive only: an id already on this device —
 * live or tombstoned — is skipped, so a double import is harmless and a stale
 * export cannot roll back newer data or resurrect a deletion.
 *
 * Beyond that, every rule here exists so that an imported row can actually
 * reach the server. A row the server would reject fails the whole batch it is
 * pushed in, and the engine retries that batch forever.
 *
 * - `updated_at` is restamped, or rows older than the push cursor never push.
 * - Lists, recipes and settings owned by another account are skipped: RLS
 *   rejects them.
 * - Items need a list that is here or arriving with this import (foreign key).
 * - Item counters are zeroed and returned as `set` ops, because item pushes
 *   omit them and the op trigger is their only writer.
 * - At most one settings row, and none if the account already has one
 *   (`user_settings.user_id` is unique).
 */
export function planImport(payload: ExportPayload, ctx: ImportContext): ImportPlan {
  const fresh = <T extends { id: string }>(key: Collection, rows: T[]) =>
    rows.filter((r) => !ctx.existing[key].has(r.id));
  const restamp = <T extends SyncRecord>(r: T): T => ({ ...r, updated_at: ctx.now, deleted_at: null });

  const lists = fresh('lists', payload.lists)
    .filter((l) => l.owner === ctx.userId)
    .map(restamp);

  const reachable = new Set([...ctx.liveListIds, ...lists.map((l) => l.id)]);
  const counters: ImportPlan['counters'] = [];
  const items = fresh('items', payload.items)
    .filter((i) => reachable.has(i.list_id))
    .map((i) => {
      for (const field of ['amount', 'amount_to_purchase'] as const) {
        const value = num(i[field]);
        if (value) counters.push({ item_id: i.id, field, value });
      }
      return { ...restamp(i), amount: 0, amount_to_purchase: 0 };
    });

  const recipes = fresh('recipes', payload.recipes)
    .filter((r) => r.user_id === ctx.userId)
    .map(restamp);

  const user_settings = ctx.hasSettings
    ? []
    : fresh('user_settings', payload.user_settings)
        .filter((s) => s.user_id === ctx.userId)
        .slice(0, 1)
        .map(restamp);

  const added: Record<Collection, number> = {
    lists: lists.length,
    items: items.length,
    recipes: recipes.length,
    user_settings: user_settings.length
  };
  const summary = COLLECTIONS.map((key) => {
    const total = payload[key].length;
    return { label: key, total, newCount: added[key], skipCount: total - added[key] };
  });

  return { lists, items, recipes, user_settings, counters, summary };
}
