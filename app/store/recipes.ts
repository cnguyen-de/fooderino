export const useRecipeStore = defineStore('recipes', () => {
  const pantry = usePantry();
  const repo = useRecipes();

  const hasIngredients = (name: string) =>
    pantry.search(name).some((hit) => hit.match === 'exact' && hit.via !== 'tag' && hit.item.amount > 0);

  return {
    recipes: repo.recipes,
    savedRecipes: repo.savedRecipes,
    insertRecipe: repo.add,
    updateRecipe: repo.update,
    deleteRecipe: repo.remove,
    recipeById: repo.byId,
    hasIngredients
  };
});
