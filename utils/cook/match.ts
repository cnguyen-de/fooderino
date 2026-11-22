import { amountField, formatAmount, parseAmount, roundAmount, snapUse, tidy, type Hit } from '~~/utils/pantry';
import type { CommandId, ItemId, PantryItem, Unit } from '~~/types/pantry';
import type { Ingredient, Quantity } from '~~/types/cook';

export type PantryHit = Pick<Hit, 'match' | 'via'> & { item: PantryItem };

/** What the cook domain reads from the pantry. `byId` follows merges to the live item. */
export interface PantryLookup {
  byId(id: ItemId): PantryItem | undefined;
  search(name: string): readonly PantryHit[];
}

export type IngredientMatch =
  | { kind: 'item'; item: PantryItem; via: 'link' | 'name' }
  | { kind: 'several'; choices: PantryItem[] }
  | { kind: 'none' };

export type StockLevel = 'enough' | 'short' | 'out' | 'untracked';

export interface IngredientStatus {
  ingredient: Ingredient;
  match: IngredientMatch;
  stock: StockLevel;
}

export function matchIngredient(ingredient: Ingredient, lookup: PantryLookup): IngredientMatch {
  const linked = ingredient.item_id ? lookup.byId(ingredient.item_id) : undefined;
  if (linked) return { kind: 'item', item: linked, via: 'link' };
  const choices = [
    ...new Map(
      lookup
        .search(ingredient.name)
        .filter((hit) => hit.match === 'exact' && hit.via !== 'tag')
        .map((hit) => [hit.item.id, hit.item])
    ).values()
  ];
  if (choices.length === 1) return { kind: 'item', item: choices[0]!, via: 'name' };
  if (choices.length > 1) return { kind: 'several', choices };
  return { kind: 'none' };
}

const RANK: Record<StockLevel, number> = { enough: 0, short: 1, out: 2, untracked: 3 };

function levelOf(ingredient: Ingredient, item: PantryItem): StockLevel {
  if (item.amount <= 0) return 'out';
  const qty = ingredient.qty;
  return qty && qty.unit === item.unit && snapUse(qty.amount, item.amount, item.unit) > item.amount
    ? 'short'
    : 'enough';
}

export function ingredientStatus(ingredient: Ingredient, lookup: PantryLookup): IngredientStatus {
  const match = matchIngredient(ingredient, lookup);
  const items = match.kind === 'item' ? [match.item] : match.kind === 'several' ? match.choices : [];
  const stock = items
    .map((item) => levelOf(ingredient, item))
    .reduce<StockLevel>((best, level) => (RANK[level] < RANK[best] ? level : best), 'untracked');
  return { ingredient, match, stock };
}

export interface CookLine {
  readonly status: IngredientStatus;
  item_id: ItemId | null;
  /** The amount field's text, read with `parseAmount`. */
  qty: string;
  include: boolean;
}

function lineFor(status: IngredientStatus, item: PantryItem | undefined): CookLine {
  if (!item) return { status, item_id: null, qty: '1', include: false };
  const qty = status.ingredient.qty;
  const wanted = qty && qty.unit === item.unit ? qty.amount : 1;
  const inStock = item.amount > 0;
  return {
    status,
    item_id: item.id,
    qty: amountField(inStock ? Math.min(wanted, item.amount) : wanted, item.unit),
    include: inStock
  };
}

export function planCook(ingredients: readonly Ingredient[], lookup: PantryLookup): CookLine[] {
  return ingredients.map((ingredient) => {
    const status = ingredientStatus(ingredient, lookup);
    return lineFor(status, status.match.kind === 'item' ? status.match.item : undefined);
  });
}

export function chooseItem(line: CookLine, id: ItemId | null, lookup: PantryLookup): CookLine {
  return lineFor(line.status, id ? lookup.byId(id) : undefined);
}

export type UseLine = { id: ItemId; qty: number };

export type CookCheck = { ok: true; uses: UseLine[] } | { ok: false; problem: string };

export function checkCook(lines: readonly CookLine[], lookup: PantryLookup): CookCheck {
  const totals = new Map<ItemId, number>();
  for (const line of lines) {
    if (!line.include || !line.item_id) continue;
    const qty = parseAmount(line.qty);
    if (qty === null) return { ok: false, problem: 'Enter an amount like 2, 0.5 or 1/3, or uncheck the ingredient.' };
    // Zero means used, but too little to count, such as a pinch of salt.
    if (qty === 0) continue;
    const item = lookup.byId(line.item_id);
    if (!item) return { ok: false, problem: 'An ingredient is no longer at home. Uncheck it or reopen this recipe.' };
    const total = (totals.get(item.id) ?? 0) + qty;
    if (snapUse(total, item.amount, item.unit) > item.amount)
      return {
        ok: false,
        problem: `Only ${formatAmount(item.amount, item.unit)} ${item.name} at home. Reduce the quantity or uncheck it.`
      };
    totals.set(item.id, total);
  }
  return { ok: true, uses: [...totals].map(([id, qty]) => ({ id, qty })) };
}

/** The add-ingredient form. `unit` applies only to a typed name; a picked item brings its own. */
export interface IngredientDraft {
  name: string;
  item_id: ItemId | null;
  amount: string;
  unit: Unit;
}

export type IngredientCheck =
  | { ok: true; ingredient: Ingredient; use: UseLine | null }
  | { ok: false; problem: string };

export interface IngredientEntry {
  ingredient: Ingredient;
  uses: readonly CommandId[];
}

/** What the entry took from home, which a change puts back before taking the new amount. */
export function takenBy(entry: IngredientEntry | undefined): Quantity | null {
  return entry && entry.uses.length > 0 ? entry.ingredient.qty : null;
}

/**
 * A blank amount, or zero, records the ingredient as used but too little to count, and deducts nothing.
 * With `changing`, what that entry took of the item counts as at home.
 */
export function checkIngredient(
  draft: IngredientDraft,
  lookup: PantryLookup,
  changing?: IngredientEntry
): IngredientCheck {
  const name = tidy(draft.name);
  if (!name) return { ok: false, problem: 'Pick an item or type a name.' };
  const amount = draft.amount.trim() ? parseAmount(draft.amount) : 0;
  if (amount === null) return { ok: false, problem: 'Enter an amount like 2, 0.5 or 1/3, or leave it blank.' };
  if (!draft.item_id) {
    return {
      ok: true,
      ingredient: { name, item_id: null, qty: amount > 0 ? { amount, unit: draft.unit } : null },
      use: null
    };
  }
  const item = lookup.byId(draft.item_id);
  if (!item) return { ok: false, problem: `${name} is no longer at home. Pick it again or type a name.` };
  const taken = takenBy(changing);
  const back = taken?.unit === item.unit ? taken.amount : 0;
  const available = roundAmount(item.amount + back);
  if (snapUse(amount, available, item.unit) > available) {
    const counting = back > 0 ? `, counting the ${formatAmount(back, item.unit)} this meal took` : '';
    return {
      ok: false,
      problem: `Only ${formatAmount(available, item.unit)} ${item.name} at home${counting}. Reduce the amount.`
    };
  }
  if (amount === 0) return { ok: true, ingredient: { name, item_id: item.id, qty: null }, use: null };
  return {
    ok: true,
    ingredient: { name, item_id: item.id, qty: { amount, unit: item.unit } },
    use: { id: item.id, qty: amount }
  };
}
