import { RECIPE_KINDS, type Quantity, type RecipeId, type RecipeKind, type RecipeRow } from '~~/types/cook';
import type { HouseholdId, Instant, Item, ItemId, LocalDate, Tag } from '~~/types/pantry';
import type { Season } from '~~/types/season';
import type { PendingSheet } from '~~/types/sync';
import { db, type FooderinoDb } from '~~/utils/db';
import { legacyIngredients } from '~~/utils/db-upgrade';
import { isLive, isLocalDate, newId, normName, resolveItem, tidy } from '~~/utils/pantry';
import type { ItemDraft } from '~~/utils/pantry-ops';
import { projectPantry, readDeviceRows } from '~~/utils/pantry-projection';
import { isSeason } from '~~/utils/seasons';
import { overlaySheets, pendingSheets } from '~~/utils/sheets';

export const EXPORT_VERSION = 3;

/** An item as exported: its metadata, and its counters as plain state. */
export interface ExportedItem {
  name: string;
  aliases: string[];
  tags: Tag[];
  unit: 'count' | 'gram';
  default_amount: number;
  shelf_life_days: number | null;
  season: Season | null;
  amount: number;
  to_buy: number;
  best_before: LocalDate | null;
}

export interface ExportedRecipe {
  name: string;
  kind: RecipeKind;
  ingredients: { name: string; qty: Quantity | null }[];
  instructions: string;
}

export interface ExportPayload {
  version: typeof EXPORT_VERSION;
  exported_at: string;
  household: { name: string } | null;
  items: ExportedItem[];
  recipes: ExportedRecipe[];
}

type LiveRecipe = Omit<RecipeRow, 'seq'>;

/** Tombstones and merged-away items are dropped: an export is a snapshot, not a change log. */
export function buildExportPayload(input: {
  household: { name: string } | null;
  items: readonly Item[];
  recipes: readonly LiveRecipe[];
  now: string;
}): ExportPayload {
  const items = new Map(input.items.map((i): [ItemId, Item] => [i.id, i]));
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
      season: i.season,
      amount: i.amount,
      to_buy: i.to_buy,
      best_before: i.best_before
    })),
    recipes: input.recipes
      .filter((r) => r.deleted_at === null)
      .map((r) => ({
        name: r.name,
        kind: r.kind,
        ingredients: r.ingredients.map((i) => ({
          name: (i.item_id && resolveItem(items, i.item_id)?.name) || i.name,
          qty: i.qty
        })),
        instructions: r.instructions
      }))
  };
}

/** What the device shows right now, pending changes included. */
export async function exportDevice(target: FooderinoDb = db): Promise<ExportPayload> {
  const rows = await readDeviceRows(target, { events: false });
  const household = rows.household_id ? await target.households.get(rows.household_id) : undefined;
  return buildExportPayload({
    household: household ? { name: household.name } : null,
    items: [...projectPantry(rows).snapshot.items.values()],
    recipes: await liveRecipes(target),
    now: new Date().toISOString()
  });
}

async function liveRecipes(target: FooderinoDb): Promise<LiveRecipe[]> {
  const [confirmed, pending] = await target.transaction('r', target.recipes, target.edits, () =>
    Promise.all([target.recipes.toArray(), pendingSheets(target, 'recipes')])
  );
  return [...overlaySheets(confirmed, pending).values()];
}

/** Any supported export, reduced to what an import creates. */
export interface ImportPayload {
  items: ItemDraft[];
  recipes: ExportedRecipe[];
}

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

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
    season: isSeason(raw.season) ? { from: raw.season.from, to: raw.season.to } : null,
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

function quantityOf(v: unknown): Quantity | null {
  if (!isObj(v) || typeof v.amount !== 'number' || !Number.isFinite(v.amount) || v.amount <= 0) return null;
  return v.unit === 'count' || v.unit === 'gram' ? { amount: v.amount, unit: v.unit } : null;
}

