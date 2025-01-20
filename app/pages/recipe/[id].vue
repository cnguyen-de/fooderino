<script setup lang="ts">
import { useItemStore } from '~/store/item';
import { useRecipeStore } from '~/store/recipes';
import { toast } from 'vue-sonner';
import type { Recipe, Ingredient } from '~~/types/Recipe';

const recipeStore = useRecipeStore();
const itemStore = useItemStore();
const id = useRoute().params.id;
const router = useRouter();
watch(
  () => id,
  () => recipeStore.fetchRecipeById(id),
  { immediate: true }
);
const recipe = computed(() => (recipeStore.recipeMap[id]?.length > 0 ? recipeStore.recipeMap[id][0] : null));
const onSaveRecipe = async (recipe: Recipe) => {
  delete recipe.id;
  delete recipe.index;
  recipe.saved = true;
  await recipeStore.insertRecipe(recipe);
  router.push('/recipe');
};

const onAddRecipeIngredientsToBuy = async (recipe: Recipe) => {
  recipe.ingredients.forEach((ingredient: Ingredient) => {
    if (recipeStore.hasIngredients(ingredient.name)) {
      return;
    }
    const item = { ...ingredient, amount_to_purchase: ingredient.amount };
    delete item.amount;
    itemStore.insertItem(item);
  });
  toast('Added ingredients to buy list');
};
</script>

<template>
  <NuxtLayout name="app">
    <div class="relative h-full w-full">
      <div class="h-[calc(100%_-_4rem)] w-full overflow-auto p-4">
        <RecipeCard
          v-if="recipe"
          :recipe="recipe"
          @save-recipe="onSaveRecipe($event)"
          @add-recipe-ingredients-to-buy="onAddRecipeIngredientsToBuy($event)"
          hide-delete></RecipeCard>

        <div v-else>
          <p>Recipe not found</p>
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>
