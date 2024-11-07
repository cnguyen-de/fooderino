import type { Recipe } from '~~/types/Recipe';

interface State {
  recipes: Recipe[];
}
export const useRecipeStore = defineStore('recipes', () => {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();
  const state = reactive<State>({
    recipes: null
  });

  const generateRecipe = async () => {
    const { data } = await useFetch('/api/recipe');
    state.recipes.unshift(data.value);
  };

  const insertRecipe = async (recipe: Recipe) => {
    const { data } = await supabase.from('recipes').insert({ ...recipe, id: user.value?.id });
  };

  const fetchRecipes = async () => {
    const { data } = await supabase.from('recipes').select().eq('id', user.value?.id);
    state.recipes = data;
  };

  return {
    ...toRefs(state),
    generateRecipe,
    insertRecipe,
    fetchRecipes
  };
});