function recipeV3(raw: Json): ExportedRecipe | null {
  const name = tidy(text(raw.name));
  if (!name) return null;
  const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  return {
    name,
    kind: RECIPE_KINDS.find((k) => k === raw.kind) ?? 'dish',
    ingredients: ingredients.flatMap((i) => {
      const ingredient = isObj(i) ? tidy(text(i.name)) : '';
      return ingredient ? [{ name: ingredient, qty: quantityOf((i as Json).qty) }] : [];
    }),
    instructions: text(raw.instructions)
  };
}

function recipeLegacy(raw: Json): ExportedRecipe | null {
  const name = tidy(text(raw.name));
  if (!name || raw.saved !== true || raw.deleted_at) return null;
  return {
    name,
    kind: 'dish',
    ingredients: legacyIngredients(raw.ingredients).map(({ name, qty }) => ({ name, qty })),
    instructions: [text(raw.description), text(raw.instructions)].filter(Boolean).join('\n\n')
  };
}

export function parseImport(data: unknown): ImportPayload | null {
  if (!isObj(data) || !Array.isArray(data.items) || !Array.isArray(data.recipes)) return null;
  const draft = data.version === 3 || data.version === 2 ? draftV2 : data.version === 1 ? draftV1 : null;
  if (!draft) return null;
  const recipe = data.version === 3 ? recipeV3 : recipeLegacy;
  const parsed = <T>(rows: unknown[], parse: (raw: Json) => T | null): T[] =>
    rows.flatMap((raw) => {
      const row = isObj(raw) ? parse(raw) : null;
      return row === null ? [] : [row];
    });
  return { items: parsed(data.items, draft), recipes: parsed(data.recipes, recipe) };
}

export interface ImportSummaryItem {
  label: 'items' | 'recipes';
  total: number;
  newCount: number;
  skipCount: number;
}

export interface ImportPlan {
  items: ItemDraft[];
  recipes: PendingSheet<'recipes'>[];
  summary: ImportSummaryItem[];
}

export interface ImportContext {
  household: HouseholdId;
  now: Instant;
  /** The household's items as the device shows them. */
  items: readonly Item[];
  recipes: readonly LiveRecipe[];
}

export function planImport(payload: ImportPayload, ctx: ImportContext): ImportPlan {
  const known = new Set(ctx.items.filter(isLive).flatMap((i) => [i.name, ...i.aliases].map(normName)));
  const items = payload.items.filter((d) => {
    const keys = [d.name, ...(d.aliases ?? [])].map(normName);
    if (keys.some((k) => known.has(k))) return false;
    for (const k of keys) known.add(k);
    return true;
  });
  const named = new Set(ctx.recipes.filter((r) => r.deleted_at === null).map((r) => normName(r.name)));
  const recipes = payload.recipes.flatMap((r): PendingSheet<'recipes'>[] => {
    const key = normName(r.name);
    if (named.has(key)) return [];
    named.add(key);
    return [
      {
        store: 'recipes',
        id: newId<RecipeId>(),
        household_id: ctx.household,
        name: r.name,
        kind: r.kind,
        ingredients: r.ingredients.map((i) => ({ ...i, item_id: null })),
        instructions: r.instructions,
        deleted_at: null,
        updated_at: ctx.now
      }
    ];
  });

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
export async function importContext(target: FooderinoDb = db): Promise<ImportContext> {
  const [rows, recipes] = await Promise.all([readDeviceRows(target, { events: false }), liveRecipes(target)]);
  if (!rows.household_id) throw new Error('Create or join a household before importing');
  return {
    household: rows.household_id,
    now: new Date().toISOString() as Instant,
    items: [...projectPantry(rows).snapshot.items.values()],
    recipes
  };
}

export async function addImportedRecipes(recipes: readonly PendingSheet<'recipes'>[], target: FooderinoDb = db): Promise<void> {
  await target.edits.bulkPut([...recipes]);
}
