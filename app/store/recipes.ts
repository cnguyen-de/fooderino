import type { Recipe } from '~~/types/Recipe';
import { useItemStore } from './item';
import { useListStore } from './list';
import recipe from '~~/server/api/recipe';
import { toast } from 'vue-sonner';
import { useSettingsStore } from './settings';

interface State {
  recipes: Recipe[];
  generating: boolean;
  recipeMap: Record<string, Recipe>;
}
export const useRecipeStore = defineStore('recipes', () => {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();
  const itemStore = useItemStore();
  const listStore = useListStore();
  const settingStore = useSettingsStore();
  const state = reactive<State>({
    recipes: [],
    generating: false,
    recipeMap: {}
  });

  const generateRecipe = async (useHasIngredients: boolean, request: string) => {
    state.generating = true;
    const { data, error } = await useFetch('/api/recipe', {
      query: {
        useHasIngredients,
        request,
        listId: listStore.selectedList?.id
      },
      onResponseError({ request, response, options }) {
        toast(response._data?.message || 'Failed to generate recipe');
        state.generating = false;
      }
    });
    if (error.value) {
      return;
    }
    await insertRecipe(data.value);
    state.recipes?.unshift(data.value);
    await settingStore.fetchSettings();
    state.generating = false;
  };
  const insertRecipe = async (recipe: Recipe) => {
    const recipes = [...state.recipes];
    const r = recipes.find((r) => r.name === recipe.name);
    if (r) {
      r.saved = true;
    }
    state.recipes = [...recipes];
    const { data } = await supabase.from('recipes').insert({ ...recipe, id: user.value?.id });
  };
  const updateRecipe = async (recipe: Recipe) => {
    const { data } = await supabase.from('recipes').update({ saved: true }).eq('index', recipe.index);
    await fetchRecipes();
  };

  const fetchRecipes = async () => {
    const { data } = await supabase.from('recipes').select().eq('id', user.value?.id);
    state.recipes = data;
  };

  const fetchRecipeById = async (index: string) => {
    const { data } = await supabase.from('recipes').select().eq('index', index);
    state.recipeMap[index] = data;
  };

  const deleteRecipe = async (recipe: Recipe) => {
    const recipes = [...state.recipes];
    const r = recipes.find((r) => r.name === recipe.name);
    if (!r) return;
    recipes.splice(recipes.indexOf(r), 1);
    state.recipes = [...recipes];
    await supabase.from('recipes').delete().eq('index', recipe.index);
  };

  const savedRecipes = computed(() => state.recipes?.filter((r) => r.saved));
  const generatedRecipes = computed(() => state.recipes?.filter((r) => !r.saved));

  const hasIngredients = (ingredient: string) => {
    //check if ingredient is part of the inventoryItems array, ignore cases and accents in text
    return itemStore.inventoryItems.some(
      (item) =>
        item.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .includes(
            ingredient
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
          ) && item.amount > 0
    );
  };
  return {
    ...toRefs(state),
    generateRecipe,
    updateRecipe,
    insertRecipe,
    fetchRecipes,
    deleteRecipe,
    fetchRecipeById,

    // Getters
    savedRecipes,
    generatedRecipes,
    hasIngredients
  };
});
