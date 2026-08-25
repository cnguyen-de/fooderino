import { toast } from 'vue-sonner';
import { useItemStore } from './item';
import { useListStore } from './list';
import { useSettingsStore } from './settings';

export const useRecipeStore = defineStore('recipes', () => {
  const itemStore = useItemStore();
  const listStore = useListStore();
  const settingStore = useSettingsStore();
  const repo = useRecipes();
  const generating = ref(false);

  const generateRecipe = async (useHasIngredients: boolean, request: string) => {
    generating.value = true;
    try {
      const generated = await $fetch('/api/recipe', {
        query: { useHasIngredients, request, listId: listStore.selectedList?.id }
      });
      await repo.add({
        name: generated.name,
        description: generated.description ?? null,
        ingredients: generated.ingredients ?? [],
        instructions: generated.instructions ?? null,
        saved: false
      });
      await settingStore.fetchQuota();
    } catch (e: any) {
      toast(e?.data?.message || 'Failed to generate recipe');
    } finally {
      generating.value = false;
    }
  };

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
    generating,
    savedRecipes: repo.savedRecipes,
    generatedRecipes: repo.generatedRecipes,
    generateRecipe,
    insertRecipe: repo.add,
    updateRecipe: repo.update,
    deleteRecipe: repo.remove,
    recipeById: repo.byId,
    hasIngredients
  };
});
