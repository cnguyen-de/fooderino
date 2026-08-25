import { liveQuery } from 'dexie';
import { db } from '~~/utils/db';
import { notifyLocalChange } from '~~/utils/sync-hook';
import type { RecipeRecord, RecipeIngredient } from '~~/types/sync';

// Module-level, matching useLists/useLogs: one live subscription shared by
// every component, so data is already populated when a page mounts.
const recipes = ref<RecipeRecord[]>([]);
const loading = ref(true);
let started = false;

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  liveQuery(() => db.recipes.filter((r) => r.deleted_at === null).toArray()).subscribe({
    next: (rows) => {
      recipes.value = rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      loading.value = false;
    },
    error: (e) => {
      loading.value = false;
      console.error('useRecipes:', e);
    }
  });
}

export function useRecipes() {
  onBeforeMount(ensureStarted);
  const user = useSupabaseUser();

  async function add(input: {
    name: string;
    description: string | null;
    ingredients: RecipeIngredient[];
    instructions: string | null;
    saved?: boolean;
  }): Promise<string> {
    const userId = user.value?.id;
    if (!userId) throw new Error('Cannot save a recipe without a signed-in user');

    const recipe: RecipeRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: input.name,
      description: input.description,
      ingredients: input.ingredients,
      instructions: input.instructions,
      saved: input.saved ?? false,
      updated_at: new Date().toISOString(),
      deleted_at: null
    };
    await db.recipes.add(recipe);
    notifyLocalChange('recipes', recipe.id);
    return recipe.id;
  }

  async function update(id: string, patch: Partial<RecipeRecord>): Promise<void> {
    await db.recipes.update(id, { ...patch, updated_at: new Date().toISOString() });
    notifyLocalChange('recipes', id);
  }

  /** Soft delete, so the removal reaches other devices. */
  async function remove(id: string): Promise<void> {
    const now = new Date().toISOString();
    await db.recipes.update(id, { deleted_at: now, updated_at: now });
    notifyLocalChange('recipes', id);
  }

  const savedRecipes = computed(() => recipes.value.filter((r) => r.saved));
  const generatedRecipes = computed(() => recipes.value.filter((r) => !r.saved));
  const byId = (id: string) => computed(() => recipes.value.find((r) => r.id === id) ?? null);

  return { recipes, loading, savedRecipes, generatedRecipes, add, update, remove, byId };
}
