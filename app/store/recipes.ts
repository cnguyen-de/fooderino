interface State {
  recipes: any;
}
export const useRecipeStore = defineStore('recipes', () => {
  const state = reactive<State>({
    recipes: null
  });

  const generateRecipe = async () => {
    const { data } = await useFetch('/api/recipe');
    state.recipes = data.value;
  };

  return {
    ...toRefs(state),
    generateRecipe
  };
});
