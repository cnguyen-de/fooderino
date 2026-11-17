import type { Item, LocalDate, Tag } from '~~/types/pantry';
import type { RecipeRecord } from '~~/types/sync';
import { db, type FooderinoDb } from '~~/utils/db';
import { isLive, isLocalDate, normName } from '~~/utils/pantry';
import type { ItemDraft } from '~~/utils/pantry-ops';
import { projectPantry, readDeviceRows } from '~~/utils/pantry-projection';

export const EXPORT_VERSION = 2;

/** An item as exported: its metadata, and its counters as plain state. */
export interface ExportedItem {
  name: string;
  aliases: string[];
  tags: Tag[];
  unit: 'count' | 'gram';
  default_amount: number;
  shelf_life_days: number | null;
  amount: number;
  to_buy: number;
  best_before: LocalDate | null;
}

export interface ExportPayload {
  version: typeof EXPORT_VERSION;
  exported_at: string;
  household: { name: string } | null;
  items: ExportedItem[];
  recipes: RecipeRecord[];
}

/** Tombstones and merged-away items are dropped: an export is a snapshot, not a change log. */
export function buildExportPayload(input: {
  household: { name: string } | null;
  items: readonly Item[];
  recipes: readonly RecipeRecord[];
  now: string;
}): ExportPayload {
  return {
    version: EXPORT_VERSION,
    exported_at: input.now,
    household: input.household,
    items: input.items.filter(isLive).map((i) => ({
      name: i.name,
      aliases: i.aliases,
      tags: i.tags,
      unit: i.unit,
      default_amount: i.default_amount,
      shelf_life_days: i.shelf_life_days,
      amount: i.amount,
      to_buy: i.to_buy,
      best_before: i.best_before
    })),
    recipes: input.recipes.filter((r) => r.deleted_at === null)
  };
}

/** What the device shows right now, pending changes included. */
export async function exportDevice(target: FooderinoDb = db): Promise<ExportPayload> {
  const rows = await readDeviceRows(target, { events: false });
  const [household, recipes] = await Promise.all([
    rows.household_id ? target.households.get(rows.household_id) : undefined,
    target.recipes.toArray()
  ]);
  return buildExportPayload({
    household: household ? { name: household.name } : null,
    items: [...projectPantry(rows).snapshot.items.values()],
    recipes,
    now: new Date().toISOString()
  });
}

/** Any supported export, reduced to what an import creates. */
export interface ImportPayload {
  items: ItemDraft[];
  recipes: RecipeRecord[];
}

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const hasId = (r: unknown): r is RecipeRecord => isObj(r) && typeof r.id === 'string';

function tagsOf(v: unknown): Tag[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((t) =>
    isObj(t) && (t.kind === 'place' || t.kind === 'store' || t.kind === 'other') && text(t.name)
      ? [{ kind: t.kind, name: text(t.name) }]
      : []
  );
}

/** A v2 item. */
function draftV2(raw: Json): ItemDraft | null {
  const name = text(raw.name);
  if (!name) return null;
  const days = raw.shelf_life_days;
  return {
    name,
    aliases: Array.isArray(raw.aliases) ? raw.aliases.map(text).filter(Boolean) : [],
    tags: tagsOf(raw.tags),
    unit: raw.unit === 'gram' ? 'gram' : 'count',
    default_amount: count(raw.default_amount ?? 1),
    shelf_life_days: typeof days === 'number' && Number.isInteger(days) && days >= 0 ? days : null,
    amount: count(raw.amount),
    to_buy: count(raw.to_buy),
    best_before: isLocalDate(raw.best_before) ? raw.best_before : null
  };
}

/** A v1 (list-era) item: `location` becomes a place tag and `store` a store tag. */
function draftV1(raw: Json): ItemDraft | null {
  const name = text(raw.name);
  if (!name || raw.deleted_at) return null;
  const tags: Tag[] = [];
  if (text(raw.location)) tags.push({ kind: 'place', name: text(raw.location) });
  if (text(raw.store)) tags.push({ kind: 'store', name: text(raw.store) });
  return {
    name,
    tags,
    unit: raw.amount_type === 'gram' ? 'gram' : 'count',
    default_amount: count(raw.default_amount ?? 1),
    amount: count(raw.amount),
    to_buy: count(raw.amount_to_purchase)
  };
}

export function parseImport(data: unknown): ImportPayload | null {
  if (!isObj(data) || !Array.isArray(data.items) || !Array.isArray(data.recipes)) return null;
  const draft = data.version === 2 ? draftV2 : data.version === 1 ? draftV1 : null;
  if (!draft || !data.recipes.every(hasId)) return null;
  return {
    items: data.items.flatMap((raw) => (isObj(raw) ? [draft(raw)].filter((d): d is ItemDraft => d !== null) : [])),
    recipes: data.recipes as RecipeRecord[]
  };
}

export interface ImportSummaryItem {
  label: 'items' | 'recipes';
  total: number;
  newCount: number;
  skipCount: number;
}

export interface ImportPlan {
  items: ItemDraft[];
  recipes: RecipeRecord[];
  summary: ImportSummaryItem[];
}

export interface ImportContext {
  userId: string;
  /** Stamped onto every imported recipe as `updated_at`, so it pushes. */
  now: string;
  /** The household's items as the device shows them. */
  items: readonly Item[];
  /** Every recipe id on this device, tombstones included. */
  recipeIds: ReadonlySet<string>;
}

/**
 * Decides what an import adds. Additive only: an item whose name or alias matches a
 * live item already here is skipped, as is a recipe id already here, so a double
 * import is harmless and a stale export never rolls back newer data. Recipes owned
 * by another account are skipped because the server refuses them.
 */
export function planImport(payload: ImportPayload, ctx: ImportContext): ImportPlan {
  const known = new Set(ctx.items.filter(isLive).flatMap((i) => [i.name, ...i.aliases].map(normName)));
  const items = payload.items.filter((d) => {
    const keys = [d.name, ...(d.aliases ?? [])].map(normName);
    if (keys.some((k) => known.has(k))) return false;
    for (const k of keys) known.add(k);
    return true;
  });
  const recipes = payload.recipes
    .filter((r) => r.user_id === ctx.userId && !ctx.recipeIds.has(r.id))
    .map((r) => ({ ...r, updated_at: ctx.now, deleted_at: null }));

  const summary: ImportSummaryItem[] = [
    { label: 'items', total: payload.items.length, newCount: items.length, skipCount: payload.items.length - items.length },
    {
      label: 'recipes',
      total: payload.recipes.length,
      newCount: recipes.length,
      skipCount: payload.recipes.length - recipes.length
    }
  ];
  return { items, recipes, summary };
}

/** The import context for this device. */
export async function importContext(userId: string, target: FooderinoDb = db): Promise<ImportContext> {
  const [rows, recipeIds] = await Promise.all([
    readDeviceRows(target, { events: false }),
    target.recipes.toCollection().primaryKeys()
  ]);
  return {
    userId,
    now: new Date().toISOString(),
    items: [...projectPantry(rows).snapshot.items.values()],
    recipeIds: new Set(recipeIds as string[])
  };
}

/** Writes imported recipes; items go through `createItem`, one `create` command each. */
export async function addImportedRecipes(recipes: readonly RecipeRecord[], target: FooderinoDb = db): Promise<void> {
  await target.recipes.bulkAdd([...recipes]);
}
