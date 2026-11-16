import { useItemStore } from './item';

export const useRecipeStore = defineStore('recipes', () => {
  const itemStore = useItemStore();
  const repo = useRecipes();

  const hasIngredients = (ingredient: string) => {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
    return itemStore.inventoryItems.some(
      (item) => normalize(item.name).includes(normalize(ingredient)) && item.amount > 0
    );
  };

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
