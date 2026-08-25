<script setup lang="ts">
// Basically copy of RecipeList, make composable or layout component instead
import { useRecipeStore } from '~/store/recipes';
import { useItemStore } from '~/store/item';
import { toast } from 'vue-sonner';
import { useListStore } from '~/store/list';
import type { RecipeRecord } from '~~/types/sync';
const recipeStore = useRecipeStore();
const itemStore = useItemStore();
const listStore = useListStore();
// No fetch: `useRecipes()` subscribes to Dexie and the sync engine keeps it fed.

const onAddRecipeIngredientsToBuy = (recipe: RecipeRecord) => {
  recipe.ingredients.forEach((ingredient) => {
    const item = { ...ingredient, amount_to_purchase: ingredient.amount };
    delete item.amount;
    itemStore.insertItem(item);
  });
  toast('Added ingredients to buy list');
};

// The legacy handler passed the recipe through unchanged, so `saved` stayed
// false and a generated recipe could never actually be kept.
const onSaveRecipe = (recipe: RecipeRecord) => {
  if (!recipe.saved) {
    recipeStore.updateRecipe(recipe.id, { saved: true });
  }
};

const onDeleteRecipe = (recipe: RecipeRecord) => {
  toast(`Deleted ${recipe?.name}`);
  recipeStore.deleteRecipe(recipe.id);
};
</script>

<template>
  <RecipeCard
    :recipe="recipe"
    v-for="recipe of recipeStore.generatedRecipes"
    :hide-add-to-cart="!listStore.selectedList"
    @save-recipe="onSaveRecipe($event)"
    @add-recipe-ingredients-to-buy="onAddRecipeIngredientsToBuy($event)"
    @delete="onDeleteRecipe($event)"></RecipeCard>
</template>

<style scoped></style>
