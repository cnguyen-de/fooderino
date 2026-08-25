<script setup lang="ts">
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
    if (recipeStore.hasIngredients(ingredient.name)) {
      return;
    }
    const item = { ...ingredient, amount_to_purchase: ingredient.amount };
    delete item.amount;
    itemStore.insertItem(item);
  });
  toast('Added ingredients to buy list');
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
    :hide-add-to-cart="!listStore.selectedList"
    @save-recipe="onSaveRecipe($event)"
    @add-recipe-ingredients-to-buy="onAddRecipeIngredientsToBuy($event)"
    @delete="onDeleteRecipe($event)"
    :hide-delete="false"></RecipeCard>
</template>

<style scoped></style>
