import type { Recipe } from '~~/types/Recipe';
import { useItemStore } from './item';
import { useListStore } from './list';

interface State {
  recipes: Recipe[];
  generating: boolean;
}
export const useRecipeStore = defineStore('recipes', () => {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();
  const itemStore = useItemStore();
  const listStore = useListStore();
  const state = reactive<State>({
    recipes: [],
    generating: false
  });

  const generateRecipe = async (useHasIngredients: boolean) => {
    state.generating = true;
    const { data } = await useFetch('/api/recipe', {
      query: {
        useHasIngredients,
        listId: listStore.selectedList?.id
      }
    });
    if (!data.value) return;
    await insertRecipe(data.value);
    state.recipes?.unshift(data.value);
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

  const fetchRecipes = async () => {
    const { data } = await supabase.from('recipes').select().eq('id', user.value?.id);
    state.recipes = data;
  };

  const savedRecipes = computed(() => state.recipes?.filter((r) => r.saved));
  const generatedRecipes = computed(() => state.recipes?.filter((r) => !r.saved));

  const hasIngredients = (ingredient: string) => {
    //check if ingredient is part of the inventoryItems array, ignore cases and accents in text
    return itemStore.inventoryItems.some((item) =>
      item.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .includes(
          ingredient
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
        )
    );
  };
  return {
    ...toRefs(state),
    generateRecipe,
    insertRecipe,
    fetchRecipes,

    // Getters
    savedRecipes,
    generatedRecipes,
    hasIngredients
  };
});
