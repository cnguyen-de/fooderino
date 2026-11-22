import { liveQuery } from 'dexie';
import { toast } from 'vue-sonner';
import type { ComputedRef, Ref } from 'vue';
import type {
  CookedId,
  CookedRow,
  MealIngredientId,
  MealIngredientRow,
  Quantity,
  RecipeId,
  RecipeRow
} from '~~/types/cook';
import type { ItemId, LocalDate } from '~~/types/pantry';
import {
  buildMeals,
  buildRecipeViews,
  checkCook,
  checkIngredient,
  chooseItem,
  createCookOps,
  mealNeeds,
  planCook,
  suggestFor,
  type CookCheck,
  type CookLine,
  type IngredientCheck,
  type IngredientDraft,
  type Meal,
  type MealIngredient,
  type MealSuggestions,
  type PantryLookup,
  type RecipeInput,
  type RecipeView
} from '~~/utils/cook';
import { db, SYNC_STATE_KEY } from '~~/utils/db';
import { normName } from '~~/utils/pantry';
import { addedText, qtyText } from '~/utils/cook-format';
import { overlaySheets, pendingSheets } from '~~/utils/sheets';
import { notifyLocalChange } from '~~/utils/sync-hook';

export type {
  CookLine,
  IngredientDraft,
  Meal,
  MealDish,
  MealIngredient,
  MealSuggestions,
  RecipeView,
  Suggestion
} from '~~/utils/cook';
export type { RecipeInput } from '~~/utils/cook';
export type * from '~~/types/cook';

type Shown<R> = Omit<R, 'seq'>;
interface CookRows {
  recipes: Shown<RecipeRow>[];
  cooked: Shown<CookedRow>[];
  mealIngredients: Shown<MealIngredientRow>[];
}

const rows = shallowRef<CookRows | null>(null);
let started = false;

async function readCookRows(): Promise<CookRows> {
  return db.transaction('r', [db.syncState, db.recipes, db.cooked, db.mealIngredients, db.edits], async () => {
    const household = (await db.syncState.get(SYNC_STATE_KEY))?.household_id ?? null;
    const [recipes, cooked, mealIngredients, pendingRecipes, pendingCooked, pendingIngredients] = await Promise.all([
      db.recipes.toArray(),
      db.cooked.toArray(),
      db.mealIngredients.toArray(),
      pendingSheets(db, 'recipes'),
      pendingSheets(db, 'cooked'),
      pendingSheets(db, 'mealIngredients')
    ]);
    const mine = <T extends { household_id: string }>(list: T[]) => list.filter((r) => r.household_id === household);
    return {
      recipes: [...overlaySheets(mine(recipes), mine(pendingRecipes)).values()],
      cooked: [...overlaySheets(mine(cooked), mine(pendingCooked)).values()],
      mealIngredients: [...overlaySheets(mine(mealIngredients), mine(pendingIngredients)).values()]
    };
  });
}

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  liveQuery(readCookRows).subscribe({
    next: (next) => {
      rows.value = next;
    },
    error: (e) => console.error('useCook:', e)
  });
}

export interface Cook {
  /** Live recipes by name, with stock and the last date eaten. */
  recipes: ComputedRef<readonly RecipeView[]>;
  recipe(id: RecipeId): RecipeView | undefined;
  /** Every date with at least one dish or ingredient, newest first. */
  meals: ComputedRef<readonly Meal[]>;
  today: Readonly<Ref<LocalDate>>;
  todayMeal: ComputedRef<Meal>;
  suggestions: ComputedRef<MealSuggestions>;
  plan(id: RecipeId): CookLine[];
  choose(line: CookLine, id: ItemId | null): CookLine;
  check(lines: readonly CookLine[]): CookCheck;
  checkIngredient(draft: IngredientDraft, changing?: MealIngredient): IngredientCheck;
  /** Live recipes whose name contains `query`, at most six. None for a blank query. */
  findRecipes(query: string): RecipeView[];

  saveRecipe(input: RecipeInput): Promise<RecipeId | null>;
  deleteRecipe(id: RecipeId): Promise<boolean>;
  addToMeal(id: RecipeId, date: LocalDate, lines: readonly CookLine[]): Promise<boolean>;
  removeDish(id: CookedId, opts: { restock: boolean }): Promise<boolean>;
  addIngredient(date: LocalDate, draft: IngredientDraft): Promise<boolean>;
  removeIngredient(id: MealIngredientId, opts: { restock: boolean }): Promise<boolean>;
  changeIngredient(entry: MealIngredient, draft: IngredientDraft): Promise<boolean>;
  addMissingToShopping(id: RecipeId): Promise<boolean>;
  ready: ComputedRef<boolean>;
}

const failed = (e: unknown, fallback: string) => {
  toast.error(e instanceof Error ? e.message : fallback);
};

