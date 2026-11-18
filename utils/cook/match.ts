import type { Hit } from '~~/utils/pantry';
import type { ItemId, PantryItem } from '~~/types/pantry';
import type { Ingredient } from '~~/types/cook';

/** A search hit with its live item, the shape `usePantry().search` returns. */
export type PantryHit = Pick<Hit, 'match' | 'via'> & { item: PantryItem };

/** What the cook domain reads from the pantry. `byId` follows merges to the live item. */
export interface PantryLookup {
  byId(id: ItemId): PantryItem | undefined;
  search(name: string): readonly PantryHit[];
}

export type IngredientMatch =
  /** `via: 'link'` when `item_id` resolved, `'name'` when a unique exact name or alias hit stood in. */
  | { kind: 'item'; item: PantryItem; via: 'link' | 'name' }
  | { kind: 'several'; choices: PantryItem[] }
  | { kind: 'none' };

/**
 * How one ingredient stands at home.
 * - `enough`: in stock, covering the recipe amount when the units agree.
 * - `short`: in stock, below the recipe amount in the same unit.
 * - `out`: the item (or every candidate) has none.
 * - `untracked`: no item matches. A staple nobody tracks, neither for nor against.
 */
export type StockLevel = 'enough' | 'short' | 'out' | 'untracked';

/** The one reading of "at home" that the cook sheet, the shopping action and the ranker share. */
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
  return qty && qty.unit === item.unit && item.amount < qty.amount ? 'short' : 'enough';
}

export function ingredientStatus(ingredient: Ingredient, lookup: PantryLookup): IngredientStatus {
  const match = matchIngredient(ingredient, lookup);
  const items = match.kind === 'item' ? [match.item] : match.kind === 'several' ? match.choices : [];
  const stock = items
    .map((item) => levelOf(ingredient, item))
    .reduce<StockLevel>((best, level) => (RANK[level] < RANK[best] ? level : best), 'untracked');
  return { ingredient, match, stock };
}

/** One editable row of the cook sheet. The sheet changes `item_id`, `qty` and `include` only. */
export interface CookLine {
  status: IngredientStatus;
  item_id: ItemId | null;
  qty: number;
  include: boolean;
}

function lineFor(status: IngredientStatus, item: PantryItem | undefined): CookLine {
  if (!item) return { status, item_id: null, qty: 1, include: false };
  const qty = status.ingredient.qty;
  // A recipe's 500 g is not 500 items: across units the cook enters the count, starting at one.
  const wanted = qty && qty.unit === item.unit ? qty.amount : 1;
  const inStock = item.amount > 0;
  return { status, item_id: item.id, qty: inStock ? Math.min(wanted, item.amount) : wanted, include: inStock };
}

/** Starting rows for the cook sheet: matched, pre-filled, and checked only when the item has stock. */
export function planCook(ingredients: readonly Ingredient[], lookup: PantryLookup): CookLine[] {
  return ingredients.map((ingredient) => {
    const status = ingredientStatus(ingredient, lookup);
    return lineFor(status, status.match.kind === 'item' ? status.match.item : undefined);
  });
}

/** The row after the cook picks one of several candidates, or clears the pick with null. */
export function chooseItem(line: CookLine, id: ItemId | null, lookup: PantryLookup): CookLine {
  return lineFor(line.status, id ? lookup.byId(id) : undefined);
}

export type UseLine = { id: ItemId; qty: number };

export type CookCheck = { ok: true; uses: UseLine[] } | { ok: false; problem: string };

/** The sheet's live check. On success, one use per resolved item, ready for `useItems`. */
export function checkCook(lines: readonly CookLine[], lookup: PantryLookup): CookCheck {
  const totals = new Map<ItemId, number>();
  for (const line of lines) {
    if (!line.include || !line.item_id) continue;
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0)
      return { ok: false, problem: 'Enter a quantity greater than zero, or uncheck the ingredient.' };
    const item = lookup.byId(line.item_id);
    if (!item) return { ok: false, problem: 'An ingredient is no longer at home. Uncheck it or reopen this recipe.' };
    const total = (totals.get(item.id) ?? 0) + qty;
    if (total > item.amount)
      return {
        ok: false,
        problem: `Only ${item.amount}${item.unit === 'gram' ? ' g' : ''} ${item.name} at home. Reduce the quantity or uncheck it.`
      };
    totals.set(item.id, total);
  }
  return { ok: true, uses: [...totals].map(([id, qty]) => ({ id, qty })) };
}
