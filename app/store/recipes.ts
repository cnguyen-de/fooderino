import type { Recipe } from '~~/types/Recipe';

interface State {
  recipes: Recipe[];
  generating: boolean;
}
// TODO: ACCEPT BODY PARAMS FOR OVERRIDING PREFS AND KNOWN RECIPES
export const useRecipeStore = defineStore('recipes', () => {
  const supabase = useSupabaseClient();
  const user = useSupabaseUser();
  const state = reactive<State>({
    recipes: null,
    generating: false
  });

  const generateRecipe = async () => {
    state.generating = true;
    console.log(state.recipes);
    const { data } = await useFetch('/api/recipe', {
      query: { recipes: state.recipes.map((r) => r.name).join(', ') }
    });
    await insertRecipe(data.value);
    state.recipes.unshift(data.value);
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

  return {
    ...toRefs(state),
    generateRecipe,
    insertRecipe,
    fetchRecipes
  };
});
