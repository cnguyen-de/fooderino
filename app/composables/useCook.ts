import { liveQuery } from 'dexie';
import { toast } from 'vue-sonner';
import type { ComputedRef, Ref } from 'vue';
import type { CookedId, CookedRow, RecipeId, RecipeRow } from '~~/types/cook';
import type { ItemId, LocalDate } from '~~/types/pantry';
import {
  buildMeals,
  buildRecipeViews,
  checkCook,
  chooseItem,
  createCookOps,
  mealNeeds,
  planCook,
  suggestFor,
  type CookCheck,
  type CookLine,
  type Meal,
  type MealSuggestions,
  type PantryLookup,
  type RecipeInput,
  type RecipeView
} from '~~/utils/cook';
import { db, SYNC_STATE_KEY } from '~~/utils/db';
import { overlaySheets, pendingSheets } from '~~/utils/sheets';
import { notifyLocalChange } from '~~/utils/sync-hook';
import type { SearchResult } from './usePantry';

export type { CookLine, Meal, MealDish, MealSuggestions, RecipeView, Suggestion } from '~~/utils/cook';
export type { RecipeInput } from '~~/utils/cook';
export type * from '~~/types/cook';

type Shown<R> = Omit<R, 'seq'>;
interface CookRows {
  recipes: Shown<RecipeRow>[];
  cooked: Shown<CookedRow>[];
}

// Module-level, like usePantry: one live subscription shared by every Cook page.
const rows = shallowRef<CookRows | null>(null);
let started = false;

async function readCookRows(): Promise<CookRows> {
  return db.transaction('r', [db.syncState, db.recipes, db.cooked, db.edits], async () => {
    const household = (await db.syncState.get(SYNC_STATE_KEY))?.household_id ?? null;
    const [recipes, cooked, pendingRecipes, pendingCooked] = await Promise.all([
      db.recipes.toArray(),
      db.cooked.toArray(),
      pendingSheets(db, 'recipes'),
      pendingSheets(db, 'cooked')
    ]);
    const mine = <T extends { household_id: string }>(list: T[]) => list.filter((r) => r.household_id === household);
    return {
      recipes: [...overlaySheets(mine(recipes), mine(pendingRecipes)).values()],
      cooked: [...overlaySheets(mine(cooked), mine(pendingCooked)).values()]
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
  /** Every date with at least one dish, newest first. */
  meals: ComputedRef<readonly Meal[]>;
  today: Readonly<Ref<LocalDate>>;
  /** Today's meal, empty until something is cooked. */
  todayMeal: ComputedRef<Meal>;
  /** What to cook today: soups while the meal lacks one, dishes until it has enough. */
  suggestions: ComputedRef<MealSuggestions>;
  /** Combobox options for an ingredient: pantry search hits with what is at home. */
  ingredientOptions(query: string): readonly SearchResult[];
  plan(id: RecipeId): CookLine[];
  /** The line after picking one of several matching items. */
  choose(line: CookLine, id: ItemId | null): CookLine;
  check(lines: readonly CookLine[]): CookCheck;

  // Writes toast on failure and resolve with a falsy value; adding a dish toasts with Undo.
  saveRecipe(input: RecipeInput): Promise<RecipeId | null>;
  deleteRecipe(id: RecipeId): Promise<boolean>;
  addToMeal(id: RecipeId, date: LocalDate, lines: readonly CookLine[]): Promise<boolean>;
  removeDish(id: CookedId, opts: { restock: boolean }): Promise<boolean>;
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
    buildMeals(rows.value?.cooked ?? [], new Map((rows.value?.recipes ?? []).map((r) => [r.id, r])))
  );
  const todayMeal = computed<Meal>(
    () => meals.value.find((m) => m.date === today.value) ?? { date: today.value, dishes: [], needs: mealNeeds([]) }
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

  return {
    recipes,
    recipe: (id) => byId.value.get(id),
    meals,
    today,
    todayMeal,
    suggestions,
    ingredientOptions: search,
    plan: (id) => planCook(byId.value.get(id)?.ingredients ?? [], lookup),
    choose: (line, id) => chooseItem(line, id, lookup),
    check: (lines) => checkCook(lines, lookup),

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
        toast(date === today.value ? `Added ${name} to today` : `Added ${name} to ${date}`, {
          action: { label: 'Undo', onClick: () => void removeDish(dish, { restock: true }) }
        });
        return true;
      } catch (e) {
        failed(e, 'Could not add the dish.');
        return false;
      }
    },

    removeDish,

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