export function useCook(): Cook {
  ensureStarted();
  const pantry = usePantry();
  const { view, search, today } = pantry;
  const lookup: PantryLookup = { byId: (id) => view.value.byId(id), search };
  const ops = createCookOps({ db, pantry: pantry.ops, notify: () => notifyLocalChange('pantry') });

  const recipes = computed(() => buildRecipeViews(rows.value?.recipes ?? [], rows.value?.cooked ?? [], lookup));
  const byId = computed(() => new Map(recipes.value.map((r) => [r.id, r])));
  const meals = computed(() =>
    buildMeals(
      rows.value?.cooked ?? [],
      new Map((rows.value?.recipes ?? []).map((r) => [r.id, r])),
      rows.value?.mealIngredients ?? []
    )
  );
  const todayMeal = computed<Meal>(
    () =>
      meals.value.find((m) => m.date === today.value) ?? {
        date: today.value,
        dishes: [],
        ingredients: [],
        needs: mealNeeds([])
      }
  );
  const suggestions = computed(() =>
    suggestFor({
      recipes: recipes.value,
      meals: meals.value,
      today: today.value,
      useSoon: new Set(view.value.home.useSoon.map((e) => e.item.id))
    })
  );

  async function removeDish(id: CookedId, opts: { restock: boolean }) {
    try {
      await ops.removeDish(id, opts);
      toast(opts.restock ? 'Removed the dish and put its ingredients back' : 'Removed the dish');
      return true;
    } catch (e) {
      failed(e, 'Could not remove the dish.');
      return false;
    }
  }

  async function removeIngredient(id: MealIngredientId, opts: { restock: boolean }) {
    try {
      await ops.removeIngredient(id, opts);
      toast(opts.restock ? 'Removed the ingredient and put it back' : 'Removed the ingredient');
      return true;
    } catch (e) {
      failed(e, 'Could not remove the ingredient.');
      return false;
    }
  }

  async function setAmount(id: MealIngredientId, name: string, qty: Quantity | null, before: Quantity | null) {
    try {
      await ops.changeIngredient(id, qty);
      toast(`Changed ${name} to ${qtyText(qty)}`, {
        action: { label: 'Undo', onClick: () => void setAmount(id, name, before, qty) }
      });
      return true;
    } catch (e) {
      failed(e, 'Could not change the amount.');
      return false;
    }
  }

  return {
    recipes,
    recipe: (id) => byId.value.get(id),
    meals,
    today,
    todayMeal,
    suggestions,
    plan: (id) => planCook(byId.value.get(id)?.ingredients ?? [], lookup),
    choose: (line, id) => chooseItem(line, id, lookup),
    check: (lines) => checkCook(lines, lookup),
    checkIngredient: (draft, changing) => checkIngredient(draft, lookup, changing),
    findRecipes(query) {
      const q = normName(query);
      return q ? recipes.value.filter((r) => normName(r.name).includes(q)).slice(0, 6) : [];
    },

    async saveRecipe(input) {
      try {
        const id = await ops.saveRecipe(input);
        toast('Recipe saved');
        return id;
      } catch (e) {
        failed(e, 'Could not save the recipe.');
        return null;
      }
    },

    async deleteRecipe(id) {
      try {
        await ops.deleteRecipe(id);
        toast('Recipe deleted');
        return true;
      } catch (e) {
        failed(e, 'Could not delete the recipe.');
        return false;
      }
    },

    async addToMeal(id, date, lines) {
      const checked = checkCook(lines, lookup);
      if (!checked.ok) {
        toast.error(checked.problem);
        return false;
      }
      try {
        const dish = await ops.cook({ recipe: id, date, uses: checked.uses });
        const name = byId.value.get(id)?.name ?? 'the dish';
        toast(addedText(name, date, today.value), {
          action: { label: 'Undo', onClick: () => void removeDish(dish, { restock: true }) }
        });
        return true;
      } catch (e) {
        failed(e, 'Could not add the dish.');
        return false;
      }
    },

    removeDish,

    async addIngredient(date, draft) {
      const checked = checkIngredient(draft, lookup);
      if (!checked.ok) {
        toast.error(checked.problem);
        return false;
      }
      try {
        const id = await ops.addIngredient({ date, ingredient: checked.ingredient, use: checked.use });
        const name = checked.ingredient.name;
        toast(addedText(name, date, today.value), {
          action: { label: 'Undo', onClick: () => void removeIngredient(id, { restock: true }) }
        });
        return true;
      } catch (e) {
        failed(e, 'Could not add the ingredient.');
        return false;
      }
    },

    removeIngredient,

    async changeIngredient(entry, draft) {
      const checked = checkIngredient(draft, lookup, entry);
      if (!checked.ok) {
        toast.error(checked.problem);
        return false;
      }
      return setAmount(entry.id, checked.ingredient.name, checked.ingredient.qty, entry.ingredient.qty);
    },

    async addMissingToShopping(id) {
      try {
        const listed = await ops.addMissingToShopping(id);
        toast(listed ? `Listed ${listed} ingredient${listed === 1 ? '' : 's'}` : 'Nothing missing to list');
        return true;
      } catch (e) {
        failed(e, 'Could not list the ingredients.');
        return false;
      }
    },

    ready: computed(() => rows.value !== null && pantry.ready.value)
  };
}
