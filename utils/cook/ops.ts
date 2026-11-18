import type { CommandId, HouseholdId, Instant, Item, ItemId, LocalDate } from '~~/types/pantry';
import type { CookedId, CookedSheet, Ingredient, RecipeId, RecipeKind, RecipeSheet } from '~~/types/cook';
import type { PendingSheet, SheetRows, SheetStore } from '~~/types/sync';
import { SYNC_STATE_KEY, type FooderinoDb } from '~~/utils/db';
import type { PantryOps } from '~~/utils/pantry-ops';
import { buildSearchIndex, newId, resolveItem, tidy } from '~~/utils/pantry';
import { projectPantry, readDeviceRows } from '~~/utils/pantry-projection';
import { stampAbove } from '~~/utils/sheets';
import { ingredientStatus, type PantryLookup, type UseLine } from './match';

export interface RecipeInput {
  id?: RecipeId;
  name: string;
  kind: RecipeKind;
  ingredients: readonly Ingredient[];
  instructions: string;
}

export interface CookOps {
  /** Tidies names, drops blank ingredient rows, and turns an amount of zero or less into "some". RangeError on a blank name. */
  saveRecipe(input: RecipeInput): Promise<RecipeId>;
  deleteRecipe(id: RecipeId): Promise<void>;
  /**
   * Deducts `uses` and records the dish in one transaction. Throws, recording nothing,
   * when the pantry refuses the deduction, so a dish never lands without what the cook confirmed.
   */
  cook(input: { recipe: RecipeId; date: LocalDate; uses: readonly UseLine[] }): Promise<CookedId>;
  /** Removes the dish from its meal; `restock` also undoes the `use` commands it queued. */
  removeDish(id: CookedId, opts: { restock: boolean }): Promise<void>;
  /** Lists out or short items; untracked names become new count items to buy. Resolves with how many were listed. */
  addMissingToShopping(id: RecipeId): Promise<number>;
}

export interface CookOpsOptions {
  db: FooderinoDb;
  pantry: PantryOps;
  /** Called after every write that queued a sheet, to wake the sync engine. */
  notify?: () => void;
  now?: () => Date;
}

/** The same wiring as usePantry: merge-resolving `byId`, search hits mapped to live items. */
function lookupOf(items: ReadonlyMap<ItemId, Item>): PantryLookup {
  const index = buildSearchIndex([...items.values()]);
  const byId = (id: ItemId) => resolveItem(items, id);
  return {
    byId,
    search: (q) =>
      index(q).flatMap((hit) => {
        const item = byId(hit.item_id);
        return item ? [{ ...hit, item }] : [];
      })
  };
}

function tidyIngredients(ingredients: readonly Ingredient[]): Ingredient[] {
  return ingredients.flatMap((i) => {
    const name = tidy(i.name);
    if (!name) return [];
    const amount = Number(i.qty?.amount);
    return [{ name, item_id: i.item_id, qty: i.qty && amount > 0 ? { amount, unit: i.qty.unit } : null }];
  });
}

export function createCookOps({ db, pantry, notify = () => {}, now = () => new Date() }: CookOpsOptions): CookOps {
  const at = () => now().toISOString() as Instant;

  async function household(): Promise<HouseholdId> {
    const id = (await db.syncState.get(SYNC_STATE_KEY))?.household_id;
    if (!id) throw new Error('This device holds no household yet');
    return id;
  }

  /** The row as the device shows it: the queued sheet when there is one, else the confirmed row. */
  async function current<S extends 'recipes' | 'cooked'>(store: S, id: RecipeId | CookedId): Promise<SheetRows[S] | undefined> {
    const pending = (await db.edits.get(id)) as PendingSheet<S> | undefined;
    if (pending) {
      const { store: _, updated_at: __, ...sheet } = pending;
      return sheet as unknown as SheetRows[S];
    }
    const row = await db.table(store).get(id);
    if (!row) return undefined;
    const { seq: _, updated_at: __, ...sheet } = row;
    return sheet;
  }

  /** Queues a whole sheet stamped above every stamp the device holds for the row. Joins the caller's transaction. */
  async function queue<S extends 'recipes' | 'cooked'>(store: S, sheet: SheetRows[S]): Promise<void> {
    const [confirmed, pending] = await Promise.all([db.table(store).get(sheet.id), db.edits.get(sheet.id)]);
    const updated_at = stampAbove(at(), confirmed?.updated_at, pending?.updated_at);
    await db.edits.put({ ...sheet, store, updated_at } as PendingSheet<SheetStore>);
  }

  const sheetTables = (store: 'recipes' | 'cooked') => [db.syncState, db.edits, db.table(store)];
  // Every table pantry-ops opens, so its own transaction nests inside this one.
  const pantryTables = () => [db.items, db.bag, db.log, db.commands, db.edits, db.syncState, db.cooked];

  return {
    async saveRecipe(input) {
      const name = tidy(input.name);
      if (!name) throw new RangeError('Give the recipe a name.');
      const id = input.id ?? newId<RecipeId>();
      await db.transaction('rw', sheetTables('recipes'), async () => {
        const sheet: RecipeSheet = {
          id,
          household_id: await household(),
          name,
          kind: input.kind,
          ingredients: tidyIngredients(input.ingredients),
          instructions: input.instructions.trim(),
          deleted_at: null
        };
        await queue('recipes', sheet);
      });
      notify();
      return id;
    },

    async deleteRecipe(id) {
      const queued = await db.transaction('rw', sheetTables('recipes'), async () => {
        const recipe = await current('recipes', id);
        if (!recipe || recipe.deleted_at) return false;
        await queue('recipes', { ...recipe, deleted_at: at() });
        return true;
      });
      if (queued) notify();
    },

    async cook({ recipe, date, uses }) {
      const id = newId<CookedId>();
      await db.transaction('rw', pantryTables(), async () => {
        const handle = uses.length > 0 ? await pantry.useItems(uses) : null;
        const sheet: CookedSheet = {
          id,
          household_id: await household(),
          recipe_id: recipe,
          date,
          uses: handle?.commands.map((c) => c.id) ?? [],
          deleted_at: null
        };
        await queue('cooked', sheet);
      });
      notify();
      return id;
    },

    async removeDish(id, { restock }) {
      const queued = await db.transaction('rw', pantryTables(), async () => {
        const dish = await current('cooked', id);
        if (!dish || dish.deleted_at) return false;
        if (restock && dish.uses.length > 0) await pantry.undoCommands(dish.uses as CommandId[]);
        await queue('cooked', { ...dish, deleted_at: at() });
        return true;
      });
      if (queued) notify();
    },

    async addMissingToShopping(id) {
      const recipe = await current('recipes', id);
      if (!recipe || recipe.deleted_at) return 0;
      const lookup = lookupOf(projectPantry(await readDeviceRows(db, { events: false })).snapshot.items);
      let listed = 0;
      for (const ingredient of recipe.ingredients) {
        const { match, stock } = ingredientStatus(ingredient, lookup);
        const qty = ingredient.qty;
        if (match.kind === 'item' && (stock === 'out' || stock === 'short')) {
          const item = match.item;
          if (item.to_buy > 0) continue;
          const missing = qty && qty.unit === item.unit ? qty.amount - item.amount : undefined;
          if (await pantry.addToShopping(item.id, missing)) listed++;
        } else if (match.kind === 'none') {
          const to_buy = qty?.unit === 'count' ? qty.amount : 1;
          if (await pantry.createItem({ name: ingredient.name, unit: 'count', to_buy })) listed++;
        }
      }
      return listed;
    }
  };
}
