<script setup lang="ts">
import { useRecipeStore } from '~/store/recipes';
import type { RecipeRecord } from '~~/types/sync';
const recipeStore = useRecipeStore();
const { addIngredients } = useRecipeShopping();
const { state: householdState } = useHousehold();
// No fetch: `useRecipes()` subscribes to Dexie and the sync engine keeps it fed.

const onAddRecipeIngredientsToBuy = async (recipe: RecipeRecord) => {
  await addIngredients(recipe.ingredients);
};

// The legacy handler passed the recipe through unchanged, so `saved` stayed
// false and the heart button did nothing. It now writes the flag it implies.
const onSaveRecipe = (recipe: RecipeRecord) => {
  if (!recipe.saved) {
    recipeStore.updateRecipe(recipe.id, { saved: true });
  }
};

const onDeleteRecipe = (recipe: RecipeRecord) => {
  recipeStore.deleteRecipe(recipe.id);
};
</script>

<template>
  <RecipeCard
    :recipe="recipe"
    v-for="recipe of recipeStore.savedRecipes"
    :hide-add-to-cart="householdState.kind !== 'member'"
    @save-recipe="onSaveRecipe($event)"
    @add-recipe-ingredients-to-buy="onAddRecipeIngredientsToBuy($event)"
    @delete="onDeleteRecipe($event)"
    :hide-delete="false"></RecipeCard>
</template>

<style scoped></style>
